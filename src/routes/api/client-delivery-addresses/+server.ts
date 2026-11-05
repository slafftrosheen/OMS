import {error,json} from '@sveltejs/kit';
import type {RequestHandler} from './$types';

export const GET:RequestHandler=async({locals,url})=>{
 if(!locals.user)throw error(401,'Unauthorized');
 const client=url.searchParams.get('client')?.trim();
 if(!client||client.length>200)throw error(400,'Client name is required');
 // SECURITY INVOKER RPC; both address and immutable use history obey caller RLS.
 const {data,error:failed}=await locals.supabase.rpc('oms_client_delivery_addresses',{p_client:client});
 if(failed)throw error(503,'Client address history is unavailable. Verify the address migration is installed.');
 return json(data??[],{headers:{'Cache-Control':'private, no-store'}});
};
