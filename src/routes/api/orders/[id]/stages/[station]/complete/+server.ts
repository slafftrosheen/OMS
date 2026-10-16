// R02 — all-or-nothing production completion and material deduction.
// Requires unapplied migration 20261009000001_complete_stage_with_consumption.sql.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isKnownStation } from '$lib/order/workflow';
import { canOperateStation } from '$lib/order/lifecycle-guards';
import { postStationMessage } from '$lib/server/chat/stationMessenger';
import { notifyConsumptionSkipped, notifyLowStock } from '$lib/server/notifications/inventoryNotifier';

import { parseStageCompletion, parseStageCompletionRevision } from '$lib/order/production-floor-contract';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const actor = locals.user;
  if (!actor) return json({ error: 'Unauthorized' }, { status: 401 });
  const orderId = params.id;
  const station = (params.station ?? '').toUpperCase();
  if (!isKnownStation(station)) return json({ error: 'Unknown station' }, { status: 400 });
  if (!canOperateStation(actor, station)) return json({ error: 'Station assignment required' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Invalid completion data' }, { status: 400 });
  }
  let validated: ReturnType<typeof parseStageCompletion>;
  try {
    validated = parseStageCompletion(body);
  } catch (err) {
    return json({error: err instanceof Error ? err.message : 'Invalid completion data'}, {status:400});
  }
  const {items,skipped,reason,actualHours,notes} = validated;
  let expectedUpdatedAt:string;
  try{expectedUpdatedAt=parseStageCompletionRevision(body.expectedUpdatedAt);}
  catch(err){return json({error:err instanceof Error?err.message:'Stage revision required'},
    {status:428});}

  const { data: result, error: rpcError } = await locals.supabase.rpc(
    'complete_stage_with_consumption', {
      p_order_id: orderId,
      p_station: station,
      p_items: items,
      p_skipped: skipped,
      p_skip_reason: skipped ? reason : null,
      p_actual_hours: actualHours,
      p_notes: notes,
      p_expected_updated_at:expectedUpdatedAt
    }
  );
  if (rpcError) {
    console.error('[Stage completion] atomic RPC rejected', rpcError);
    const missing = rpcError.code === 'PGRST202' || /Could not find the function/.test(rpcError.message || '');
    const stale = rpcError.code === 'P0001';
    return json({
      error: missing ? 'Stage-completion database migration is not installed' :
        stale?'Stage changed or has unresolved block/rework. Refresh the workstation and production packet.':
        'Stage completion rejected: check stage state, materials and permissions'
    }, { status: missing ? 503 : 409 });
  }
  if (!result?.ok) return json({ error: 'Stage completion returned no result' }, { status: 500 });
  // A successful stock/stage transaction must never be presented as a
  // retryable failure. If a legacy response lacks the new handoff flag, avoid
  // a false station announcement and ask the operator to refresh instead.
  const handoffKnown=typeof result.handoff_queued==='boolean';
  if(!handoffKnown)
    console.error('[Stage completion] Missing handoff_queued; committed result requires refresh');

  // Notification failures cannot roll back the committed transaction.
  const { data: order } = await locals.supabase.from('draft_orders')
    .select('po_number,internal_ref').eq('id', orderId).maybeSingle();
  const ref = order?.po_number ?? order?.internal_ref ?? orderId.slice(0, 8);
  try {
    await postStationMessage(locals.supabase, {
      station, poNumber: order?.po_number, state: 'COMPLETED',
      actorName: actor.displayName ?? actor.username ?? 'system'
    });
    if (result.handoff_queued===true && result.next_station) {
      await postStationMessage(locals.supabase, {
        station: result.next_station, poNumber: order?.po_number,
        state: 'QUEUED', actorName: actor.displayName ?? actor.username ?? 'system'
      });
    }
  } catch (err) { console.error('[Stage completion] Chat notification failed', err); }
  try {
    if (skipped) await notifyConsumptionSkipped(locals.supabase, {
      orderId, poOrRef: ref, station, actorId: actor.id, reason
    });
    if (Array.isArray(result.low_stock) && result.low_stock.length) {
      await notifyLowStock(locals.supabase, {
        orderId, poOrRef: ref, actorId: actor.id, hits: result.low_stock
      });
    }
  } catch (err) { console.error('[Stage completion] Inventory notification failed', err); }
  return json({
    ok: true, orderId, station,
    nextStation: result.handoff_queued===true ? result.next_station ?? null : null,
    handoffQueued:result.handoff_queued===true,
    consumed: result.consumed ?? 0, skipped,
    lowStock: result.low_stock ?? [],
    handoffStatusKnown:handoffKnown
  },{headers:{'Cache-Control':'private, no-store'}});
};
