import {json,error} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {canManageSharedInventory} from '$lib/server/authz/shared-data';
import {parseReservationAction,validDate} from '$lib/order/production-reservation';

const projection='id,draft_order_id,station,work_date,hours,status,note,updated_at,created_at,approved_at,cancelled_at,created_by';
const headers={'Cache-Control':'private, no-store'};
export const GET:RequestHandler=async ({locals,url})=>{
 if(!locals.user)throw error(401,'Unauthorized');
 const from=url.searchParams.get('from'),to=url.searchParams.get('to');
 if(!validDate(from)||!validDate(to)||from>to)
  throw error(400,'Provide a valid reservation date range');
 const difference=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000;
 if(difference>90)throw error(400,'Reservation range cannot exceed 91 calendar days');
 const offset=Number(url.searchParams.get('offset')??'0');
 if(!Number.isSafeInteger(offset)||offset<0||offset>10000)
  throw error(400,'Invalid reservation pagination');
 const {data,count,error:dbError}=await locals.supabase
  .from('production_reservations')
  .select(projection,{count:'exact'})
  .gte('work_date',from).lte('work_date',to)
  .order('work_date',{ascending:true})
  .order('id',{ascending:true})
  .range(offset,offset+99);
 if(dbError||count===null){
  console.error('[Production reservations] List failed',dbError);
  throw error(503,'Reservations unavailable; verify R22 migration');
 }
 return json({items:data??[],total:count},{headers});
};
export const POST:RequestHandler=async ({locals,request})=>{
 if(!locals.user)throw error(401,'Unauthorized');
 if(!canManageSharedInventory(locals.user.role))
  throw error(403,'Production manager role required');
 const body=await request.json().catch(()=>null);
 let payload:ReturnType<typeof parseReservationAction>;
 try{payload=parseReservationAction(body);}
 catch(e){throw error(400,e instanceof Error?e.message:'Invalid reservation');}
 const {data, error:rpcError}=await locals.supabase.rpc('oms_manage_production_reservation',{
  p_action:payload.action,p_reservation_id:payload.reservationId,
  p_order_id:payload.orderId,p_station:payload.station,
  p_work_date:payload.workDate,p_hours:payload.hours,
  p_note:payload.note,p_expected_updated_at:payload.expectedUpdatedAt
 });
 if(rpcError){
  if(rpcError.code==='23505'||rpcError.code==='P0001')
   throw error(409,rpcError.code==='23505'?'Active reservation already exists for this stage and date':
     'Reservation changed or conflicts with capacity, dependencies or stage readiness');
  if(rpcError.code==='42501')throw error(403,'Production manager role required');
  if(rpcError.code==='22023')throw error(400,'Invalid reservation input');
  console.error('[Production reservations] RPC rejected',rpcError);
  throw error(503,'Reservation transaction unavailable; verify R22 migration');
 }
 if(!data)throw error(503,'Reservation transaction returned no record');
 return json({reservation:data},{status:payload.action==='propose'?201:200,headers});
};
