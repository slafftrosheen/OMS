import {json,error} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {canManageSharedInventory} from '$lib/server/authz/shared-data';
import {validateCapacityWrite} from '$lib/order/production-capacity';

const projection='station,workers,hours_per_worker,efficiency_percent,workdays,updated_at,updated_by';
const headers={'Cache-Control':'private, no-store'};
export const GET:RequestHandler=async ({locals})=>{
  if(!locals.user)throw error(401,'Unauthorized');
  const {data, error:dbError}=await locals.supabase
    .from('production_station_capacity').select(projection).order('station');
  if(dbError){
    console.error('[Production capacity] Load failed',dbError);
    throw error(503,'Capacity settings unavailable; check OMS-R21 migration');
  }
  return json({settings:data??[]},{headers});
};
export const PUT:RequestHandler=async ({locals,request})=>{
  if(!locals.user)throw error(401,'Unauthorized');
  if(!canManageSharedInventory(locals.user.role))throw error(403,'Production manager role required');
  const body=await request.json().catch(()=>null);
  let input:ReturnType<typeof validateCapacityWrite>;
  try{input=validateCapacityWrite(body);}
  catch(e){throw error(400,e instanceof Error?e.message:'Invalid capacity input');}
  const values={
    station:input.station,workers:input.workers,
    hours_per_worker:input.hoursPerWorker,
    efficiency_percent:input.efficiencyPercent,
    workdays:input.workdays
  };
  const db=locals.supabase;
  if(input.expectedUpdatedAt===null){
    const {data, error:dbError}=await db.from('production_station_capacity')
      .insert({...values,updated_by:locals.user.id}).select(projection).maybeSingle();
    if(dbError){
      if(dbError.code==='23505')throw error(409,'Capacity row exists; refresh before editing');
      console.error('[Production capacity] Insert failed',dbError);
      throw error(503,'Capacity save failed');
    }
    if(!data)throw error(503,'Capacity record not returned');
    return json({setting:data},{status:201,headers});
  }
  const {data,error:dbError}=await db.from('production_station_capacity')
    .update(values).eq('station',input.station)
    .eq('updated_at',input.expectedUpdatedAt)
    .select(projection).maybeSingle();
  if(dbError){
    console.error('[Production capacity] Update failed',dbError);
    throw error(503,'Capacity save failed');
  }
  if(!data)throw error(409,'Station capacity changed; reload before saving');
  return json({setting:data},{headers});
};
