import {error,json} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {z} from 'zod';

export const GET:RequestHandler=async({locals,params,url,request})=>{
 if(!locals.user)throw error(401,'Unauthorized');
 const offsetText=url.searchParams.get('offset')??'0';
 if(!z.string().uuid().safeParse(params.addressId).success||!/^\d+$/.test(offsetText)||Number(offsetText)>10000)
  throw error(400,'Invalid address history page');
 const offset=Number(offsetText);
 // Read immutable snapshots through the caller's RLS client. Never reveal
 // contacts from source orders the current user cannot access.
 const {data,count,error:failed}=await locals.supabase.from('client_delivery_address_history')
  .select('id,raw_address,contact,phone,email,used_at,source_order_id',{count:'exact'})
  .eq('address_id',params.addressId).order('used_at',{ascending:false}).order('id',{ascending:false})
  .range(offset,offset+19).abortSignal(AbortSignal.any([request.signal,AbortSignal.timeout(12000)]));
 if(failed||!data||count===null||!Number.isSafeInteger(count)||count<0||(!data.length&&offset<count))
  throw error(503,'Address use history is unavailable. Try again.');
 const next=offset+data.length;
 return json({items:data,total:count,nextOffset:next<count&&next<=10000?next:null},
  {headers:{'Cache-Control':'private, no-store'}});
};
