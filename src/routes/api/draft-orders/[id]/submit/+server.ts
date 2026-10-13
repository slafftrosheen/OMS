import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { notifyDraftCreated } from '$lib/server/notifications/orderNotifier';

/** Submit only a complete persisted draft to HoP/Boss review.
 * Idempotent retries never resend notifications.
 */
export const POST: RequestHandler = async ({ params, locals }) => {
  const user=locals.user;
  if(!user) throw error(401,'Unauthorized');
  const { data: result, error: rpcError }=await locals.supabase.rpc(
    'oms_submit_draft_for_review',{ p_order_id:params.id }
  );
  if(rpcError){
    if(rpcError.code==='PGRST202') throw error(503,'Draft submission migration is not deployed');
    if(rpcError.code==='42501') throw error(403,'Cannot submit this order for review');
    console.error('[Orders] Draft submission rejected',rpcError.code);
    throw error(409,'Draft cannot be submitted. Check persistent files, deadline and current state.');
  }
  if(!result?.ok) throw error(503,'Draft submission returned no result');
  if(!result.idempotent){
    const { data: order }=await locals.supabase.from('draft_orders')
      .select('id,internal_ref,client,created_by').eq('id',params.id).maybeSingle();
    if(order){
      try{
        await notifyDraftCreated(locals.supabase,{
          orderId:order.id,internalRef:order.internal_ref ?? null,
          client:order.client,createdById:order.created_by
        });
      }catch(err){console.error('[Orders] Review notification unavailable',err);}
    }
  }
  return json({success:true,status:'PENDING_REVIEW',id:params.id,
    idempotent:result.idempotent===true},{headers:{'Cache-Control':'private, no-store'}});
};
