import {json,error} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {canManageSharedInventory} from '$lib/server/authz/shared-data';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={'Cache-Control':'private, no-store'};
export const GET:RequestHandler=async ({locals,url})=>{
 if(!locals.user)throw error(401,'Unauthorized');
 if(!canManageSharedInventory(locals.user.role))
   throw error(403,'Inventory management required');
 const id=url.searchParams.get('requestId');
 if(!id||!uuid.test(id))throw error(400,'Valid replenishment request required');
 const db=locals.supabase;
 const {data:parent,error:parentError}=await db.from('inventory_replenishment_requests')
   .select('id').eq('id',id).maybeSingle();
 if(parentError)throw error(503,'Cannot verify replenishment request access');
 if(!parent)throw error(404,'Replenishment request inaccessible');
 const {data,count,error:eventsError}=await db.from('inventory_replenishment_events')
   .select('id,action,previous_status,next_status,actor_id,note,occurred_at',
     {count:'exact'})
   .eq('request_id',id).order('occurred_at',{ascending:false})
   .order('id',{ascending:false}).limit(200);
 if(eventsError||count===null)throw error(503,'Procurement audit unavailable');
 return json({events:data??[],total:count,truncated:count>200},{headers});
};
