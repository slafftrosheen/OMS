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
import { WORKFLOW_STATIONS } from '$lib/order/workflow';
import { mayConfirm } from '$lib/order/lifecycle-guards';

const PO_PATTERN = /^[A-Za-z0-9_\-./]{1,16}$/;
const FIRST_STAGE = WORKFLOW_STATIONS[0];

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
  const rawPo = body?.poNumber ?? body?.po_number ?? null;
  if (rawPo !== null && typeof rawPo !== 'string') {
    return json({ error: 'poNumber must be text' }, { status: 400 });
  }
  const incomingPo: string | null = rawPo?.trim() || null;

  // Fetch order
  const { data: order, error: fetchError } = await locals.supabase
    .from('draft_orders')
    .select('id, po_number, client, title, status, created_by, internal_ref')
    .eq('id', params.id)
    .single();

  if (fetchError || !order) {
    return json({ error: 'Order not found' }, { status: 404 });
  }

  // Only manufacturing managers may confirm; idempotency is not an authorization bypass.
  if (!['RD', 'Boss', 'HeadOfProduction'].includes(actor.role)) {
    return json({ error: 'Confirmation requires manufacturing management' }, { status: 403 });
  }

  // Already confirmed → idempotent success
  if (
    order.status === 'CONFIRMED' ||
    order.status === 'IN_PRODUCTION' ||
    order.status === 'READY_TO_LOAD' ||
    order.status === 'DISPATCHED' ||
    order.status === 'approved'
  ) {
    if (incomingPo && incomingPo !== order.po_number) {
      return json({ error: 'PO cannot change after confirmation' }, { status: 409 });
    }
    return json({
      ok: true,
      idempotent: true,
      poNumber: order.po_number,
      status: order.status,
    });
  }

  if (!mayConfirm(order.status)) {
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

  // DB transaction performs both stage initialization and status publish,
  // with row locking, manager/PO authorization and idempotency checks.
  const { data: confirmation, error: confirmError } = await locals.supabase.rpc(
    'confirm_order_with_stages', {
      p_order_id: order.id,
      p_po_number: incomingPo
    }
  );
  if (confirmError) {
    console.error('[Confirm] Atomic confirmation failed', confirmError);
    if (confirmError.code === 'PGRST202') {
      return json({ error: 'Confirmation database migration is not installed' }, { status: 503 });
    }
    if (confirmError.code === '23505') {
      return json({ error: 'PO number already in use' }, { status: 409 });
    }
    return json({ error: 'Order confirmation rejected; check PO, role and current state' }, { status: 409 });
  }
  if (!confirmation?.ok) return json({ error: 'Order confirmation returned no result' }, { status: 500 });

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
