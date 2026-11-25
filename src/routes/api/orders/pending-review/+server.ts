// src/routes/api/orders/pending-review/+server.ts
//
// GET: list draft orders awaiting Head of Production review.
//
// Visibility is enforced by the `is_draft_visible_to_user` RLS policy on
// draft_orders, but we also gate the route by role so the bare endpoint
// returns 403 for Operator / StationHead — keeps the queue private.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const PRIVILEGED_ROLES = new Set(['RD', 'Boss', 'HeadOfProduction']);

export const GET: RequestHandler = async ({ locals, url }) => {
  const session = await locals.getSession();
  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: actor } = await locals.supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();
  if (!actor || !PRIVILEGED_ROLES.has(actor.role)) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  const orderId = url.searchParams.get('order');
  if (orderId !== null && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(orderId))
    return json({ error: 'Invalid order ID' }, { status: 400 });

  let query = locals.supabase.from('orders_pending_review').select('*');
  if (orderId) query = query.eq('id', orderId);
  const { data, error } = await query
    .order('priority', { ascending: false })
    .order('due_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('orders_pending_review query failed:', error);
    return json({ error: 'Failed to load review queue' }, { status: 500 });
  }

  return json(data ?? [], { headers: { 'Cache-Control':'private, no-store' } });
};
