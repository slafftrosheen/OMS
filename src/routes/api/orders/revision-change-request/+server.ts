/** OMS-R15: turn *selected* revision suggestions into a tracked review request.
 * Does not apply order edits. Uses canonical change_requests RPC + activity log.
 */
import {json,error} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {revisionEvidenceSchema,selectedRevisionDiff,safeRevisionDescription}
  from '$lib/order/revision-contract';
import {loadRevisionFiles} from '$lib/server/order/revision-files';
import {DRAFT_EDIT_STATUSES,canEditDraft,canEditConfirmedMetadata}
  from '$lib/server/order/draft-contract';
import {CHANGE_REQUEST_SELECT,normalizeChangeRequestRow}
  from '$lib/server/change-requests/contract';

export const POST:RequestHandler=async({locals,request})=>{
  const user=locals.user;
  if(!user)throw error(401,'Unauthorized');
  const body=revisionEvidenceSchema.safeParse(await request.json().catch(()=>null));
  if(!body.success)throw error(400,'Invalid selected revision or consent');
  const input=body.data;
  const {data:order,error:orderError}=await locals.supabase.from('draft_orders')
    .select('id,status,created_by,updated_at,title,client,due_date,priority,notes,is_rd,rd_notes')
    .eq('id',input.orderId).maybeSingle();
  if(orderError)throw error(503,'Order database unavailable');
  if(!order)throw error(404,'Order not found');
  const permitted=DRAFT_EDIT_STATUSES.has(order.status)
    ? canEditDraft(user.role,order.created_by,user.id,order.status)
    : canEditConfirmedMetadata(user.role) &&
      ['CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD'].includes(order.status);
  if(!permitted)throw error(403,'Cannot submit a revision for this order');
  if(!order.updated_at||order.updated_at!==input.orderUpdatedAt)
    throw error(409,'Order changed since revision comparison. Recompare first');
  // Re-read the persisted binary evidence: the browser cannot forge a file
  // identity, move attachments from another order, or fabricate a checksum.
  const [baseline,revised]=await loadRevisionFiles(locals,input.orderId,
    input.baselineFileId,input.revisedFileId);
  if(baseline.sha256!==input.baselineSha256||revised.sha256!==input.revisedSha256)
    throw error(409,'One compared file has changed. Recompare first');
  const proposed=selectedRevisionDiff(input.changes);
  if(!Object.keys(proposed).length)throw error(400,'Select valid order field changes');
  // Avoid creating a meaningless review request for values already stored.
  const actual=Object.fromEntries(Object.entries(proposed).filter(([key,value])=>{
    const current=(order as Record<string,unknown>)[key];
    return String(current??'')!==String(value);
  }));
  if(!Object.keys(actual).length)
    throw error(409,'Selected fields already match the persisted order');
  const description=safeRevisionDescription(input);
  const {data:id,error:creationError}=await locals.supabase.rpc(
    'oms_create_revision_change_request',{
      p_order_id:order.id,
      p_baseline_file_id:input.baselineFileId,
      p_revised_file_id:input.revisedFileId,
      p_baseline_sha256:baseline.sha256,
      p_revised_sha256:revised.sha256,
      p_description:description,p_proposed_diff:actual,
      p_expected_updated_at:input.orderUpdatedAt
    }
  );
  if(creationError||!id){
    if(creationError?.code==='PGRST202')throw error(503,
      'Revision audit migration is missing; apply OMS-R15 SQL before using this workflow');
    if(creationError?.code==='42501')throw error(403,'Revision request is not permitted');
    if(creationError?.code==='23505')throw error(409,'Order changed; compare the revisions again');
    console.error('[Orders] Revision change request creation failed',creationError?.code);
    throw error(503,'Could not create a tracked change request');
  }
  const {data:requestRow,error:fetchError}=await locals.supabase
    .from('change_requests').select(CHANGE_REQUEST_SELECT).eq('id',id).maybeSingle();
  if(fetchError||!requestRow)throw error(503,'Change request saved but could not be retrieved');
  return json({data:normalizeChangeRequestRow(requestRow)},
    {status:201,headers:{'Cache-Control':'private, no-store'}});
};
