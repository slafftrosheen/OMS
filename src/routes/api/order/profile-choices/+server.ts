/** Thin RLS-aware profile list for real order form selections.
 * Unlike AI proposals, these IDs come from the live profile_templates table.
 */
import {json,error} from '@sveltejs/kit';
import type {RequestHandler} from './$types';

export const GET:RequestHandler=async({locals})=>{
  if(!locals.user)throw error(401,'Unauthorized');
  const {data, error:lookupError}=await locals.supabase.from('profile_templates')
    .select('id,code,name,is_active').eq('is_active',true)
    .order('name',{ascending:true}).limit(201);
  if(lookupError)throw error(503,'Active profile catalog unavailable');
  const templates=(data??[]).slice(0,200).filter(item=>
    typeof item.id==='string'&&typeof item.name==='string'
  ).map(item=>({
    id:item.id,code:String(item.code??'').slice(0,80),
    name:item.name.slice(0,180)
  }));
  return json({templates,truncated:(data??[]).length>200},
    {headers:{'Cache-Control':'private, no-store'}});
};
