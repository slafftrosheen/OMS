import {json,error} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {deriveProductionPlanning,type OrderRow,type StageRow} from '$lib/order/production-planning';
import {deriveProductionOversight} from '$lib/order/production-oversight';
import {canManageSharedInventory} from '$lib/server/authz/shared-data';

const PAGE_SIZE=200;
const STAGE_ID_CHUNK=50;
const MAX_ORDERS=10000;
const STATUSES=['CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD'];
function rigaDate():string {
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Riga',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const part=(key:string)=>parts.find(x=>x.type===key)?.value??'';
 return `${part('year')}-${part('month')}-${part('day')}`;
}
export const GET:RequestHandler=async ({locals})=>{
 if(!locals.user)throw error(401,'Unauthorized');
 const db=locals.supabase,orders:OrderRow[]=[];
 const seenOrders=new Set<string>();
 let orderTotal:number|null=null;
 // Read all authorized production orders using explicit stable pages.
 for(let offset=0;;offset+=PAGE_SIZE){
   const {data,count,error:dbError}=await db.from('draft_orders')
     .select('id,po_number,title,client,due_date,priority,status',{count:'exact'})
     .in('status',STATUSES).order('id',{ascending:true})
     .range(offset,offset+PAGE_SIZE-1);
   if(dbError||count===null){console.error('[Production planning] Orders',dbError);
     throw error(503,'Production orders unavailable');}
   if(count>MAX_ORDERS||(orderTotal!==null&&orderTotal!==count))
     throw error(503,'Production orders changed or exceeded the supported limit');
   orderTotal=count;
   if(!(data?.length)&&orders.length<count)
     throw error(503,'Production orders snapshot incomplete');
   for(const row of data??[]){
     if(seenOrders.has(row.id))throw error(503,'Repeated order in production snapshot');
     seenOrders.add(row.id);orders.push(row);
   }
   if(orders.length>=count)break;
   if((data??[]).length<PAGE_SIZE)throw error(503,'Production orders snapshot truncated');
 }
 if(orders.length!==orderTotal)throw error(503,'Production orders snapshot incomplete');
 const stages:StageRow[]=[];
 const seenStages=new Set<string>();
 // 50 orders × 14 configured stations max = 700; below PostgREST's default 1k cap.
 for(let offset=0;offset<orders.length;offset+=STAGE_ID_CHUNK){
   const ids=orders.slice(offset,offset+STAGE_ID_CHUNK).map(x=>x.id);
   const {data,error:dbError}=await db.from('order_stages')
     .select('draft_order_id,station,state,estimated_hours,actual_hours,blocked_reason,updated_at,completed_at,consumption_skipped,consumption_skipped_reason')
     .in('draft_order_id',ids)
     .order('draft_order_id',{ascending:true}).order('station',{ascending:true})
     .range(0,STAGE_ID_CHUNK*14);
   if(dbError){console.error('[Production planning] Stages',dbError);
     throw error(503,'Production stages unavailable');}
   if((data??[]).length>STAGE_ID_CHUNK*14)
     throw error(503,'Stage count exceeds supported stations');
   for(const row of data??[]){
     const key=`${row.draft_order_id}:${row.station}`;
     if(seenStages.has(key)||!ids.includes(row.draft_order_id))
       throw error(503,'Duplicate or unrelated production stage');
     seenStages.add(key);stages.push(row);
   }
 }
 const asOf=new Date().toISOString();
 const oversight=canManageSharedInventory(locals.user.role)
   ?deriveProductionOversight(orders,stages,asOf):null;
 return json({success:true,asOf,
   ...deriveProductionPlanning(orders,stages,rigaDate()),
   oversight},
   {headers:{'Cache-Control':'private, no-store'}});
};
