/** OMS-R29: read-only technical checks. Never sends customer data to a model.
 * Only an authorized editor can inspect these saved order facts.
 */
import {json,error} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {DRAFT_EDIT_STATUSES,canEditDraft,canEditConfirmedMetadata}
  from '$lib/server/order/draft-contract';
import {buildOrderTechnicalChecks} from '$lib/order/technical-evidence';

export const GET:RequestHandler=async ({locals,params})=>{
 const actor=locals.user;
 if(!actor)throw error(401,'Unauthorized');
 const {data:order,error:orderError}=await locals.supabase.from('draft_orders')
   .select('id,created_by,status,updated_at').eq('id',params.id).maybeSingle();
 if(orderError)throw error(503,'Order lookup unavailable');
 if(!order)throw error(404,'Order unavailable');
 const allowed=DRAFT_EDIT_STATUSES.has(order.status)
   ?canEditDraft(actor.role,order.created_by,actor.id,order.status)
   :canEditConfirmedMetadata(actor.role)&&
     ['CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD'].includes(order.status);
 if(!allowed)throw error(403,'Technical checks require order-editor permissions');
 const [profiles,materials,files]=await Promise.all([
   locals.supabase.from('order_profiles')
     .select('profile_template_id,quantity1,configuration')
     .eq('draft_order_id',order.id).order('order_index').limit(101),
   locals.supabase.from('order_materials')
     .select('material_type,quantity,unit')
     .eq('draft_order_id',order.id).order('display_order').limit(101),
   locals.supabase.from('order_files').select('id',{count:'exact',head:true})
     .eq('draft_order_id',order.id)
 ]);
 if(profiles.error||materials.error||files.error||files.count===null)
   throw error(503,'Saved technical evidence unavailable');
 if((profiles.data??[]).length>100||(materials.data??[]).length>100)
   throw error(503,'Technical evidence exceeds supported snapshot size');
 const templateIds=[...new Set((profiles.data??[]).map(p=>p.profile_template_id)
   .filter((id):id is string=>typeof id==='string'))];
 const {data:templates,error:templateError}=templateIds.length
   ?await locals.supabase.from('profile_templates')
     .select('id,name,is_active').in('id',templateIds)
   :{data:[],error:null};
 if(templateError)throw error(503,'Profile names unavailable');
 const byId=new Map((templates??[]).map(row=>[row.id,row]));
 const checks=buildOrderTechnicalChecks((profiles.data??[]).map(p=>({
   quantity1:p.quantity1,configuration:p.configuration,
   name:byId.get(p.profile_template_id)?.is_active===true
     ?byId.get(p.profile_template_id)?.name:null
 })),materials.data??[],files.count);
 return json({orderId:order.id,orderUpdatedAt:order.updated_at,checks},{
   headers:{'Cache-Control':'private, no-store'}
 });
};
