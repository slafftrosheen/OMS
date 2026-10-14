import {json,error} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {deriveProductionPlanning,type OrderRow,type StageRow} from '$lib/order/production-planning';

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
 // Read all authorized production orders using explicit stable pages.
 for(let offset=0;;offset+=PAGE_SIZE){
   const {data,error:dbError}=await db.from('draft_orders')
     .select('id,po_number,title,client,due_date,priority,status')
     .in('status',STATUSES).order('id',{ascending:true})
     .range(offset,offset+PAGE_SIZE-1);
   if(dbError){console.error('[Production planning] Orders',dbError);
     throw error(503,'Production orders unavailable');}
   orders.push(...(data??[]));
   if(orders.length>MAX_ORDERS)throw error(503,'Production board row limit exceeded');
   if((data??[]).length<PAGE_SIZE)break;
 }
 const stages:StageRow[]=[];
 // 50 orders × 14 configured stations max = 700; below PostgREST's default 1k cap.
 for(let offset=0;offset<orders.length;offset+=STAGE_ID_CHUNK){
   const ids=orders.slice(offset,offset+STAGE_ID_CHUNK).map(x=>x.id);
   const {data,error:dbError}=await db.from('order_stages')
     .select('draft_order_id,station,state,estimated_hours,actual_hours,blocked_reason')
     .in('draft_order_id',ids).neq('state','COMPLETED');
   if(dbError){console.error('[Production planning] Stages',dbError);
     throw error(503,'Production stages unavailable');}
   if((data??[]).length>STAGE_ID_CHUNK*14)
     throw error(503,'Stage count exceeds supported stations');
   stages.push(...(data??[]));
 }
 return json({success:true,asOf:new Date().toISOString(),
   ...deriveProductionPlanning(orders,stages,rigaDate())},
   {headers:{'Cache-Control':'private, no-store'}});
};
