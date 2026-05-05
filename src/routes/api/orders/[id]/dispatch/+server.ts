// src/routes/api/orders/[id]/dispatch/+server.ts
//
// POST: mark a confirmed/in-production order as dispatched. Snapshots
// the row into order_revisions and flips status to DISPATCHED. From
// here a nightly job (or the archive endpoint) can move it to ARCHIVED.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const PRIVILEGED_ROLES = new Set(['RD', 'Boss', 'HeadOfProduction']);
const DISPATCHABLE = new Set(['READY_TO_LOAD', 'IN_PRODUCTION', 'CONFIRMED']);

export const POST: RequestHandler = async ({ params, locals }) => {
  const session = await locals.getSession();
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  const { data: actor } = await locals.supabase
    .from('profiles')
    .select('id, role')
    .eq('id', session.user.id)
    .single();
  if (!actor || !PRIVILEGED_ROLES.has(actor.role)) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: order } = await locals.supabase
    .from('draft_orders')
    .select('*')
    .eq('id', params.id)
    .single();
  if (!order) return json({ error: 'Order not found' }, { status: 404 });

  if (order.status === 'DISPATCHED' || order.status === 'ARCHIVED') {
    return json({ ok: true, idempotent: true, status: order.status });
  }
  if (!DISPATCHABLE.has(order.status)) {
    return json(
      { error: `Cannot dispatch from status ${order.status}` },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();

  // Snapshot for the revision history. Best-effort.
  const { data: lastRev } = await locals.supabase
    .from('order_revisions')
    .select('revision_number')
    .eq('order_id', order.id)
    .order('revision_number', { ascending: false })
    .limit(1)
    .single();
  const nextRev = (lastRev?.revision_number ?? 0) + 1;
  await locals.supabase
    .from('order_revisions')
    .insert({
      order_id: order.id,
      revision_number: nextRev,
      snapshot: order,
      created_by: actor.id,
      note: 'dispatch snapshot',
    })
    .then(({ error }) => { if (error) console.error('order_revisions insert failed:', error); });

  const { error: updateErr } = await locals.supabase
    .from('draft_orders')
    .update({
      status: 'DISPATCHED',
      dispatched_at: nowIso,
      dispatched_by: actor.id,
      updated_by: actor.id,
    })
    .eq('id', order.id);
  if (updateErr) {
    console.error('dispatch update failed:', updateErr);
    return json({ error: 'Failed to dispatch' }, { status: 500 });
  }

  await locals.supabase.from('order_activity_log').insert({
    order_id: order.id,
    actor_id: actor.id,
    event_type: 'status_change',
    payload: { from: order.status, to: 'DISPATCHED' },
  }).then(({ error }) => { if (error) console.error('activity_log insert failed:', error); });

  return json({ ok: true, status: 'DISPATCHED', revision: nextRev });
};
