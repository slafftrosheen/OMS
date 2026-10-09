// Dispatch requires READY_TO_LOAD, completed production and an actual loading link.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canManageSharedInventory } from '$lib/server/authz/shared-data';
import { mayDispatch, productionReadiness } from '$lib/order/lifecycle-guards';

export const POST: RequestHandler = async ({ params, locals }) => {
  const actor = locals.user;
  if (!actor) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageSharedInventory(actor.role)) return json({ error: 'Forbidden' }, { status: 403 });
  const db = locals.supabase;

  const { data: order, error: orderErr } = await db.from('draft_orders')
    .select('*').eq('id', params.id).maybeSingle();
  if (orderErr) return json({ error: 'Failed to load order' }, { status: 500 });
  if (!order) return json({ error: 'Order not found' }, { status: 404 });
  if (order.status === 'DISPATCHED' || order.status === 'ARCHIVED') {
    return json({ ok: true, idempotent: true, status: order.status });
  }
  if (!mayDispatch(order.status) || !order.loading_date) {
    return json({ error: 'Order must be assigned to a loading day before dispatch' }, { status: 409 });
  }

  const { data: stages, error: stagesErr } = await db.from('order_stages')
    .select('station,state').eq('draft_order_id', order.id);
  if (stagesErr) return json({ error: 'Failed to verify production' }, { status: 500 });
  const readiness = productionReadiness(stages ?? []);
  if (!readiness.ready) {
    return json({ error: 'Production or QC incomplete', pendingStations: readiness.pending }, { status: 409 });
  }
  const { data: openRework, error: reworkErr } = await db.from('rework_cycles')
    .select('id').eq('order_id', order.id).is('resolved_at', null).limit(1);
  if (reworkErr) return json({ error: 'Failed to verify rework' }, { status: 500 });
  if (openRework?.length) return json({ error: 'Open rework must be resolved before dispatch' }, { status: 409 });

  // A tentative loading_date alone is NOT proof that the PO was assigned.
  const { data: events, error: eventsErr } = await db.from('calendar_events')
    .select('id').eq('kind', 'loading').eq('date', order.loading_date);
  if (eventsErr) return json({ error: 'Failed to verify loading assignment' }, { status: 500 });
  if (!events?.length) return json({ error: 'No loading event assigned' }, { status: 409 });
  const { data: link, error: linkErr } = await db.from('loading_event_pos')
    .select('id').eq('draft_order_id', order.id)
    .in('loading_event_id', events.map(e => e.id)).limit(1);
  if (linkErr) return json({ error: 'Failed to verify order loading link' }, { status: 500 });
  if (!link?.length) return json({ error: 'Order is not linked to its loading event' }, { status: 409 });

  // Compare-and-set: concurrent dispatches cannot rewrite the same order.
  const { data: dispatched, error: updateErr } = await db.from('draft_orders')
    .update({
      status: 'DISPATCHED', dispatched_at: new Date().toISOString(),
      dispatched_by: actor.id, updated_by: actor.id
    })
    .eq('id', order.id).eq('status', 'READY_TO_LOAD')
    .eq('loading_date', order.loading_date)
    .select('id,status').maybeSingle();
  if (updateErr) {
    console.error('[Dispatch] Update failed', updateErr);
    return json({ error: 'Failed to dispatch' }, { status: 500 });
  }
  if (!dispatched) return json({ error: 'Order changed during dispatch; reload' }, { status: 409 });

  // Revision/audit are informational and must not reverse a committed dispatch.
  let revision: number | null = null;
  try {
    const { data: last } = await db.from('order_revisions')
      .select('revision_number').eq('order_id', order.id)
      .order('revision_number', { ascending: false }).limit(1).maybeSingle();
    revision = (last?.revision_number ?? 0) + 1;
    const { error: revErr } = await db.from('order_revisions').insert({
      order_id: order.id, revision_number: revision, snapshot: order,
      created_by: actor.id, note: 'dispatch snapshot'
    });
    if (revErr) { console.error('[Dispatch] Revision snapshot failed', revErr); revision = null; }
    const { error: auditErr } = await db.from('order_activity_log').insert({
      order_id: order.id, actor_id: actor.id, event_type: 'status_change',
      payload: { from: 'READY_TO_LOAD', to: 'DISPATCHED' }
    });
    if (auditErr) console.error('[Dispatch] Activity logging failed', auditErr);
  } catch (err) { console.error('[Dispatch] Best-effort audit failed', err); revision = null; }

  return json({ ok: true, status: 'DISPATCHED', revision });
};
