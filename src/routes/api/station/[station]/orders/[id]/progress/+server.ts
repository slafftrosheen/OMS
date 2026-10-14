import {json,error} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {canOperateStation} from '$lib/order/lifecycle-guards';
import {isKnownStation} from '$lib/order/workflow';
import {parseProgressInput} from '$lib/order/production-floor-contract';

async function accessibleStage(locals:App.Locals,orderId:string,station:string) {
  const {data:order,error:orderError}=await locals.supabase.from('draft_orders')
    .select('id,status').eq('id',orderId).maybeSingle();
  if(orderError)throw error(503,'Order lookup unavailable');
  if(!order)throw error(404,'Order not found');
  const {data:stage,error:stageError}=await locals.supabase.from('order_stages')
    .select('id,state,updated_at').eq('draft_order_id',orderId)
    .eq('station',station).maybeSingle();
  if(stageError)throw error(503,'Stage lookup unavailable');
  if(!stage)throw error(404,'No stage for this order');
  return {order,stage};
}
export const GET:RequestHandler=async ({params,locals})=>{
  if(!locals.user)throw error(401,'Unauthorized');
  const station=params.station.toUpperCase();
  if(!isKnownStation(station))throw error(400,'Unknown station');
  await accessibleStage(locals,params.id,station);
  const {data, error:dbError}=await locals.supabase.from('station_timeline')
    .select('action,details,created_at,user_name,username')
    .eq('station',station).eq('action','PROGRESS_UPDATE')
    .eq('details->>order_id',params.id).order('created_at',{ascending:false}).limit(20);
  if(dbError)throw error(503,'Progress history unavailable');
  return json((data??[]).map(row=>({
    createdAt:row.created_at,
    actor:row.user_name??row.username??null,
    note:typeof row.details?.message==='string'?row.details.message:'',
    progressPercent:typeof row.details?.progress_percent==='number'?row.details.progress_percent:null
  })),{headers:{'Cache-Control':'private, no-store'}});
};
export const POST:RequestHandler=async ({params,request,locals})=>{
  if(!locals.user)throw error(401,'Unauthorized');
  const station=params.station.toUpperCase();
  if(!isKnownStation(station))throw error(400,'Unknown station');
  if(!canOperateStation(locals.user,station))throw error(403,'Station assignment required');
  const payload=await request.json().catch(()=>null);
  let data:ReturnType<typeof parseProgressInput>;
  try{data=parseProgressInput(payload);}
  catch(e){throw error(400,e instanceof Error?e.message:'Invalid progress report');}
  const {order,stage}=await accessibleStage(locals,params.id,station);
  if(!['CONFIRMED','IN_PRODUCTION'].includes(order.status)||stage.state!=='IN_PROGRESS')
    throw error(409,'This stage is no longer in progress');
  if(stage.updated_at!==data.expectedUpdatedAt)
    throw error(409,'Stage changed while you were working; refresh first');
  const {data:id,error:rpcError}=await locals.supabase.rpc('create_station_log',{
    p_station:station,p_action:'PROGRESS_UPDATE',
    p_details:{
      order_id:params.id,
      message:data.note,
      progress_percent:data.progressPercent
    }
  });
  if(rpcError||!id){
    console.error('[Progress] station log failed',rpcError);
    throw error(503,'Could not save progress; keep this note and retry after checking history');
  }
  return json({id,success:true},{status:201,headers:{'Cache-Control':'private, no-store'}});
};
