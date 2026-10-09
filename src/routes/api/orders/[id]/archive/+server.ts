// src/routes/api/orders/[id]/archive/+server.ts
//
// POST: archive a dispatched order. Files stay attached. is_backed_up
// stays false until a backup pipeline runs (out of scope here).

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const PRIVILEGED_ROLES = new Set(['RD', 'Boss', 'HeadOfProduction']);

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
    .select('id, status')
    .eq('id', params.id)
    .single();
  if (!order) return json({ error: 'Order not found' }, { status: 404 });

  if (order.status === 'ARCHIVED') return json({ ok: true, idempotent: true });
  if (order.status !== 'DISPATCHED') {
    return json(
      { error: 'Only dispatched orders can be archived' },
      { status: 409 },
    );
  }

  const { data: changed, error } = await locals.supabase
    .from('draft_orders')
    .update({
      status: 'ARCHIVED',
      archived_at: new Date().toISOString(),
      updated_by: actor.id,
    })
    .eq('id', order.id).eq('status', 'DISPATCHED')
    .select('id,status').maybeSingle();
  if (error) {
    console.error('archive update failed:', error);
    return json({ error: 'Failed to archive' }, { status: 500 });
  }

  if (!changed) return json({ error: 'Order changed during archive; reload' }, { status: 409 });
  return json({ ok: true, status: 'ARCHIVED' });
};
