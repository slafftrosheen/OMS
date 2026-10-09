import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { postStationMessage } from '$lib/server/chat/stationMessenger';

import { ORDER_STAGE_STATES } from '$lib/order/stage-contract';
import { isKnownStation } from '$lib/order/workflow';
import { canOperateStation, mayEditStage, validStageTransition } from '$lib/order/lifecycle-guards';


/**
 * GET /api/orders/[id]/stages — list every workflow-stage row for an order.
 *
 * The on-disk column is `draft_order_id` (orders is a view of draft_orders);
 * the previous version of this handler used `order_id`, which silently
 * returned an empty list because PostgREST treats unknown filters as no-ops
 * but our select() returned nothing matching anyway. Fixed.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
    const session = await locals.getSession();
    if (!session) throw error(401, 'Unauthorized');

    const { supabase } = locals;

    try {
        const { data, error: queryError } = await supabase
            .from('order_stages')
            .select('*')
            .eq('draft_order_id', params.id)
            .order('station');

        if (queryError) throw error(500, queryError.message);

        return json(data || []);
    } catch (err: any) {
        if (err.status) throw err;
        throw error(500, 'Internal server error');
    }
};

/**
 * PATCH /api/orders/[id]/stages?station=CNC — update a single stage row.
 *
 * Side-effects (Phase 10):
 *   - Posts a system message to the matching station room (e.g. station-cnc)
 *     whenever state transitions. Operators see arrivals / completions in
 *     the chat sidebar in real time.
 *   - When a stage is COMPLETED, auto-queues the next workflow stage (the
 *     classic "send to next station" flow) and announces it as well.
 */
/** Stage transitions use compare-and-set. COMPLETED must use the atomic
 * /stages/[station]/complete endpoint to record material consumption exactly once.
 */
export const PATCH: RequestHandler = async ({ params, request, locals, url }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');
  const { supabase } = locals;
  const station = (url.searchParams.get('station') ?? '').toUpperCase();
  if (!isKnownStation(station)) throw error(400, 'Valid station parameter required');
  if (!canOperateStation(user, station)) throw error(403, 'Station assignment required');
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, 'Invalid update payload');
  const newState = body.state;
  if (newState === 'COMPLETED') {
    throw error(409, 'Complete a stage through the material-consumption endpoint');
  }
  if (newState === 'REWORK') {
    throw error(409, 'Open a rework cycle through the dedicated rework endpoint');
  }
  if (newState !== undefined && !ORDER_STAGE_STATES.includes(newState)) throw error(400, 'Invalid stage state');
  const { data: order, error: orderErr } = await supabase.from('draft_orders')
    .select('status,po_number').eq('id', params.id).maybeSingle();
  if (orderErr) throw error(500, 'Could not load order');
  if (!order) throw error(404, 'Order not found');
  if (!mayEditStage(order.status)) throw error(409, 'Order is not in production');

  const { data: stage, error: stageErr } = await supabase.from('order_stages')
    .select('id,state,blocked_reason').eq('draft_order_id', params.id).eq('station', station).maybeSingle();
  if (stageErr) throw error(500, 'Could not load stage');
  if (!stage) throw error(404, 'Stage does not exist for order');
  if (stage.state === 'REWORK' && newState !== undefined) {
    throw error(409, 'Resolve the open rework cycle before changing stage state');
  }
  if (newState !== undefined && !validStageTransition(stage.state, newState)) {
    throw error(409, `Stage transition ${stage.state} → ${newState} is not allowed`);
  }

  const updates: Record<string, unknown> = {};
  if (newState !== undefined) updates.state = newState;
  if (body.blocked_reason !== undefined) {
    if (typeof body.blocked_reason !== 'string') throw error(400, 'Invalid block reason');
    updates.blocked_reason = body.blocked_reason;
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string') throw error(400, 'Invalid notes');
    updates.notes = body.notes;
  }
  for (const [camel, db] of [['estimated_hours', 'estimated_hours'], ['actual_hours', 'actual_hours']] as const) {
    const value = body[camel];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw error(400, 'Hours must be non-negative');
    updates[db] = value;
  }
  if (newState === 'BLOCKED' && !String(body.blocked_reason ?? stage.blocked_reason ?? '').trim()) {
    throw error(400, 'Blocking requires a reason');
  }
  if (newState === 'IN_PROGRESS') {
    updates.blocked_reason = null;
    updates.started_at = new Date().toISOString();
  }
  if (!Object.keys(updates).length) throw error(400, 'No changes supplied');

  // Prevent a second request from silently overwriting this stage.
  const { data: updated, error: updateErr } = await supabase.from('order_stages')
    .update(updates).eq('id', stage.id).eq('state', stage.state)
    .select('id,draft_order_id,station,state').maybeSingle();
  if (updateErr) {
    console.error('[Stage PATCH] update failed', updateErr);
    throw error(500, 'Failed to update stage');
  }
  if (!updated) throw error(409, 'Stage was changed by another operator; reload');

  if (newState === 'IN_PROGRESS' && order.status === 'CONFIRMED') {
    const { error: promoteError } = await supabase.from('draft_orders')
      .update({ status: 'IN_PRODUCTION', updated_by: user.id })
      .eq('id', params.id).eq('status', 'CONFIRMED');
    if (promoteError) console.error('[Stage PATCH] Order promotion failed', promoteError);
  }
  if (newState) {
    try {
      await postStationMessage(supabase, {
        station, poNumber: order.po_number, state: newState,
        actorName: user.displayName ?? user.username ?? 'system'
      });
    } catch (err) { console.error('[Stage PATCH] Chat notification failed', err); }
  }
  return json(updated);
};
