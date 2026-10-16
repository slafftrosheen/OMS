import {json,error} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {canManageSharedInventory} from '$lib/server/authz/shared-data';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT=100;
const headers={'Cache-Control':'private, no-store'};
/** OMS-R41: read-only, manager-authorized evidence for a specific existing
 * exception review. Inventory movements are linked at order level, not
 * guaranteed to identify the exact workstation; do not infer attribution.
 */
export const GET:RequestHandler=async ({locals,url})=>{
  if(!locals.user)throw error(401,'Unauthorized');
  if(!canManageSharedInventory(locals.user.role))
    throw error(403,'Production management role required');
  const reviewId=url.searchParams.get('reviewId');
  if(!reviewId||!uuid.test(reviewId))throw error(400,'Valid review ID required');
  const db=locals.supabase;
  const {data:review,error:reviewError}=await db.from('production_exception_reviews')
    .select('id,draft_order_id,station,kind,status,updated_at,owner_id,due_date,resolution_note,follow_up_note')
    .eq('id',reviewId).maybeSingle();
  if(reviewError)throw error(503,'Cannot verify review access');
  if(!review)throw error(404,'Review not accessible');
  if(!['MATERIAL_SKIPPED','STAGE_UNCHANGED'].includes(review.kind))
    throw error(400,'Evidence view is for material and stage-age reviews');

  const [orderResponse,stageResponse,movementResponse]=await Promise.all([
    db.from('draft_orders').select('id,po_number,title,status')
      .eq('id',review.draft_order_id).maybeSingle(),
    db.from('order_stages')
      .select('id,draft_order_id,station,state,updated_at,started_at,completed_at,actual_hours,estimated_hours,consumption_skipped,consumption_skipped_reason,notes,blocked_reason')
      .eq('draft_order_id',review.draft_order_id).eq('station',review.station).maybeSingle(),
    db.from('inventory_movements')
      .select('id,item_id,material_id,movement_type,quantity,reference_id,reference_type,performed_by,notes,created_at,stock_before,stock_after',
        {count:'exact'})
      .eq('reference_type','order').eq('reference_id',review.draft_order_id)
      .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(LIMIT)
  ]);
  if(orderResponse.error||stageResponse.error||movementResponse.error||
    movementResponse.count===null)
    throw error(503,'Review evidence could not be verified');
  if(!orderResponse.data||!stageResponse.data)
    throw error(409,'Original order or stage no longer accessible');
  const stage=stageResponse.data;
  if(stage.draft_order_id!==review.draft_order_id||stage.station!==review.station)
    throw error(409,'Review stage no longer matches the original source');

  const movements=(movementResponse.data??[]).map(row=>({
    id:row.id,itemId:row.item_id,materialId:row.material_id,
    kind:row.movement_type,quantity:row.quantity,performedBy:row.performed_by,
    note:row.notes,createdAt:row.created_at,
    stockBefore:row.stock_before,stockAfter:row.stock_after,
    // Some canonical movement notes carry "station=CAD", but custom
    // operator notes often do not. This is a *hint*, not verified lineage.
    stationMention:
      typeof row.notes==='string'
        ? /^station=([A-Z_]+)$/.exec(row.notes)?.[1]??null:null
  }));
  return json({
    asOf:new Date().toISOString(),
    review:{id:review.id,kind:review.kind,status:review.status,
      station:review.station,orderId:review.draft_order_id,
      updatedAt:review.updated_at,ownerId:review.owner_id,
      dueDate:review.due_date},
    order:orderResponse.data,
    stage,orderMovements:movements,
    totalOrderMovements:movementResponse.count,
    movementsTruncated:movementResponse.count>LIMIT,
    evidenceIsOrderScoped:true,
    stageAttributionVerified:false
  },{headers});
};
