// src/routes/api/draft-orders/[id]/confirm/+server.ts
//
// POST: confirm a draft order. The actor supplies the externally-issued
// PO number (the OMS does not generate POs — they come from another
// system). Confirmation:
//   - validates the actor's role (Boss-only for setting PO; HoP can
//     re-confirm an already-PO'd row, e.g. after an "On Hold" pause);
//   - validates the PO format (1–16 chars, alphanumeric + dash/underscore);
//   - flips status to CONFIRMED, sets confirmed_at / confirmed_by;
//   - initialises order_stages so stations see the order;
//   - notifies the creator + assignees via orderNotifier.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { notifyOrderConfirmed } from '$lib/server/notifications/orderNotifier';
import { postStationMessage } from '$lib/server/chat/stationMessenger';

const PO_PATTERN = /^[A-Za-z0-9_\-./]{1,16}$/;
const FIRST_STAGE = 'CAD';
const WORKFLOW_STAGES = [
  'CAD', 'CNC', 'EDGE', 'ASSEMBLY', 'PAINT', 'PACKAGING', 'DELIVERY',
] as const;

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const session = await locals.getSession();
  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: actor, error: actorErr } = await locals.supabase
    .from('profiles')
    .select('id, role, display_name, username')
    .eq('id', session.user.id)
    .single();
  if (actorErr || !actor) {
    return json({ error: 'Profile not found' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const incomingPo: string | null = (body.poNumber ?? body.po_number ?? null)?.trim() || null;

  // Fetch order
  const { data: order, error: fetchError } = await locals.supabase
    .from('draft_orders')
    .select('id, po_number, client, title, status, created_by, internal_ref')
    .eq('id', params.id)
    .single();

  if (fetchError || !order) {
    return json({ error: 'Order not found' }, { status: 404 });
  }

  // Already confirmed → idempotent success
  if (
    order.status === 'CONFIRMED' ||
    order.status === 'IN_PRODUCTION' ||
    order.status === 'READY_TO_LOAD' ||
    order.status === 'DISPATCHED' ||
    order.status === 'approved'
  ) {
    return json({
      ok: true,
      idempotent: true,
      poNumber: order.po_number,
      status: order.status,
    });
  }

  if (
    order.status !== 'PENDING_REVIEW' &&
    order.status !== 'DRAFT' &&
    order.status !== 'draft'
  ) {
    return json(
      { error: `Cannot confirm an order in status ${order.status}` },
      { status: 409 },
    );
  }

  // Resolve final PO. If the order already has one, an HoP can confirm
  // without re-sending it. Otherwise the actor must be Boss and must
  // supply a valid PO.
  const finalPo = incomingPo || order.po_number;
  if (!finalPo) {
    if (actor.role !== 'Boss') {
      return json(
        { error: 'PO number must be assigned by Boss before confirmation' },
        { status: 403 },
      );
    }
    return json({ error: 'poNumber is required' }, { status: 400 });
  }

  if (!PO_PATTERN.test(finalPo)) {
    return json(
      { error: 'PO number must be 1–16 characters (letters, digits, _ - . /)' },
      { status: 400 },
    );
  }

  // If the PO is changing (or being set for the first time), only Boss
  // may make that decision.
  if (finalPo !== order.po_number && actor.role !== 'Boss') {
    return json(
      { error: 'Only Boss can assign or change the PO number' },
      { status: 403 },
    );
  }

  // Apply status transition + PO assignment in one update. Surface
  // unique-violation as a clean 409 so the form can prompt for a new PO.
  const nowIso = new Date().toISOString();
  const { error: updateError } = await locals.supabase
    .from('draft_orders')
    .update({
      po_number: finalPo,
      status: 'CONFIRMED',
      confirmed_at: nowIso,
      confirmed_by: actor.id,
      updated_by: actor.id,
    })
    .eq('id', order.id);

  if (updateError) {
    if (updateError.code === '23505' && /po_number/.test(updateError.message)) {
      return json({ error: 'PO number already in use' }, { status: 409 });
    }
    console.error('Order confirm update failed:', updateError);
    return json({ error: 'Failed to confirm order' }, { status: 500 });
  }

  // Initialise the production pipeline — first stage QUEUED, rest NOT_STARTED.
  const stageRows = WORKFLOW_STAGES.map((station, idx) => ({
    draft_order_id: order.id,
    station,
    state: idx === 0 ? 'QUEUED' : 'NOT_STARTED',
  }));
  const { error: stagesError } = await locals.supabase
    .from('order_stages')
    .upsert(stageRows, { onConflict: 'draft_order_id,station' });
  if (stagesError) {
    console.error('order_stages init failed:', stagesError);
  }

  // Activity log + audit (best-effort)
  await locals.supabase.from('order_activity_log').insert({
    order_id: order.id,
    actor_id: actor.id,
    event_type: 'status_change',
    payload: { from: order.status, to: 'CONFIRMED', po_number: finalPo },
  }).then(({ error }) => {
    if (error) console.error('order_activity_log insert failed:', error);
  });

  // Post a station-room message announcing the order entering CAD.
  try {
    await postStationMessage(locals.supabase, {
      station: FIRST_STAGE,
      poNumber: finalPo,
      state: 'QUEUED',
      actorName: actor.display_name || actor.username || 'system',
    });
  } catch (err) {
    console.error('postStationMessage failed:', err);
  }

  // Notify creator + assignees
  try {
    await notifyOrderConfirmed(locals.supabase, {
      orderId: order.id,
      poNumber: finalPo,
      client: order.client,
      createdById: order.created_by,
      confirmedById: actor.id,
    });
  } catch (err) {
    console.error('notifyOrderConfirmed failed:', err);
  }

  return json({
    ok: true,
    poNumber: finalPo,
    status: 'CONFIRMED',
    firstStage: FIRST_STAGE,
  });
};
