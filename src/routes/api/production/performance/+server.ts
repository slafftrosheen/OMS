import {json,error} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {computeProductionPerformance,type PerformanceOrder,type PerformanceStage,
  type ProgressObservation} from '$lib/order/production-performance';

const PAGE=200,MAX=10000,CHUNK=40,LOG_LIMIT=800;
const STATUSES=['CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD'];
export const GET:RequestHandler=async ({locals,url})=>{
 if(!locals.user)throw error(401,'Unauthorized');
 const days=Number(url.searchParams.get('days')??'30');
 if(![7,30,90].includes(days))throw error(400,'Unsupported performance window');
 const now=new Date(),asOf=now.toISOString();
 const cutoff=new Date(now.getTime()-days*86400000).toISOString();
 const db=locals.supabase;
 const orders=new Map<string,PerformanceOrder>();
 // Active work needs full current-stage coverage, not just the last 30 days.
 for(let offset=0;;offset+=PAGE){
   const {data,error:dbError}=await db.from('draft_orders')
     .select('id,po_number,title,client,due_date,status')
     .in('status',STATUSES).order('id',{ascending:true})
     .range(offset,offset+PAGE-1);
   if(dbError)throw error(503,'Active production order lookup failed');
   for(const order of data??[])orders.set(order.id,order);
   if(orders.size>MAX)throw error(503,'Production performance exceeds active order limit');
   if((data??[]).length<PAGE)break;
 }
 const stages=new Map<string,PerformanceStage>();
 const activeIds=[...orders.keys()];
 for(let i=0;i<activeIds.length;i+=CHUNK){
   const ids=activeIds.slice(i,i+CHUNK);
   const {data,error:stageError}=await db.from('order_stages')
     .select('draft_order_id,station,state,estimated_hours,actual_hours,started_at,completed_at,blocked_reason')
     .in('draft_order_id',ids);
   if(stageError)throw error(503,'Active production stage lookup failed');
   if((data??[]).length>=1000)throw error(503,'Stage fanout exceeds supported bound');
   for(const stage of data??[]){
     const key=`${stage.draft_order_id}:${stage.station}`;
     if(stages.has(key))throw error(503,'Duplicate production stage');
     stages.set(key,stage);
   }
 }
 // Historical throughput includes COMPLETED stages from orders that were
 // subsequently dispatched or archived, as long as the signed-in viewer
 // can still read their draft_orders row.
 const completed=new Map<string,PerformanceStage>();
 for(let offset=0;;offset+=PAGE){
   const {data,error:stageError}=await db.from('order_stages')
     .select('draft_order_id,station,state,estimated_hours,actual_hours,started_at,completed_at,blocked_reason')
     .eq('state','COMPLETED').gte('completed_at',cutoff).lte('completed_at',asOf)
     .order('draft_order_id',{ascending:true}).order('station',{ascending:true})
     .range(offset,offset+PAGE-1);
   if(stageError)throw error(503,'Recently completed stages unavailable');
   for(const stage of data??[]){
     const key=`${stage.draft_order_id}:${stage.station}`;
     if(completed.has(key))throw error(503,'Repeated completed stage; retry snapshot');
     completed.set(key,stage);
   }
   if(completed.size>MAX)throw error(503,'Completed stage history exceeds supported bound');
   if((data??[]).length<PAGE)break;
 }
 const historicalIds=[...new Set([...completed.values()].map(s=>s.draft_order_id))]
   .filter(id=>!orders.has(id));
 for(let i=0;i<historicalIds.length;i+=CHUNK){
   const {data,error:dbError}=await db.from('draft_orders')
     .select('id,po_number,title,client,due_date,status')
     .in('id',historicalIds.slice(i,i+CHUNK));
   if(dbError)throw error(503,'Completed order permissions could not be verified');
   for(const order of data??[])orders.set(order.id,order);
 }
 for(const [key,stage] of completed){
   if(orders.has(stage.draft_order_id))stages.set(key,stage);
 }
 const progress:ProgressObservation[]=[];
 // For currently visible order IDs only. The deployed station_timeline view
 // stores order_id inside details and does not expose a stable log ID; fail
 // rather than silently truncating a group's operator observations.
 for(let i=0;i<activeIds.length;i+=CHUNK){
   const ids=activeIds.slice(i,i+CHUNK);
   const {data,count,error:dbError}=await db.from('station_timeline')
     .select('station,details,created_at',{count:'exact'})
     .eq('action','PROGRESS_UPDATE').in('details->>order_id',ids)
     .order('created_at',{ascending:false}).limit(LOG_LIMIT);
   if(dbError||count===null)throw error(503,'Operator progress observations unavailable');
   if(count>=LOG_LIMIT)throw error(503,'Operator progress observations exceed supported query limit');
   for(const row of data??[]){
     const id=row.details?.order_id,percent=row.details?.progress_percent;
     if(typeof id!=='string'||!orders.has(id))continue;
     progress.push({station:row.station,orderId:id,createdAt:row.created_at,
       progressPercent:Number.isInteger(percent)&&percent>=0&&percent<=99?percent:null,
       note:typeof row.details?.message==='string'?row.details.message:''});
   }
 }
 const summary=computeProductionPerformance([...orders.values()],
   [...stages.values()],progress,asOf,days);
 return json(summary,{headers:{'Cache-Control':'private, no-store'}});
};
