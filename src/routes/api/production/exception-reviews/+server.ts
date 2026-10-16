import {json,error} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {canManageSharedInventory} from '$lib/server/authz/shared-data';
import {parseReviewChange} from '$lib/order/production-exceptions';

const projection='id,draft_order_id,station,kind,status,owner_id,due_date,follow_up_note,resolution_note,updated_at,created_at,resolved_at,updated_by';
const headers={'Cache-Control':'private, no-store'};
const LIMIT=200,MAX=10000;
export const GET:RequestHandler=async ({locals})=>{
 if(!locals.user)throw error(401,'Unauthorized');
 const entries:unknown[]=[];
 const seen=new Set<string>();
 let exact:number|null=null;
 for(let offset=0;;offset+=LIMIT){
   const {data,count,error:dbError}=await locals.supabase
     .from('production_exception_reviews')
     .select(projection,{count:'exact'})
     .order('id',{ascending:true}).range(offset,offset+LIMIT-1);
   if(dbError||count===null)throw error(503,'Exception review ledger unavailable; check R25 migration');
   if(count>MAX||exact!==null&&exact!==count)
     throw error(503,'Exception review ledger is too large or changed during loading');
   exact=count;
   if((data??[]).length===0&&offset<count)
     throw error(503,'Exception ledger was truncated');
   for(const row of data??[]){
     if(seen.has(row.id))throw error(503,'Repeated exception review');
     seen.add(row.id);entries.push(row);
   }
   if(entries.length>=count)break;
   if((data??[]).length<LIMIT)throw error(503,'Exception ledger incomplete');
 }
 return json({reviews:entries,total:entries.length},{headers});
};
export const POST:RequestHandler=async ({locals,request})=>{
 if(!locals.user)throw error(401,'Unauthorized');
 if(!canManageSharedInventory(locals.user.role))
   throw error(403,'Production manager role required');
 const raw=await request.json().catch(()=>null);
 let input:ReturnType<typeof parseReviewChange>;
 try{input=parseReviewChange(raw);}
 catch(e){throw error(400,e instanceof Error?e.message:'Invalid review');}
 let auditedNote=input.note;
 if(input.evidenceMovementIds.length){
   // Cite only real movements linked to the original review's order.
   // This is a read-only validation; all final audit writes remain in
   // the versioned R25/R40 management RPC below.
   const {data:source,error:sourceError}=await locals.supabase
     .from('production_exception_reviews')
     .select('id,draft_order_id,kind')
     .eq('id',input.reviewId!).maybeSingle();
   if(sourceError)throw error(503,'Could not verify review evidence');
   if(!source || !['MATERIAL_SKIPPED','STAGE_UNCHANGED'].includes(source.kind))
     throw error(409,'Movement references require a current oversight review');
   const {data:linked,error:linkedError}=await locals.supabase
     .from('inventory_movements').select('id')
     .in('id',input.evidenceMovementIds)
     .eq('reference_type','order').eq('reference_id',source.draft_order_id);
   if(linkedError)throw error(503,'Linked inventory audit could not be verified');
   if((linked??[]).length!==input.evidenceMovementIds.length)
     throw error(409,'Selected movement no longer belongs to this order');
   const reference='\\nOrder movement evidence: '+input.evidenceMovementIds.join(', ');
   const max=input.action==='update'?1000:2000;
   if((auditedNote??'').length+reference.length>max)
     throw error(400,'Review note and movement references exceed the allowed length');
   auditedNote=(auditedNote??'')+reference;
 }
 const {data,error:rpcError}=await locals.supabase.rpc('oms_manage_production_exception',{
   p_action:input.action,p_order_id:input.orderId,p_station:input.station,
   p_kind:input.kind,p_review_id:input.reviewId,
   p_expected_updated_at:input.expectedUpdatedAt,
   p_due_date:input.dueDate,p_note:auditedNote
 });
 if(rpcError){
   if(rpcError.code==='23505'||rpcError.code==='P0001')
     throw error(409,'Exception changed, was already claimed, or the source condition no longer exists');
   if(rpcError.code==='42501')throw error(403,'Production manager role required');
   if(rpcError.code==='22023')throw error(400,'Invalid review transition or follow-up date');
   if(rpcError.code==='P0002')throw error(404,'Review no longer exists');
   console.error('[Production exceptions] Management RPC failed',rpcError);
   throw error(503,'Exception review could not be saved');
 }
 if(!data)throw error(503,'Exception transaction returned no record');
 return json({review:data},{status:input.action==='claim'?201:200,headers});
};
