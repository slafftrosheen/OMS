// src/routes/api/orders/[id]/stages/[station]/complete/+server.ts
//
// POST: mark a stage COMPLETED. Optionally declare consumed materials
// in the same call. The whole thing routes through the
// `consume_materials_for_order` RPC so stock deduction + audit trail
// are atomic.
//
// Body shape:
//   {
//     items?: [{ item_id: UUID, quantity: number, notes?: string }],
//     skipped?: boolean,
//     skipReason?: string,
//     actualHours?: number,
//     notes?: string
//   }

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { postStationMessage } from '$lib/server/chat/stationMessenger';
import {
  notifyConsumptionSkipped,
  notifyLowStock,
} from '$lib/server/notifications/inventoryNotifier';

const WORKFLOW_ORDER = ['CAD', 'CNC', 'EDGE', 'ASSEMBLY', 'PAINT', 'PACKAGING', 'DELIVERY'] as const;

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const session = await locals.getSession();
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  const orderId = params.id!;
  const station = (params.station ?? '').toUpperCase();
  const body = await request.json().catch(() => ({} as any));

  const items: Array<{ item_id: string; quantity: number; notes?: string }> =
    Array.isArray(body.items) ? body.items : [];
  const skipped = !!body.skipped;
  const skipReason: string | null = body.skipReason ?? null;

  // Validate: skipped flag and items are mutually exclusive.
  if (skipped && items.length > 0) {
    return json(
      { error: 'Cannot mark consumption as skipped while submitting items' },
      { status: 400 },
    );
  }

  // Resolve order (PO or internal_ref for nicer notifications)
  const { data: order } = await locals.supabase
    .from('draft_orders')
    .select('id, po_number, internal_ref, status')
    .eq('id', orderId)
    .single();
  if (!order) return json({ error: 'Order not found' }, { status: 404 });

  // Promote draft_orders.status to IN_PRODUCTION the first time anything
  // ships from a station. Idempotent.
  if (order.status === 'CONFIRMED' || order.status === 'approved') {
    await locals.supabase
      .from('draft_orders')
      .update({ status: 'IN_PRODUCTION', updated_by: session.user.id })
      .eq('id', orderId);
  }

  // 1. Consumption (if any). Use the RPC so the deduction + audit
  //    trail land atomically.
  let lowStockHits: any[] = [];
  if (items.length > 0) {
    const { data: rpcResult, error: rpcErr } = await locals.supabase.rpc(
      'consume_materials_for_order',
      {
        p_order_id: orderId,
        p_station: station,
        p_items: items,
        p_actor: session.user.id,
      },
    );
    if (rpcErr) {
      console.error('consume_materials_for_order failed:', rpcErr);
      return json({ error: 'Stock deduction failed' }, { status: 500 });
    }
    lowStockHits = rpcResult?.low_stock ?? [];
  }

  // 2. Update the stage row itself.
  const completedAt = new Date().toISOString();
  const stageUpdate: Record<string, unknown> = {
    state: 'COMPLETED',
    completed_at: completedAt,
    consumption_skipped: skipped,
    consumption_skipped_reason: skipped ? skipReason : null,
  };
  if (typeof body.actualHours === 'number') stageUpdate.actual_hours = body.actualHours;
  if (typeof body.notes === 'string') stageUpdate.notes = body.notes;

  const { error: updateErr } = await locals.supabase
    .from('order_stages')
    .update(stageUpdate)
    .eq('draft_order_id', orderId)
    .eq('station', station);
  if (updateErr) {
    console.error('order_stages update failed:', updateErr);
    return json({ error: 'Failed to update stage' }, { status: 500 });
  }

  // 3. Auto-queue the next workflow stage (parity with PATCH /stages).
  const idx = WORKFLOW_ORDER.indexOf(station as any);
  const nextStation =
    idx >= 0 && idx + 1 < WORKFLOW_ORDER.length ? WORKFLOW_ORDER[idx + 1] : null;
  if (nextStation) {
    await locals.supabase
      .from('order_stages')
      .update({ state: 'QUEUED' })
      .eq('draft_order_id', orderId)
      .eq('station', nextStation)
      .eq('state', 'NOT_STARTED');
  }

  // 4. Side effects: chat ping + skip/low-stock notifications.
  const { data: actor } = await locals.supabase
    .from('profiles')
    .select('display_name, username')
    .eq('id', session.user.id)
    .single();

  const refLabel = order.po_number ?? order.internal_ref ?? orderId.slice(0, 8);

  try {
    await postStationMessage(locals.supabase, {
      station,
      poNumber: order.po_number,
      state: 'COMPLETED',
      actorName: actor?.display_name || actor?.username || 'system',
    });
    if (nextStation) {
      await postStationMessage(locals.supabase, {
        station: nextStation,
        poNumber: order.po_number,
        state: 'QUEUED',
        actorName: actor?.display_name || actor?.username || 'system',
      });
    }
  } catch (err) {
    console.error('postStationMessage failed:', err);
  }

  if (skipped) {
    try {
      await notifyConsumptionSkipped(locals.supabase, {
        orderId,
        poOrRef: refLabel,
        station,
        actorId: session.user.id,
        reason: skipReason,
      });
    } catch (err) {
      console.error('notifyConsumptionSkipped failed:', err);
    }
  }

  if (lowStockHits.length > 0) {
    try {
      await notifyLowStock(locals.supabase, {
        orderId,
        poOrRef: refLabel,
        actorId: session.user.id,
        hits: lowStockHits,
      });
    } catch (err) {
      console.error('notifyLowStock failed:', err);
    }
  }

  return json({
    ok: true,
    orderId,
    station,
    nextStation,
    consumed: items.length,
    skipped,
    lowStock: lowStockHits,
  });
};
