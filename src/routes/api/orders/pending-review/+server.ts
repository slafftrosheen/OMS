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

export const GET: RequestHandler = async ({ locals }) => {
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

  const { data, error } = await locals.supabase
    .from('orders_pending_review')
    .select('*')
    .order('priority', { ascending: false })
    .order('due_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('orders_pending_review query failed:', error);
    return json({ error: 'Failed to load review queue' }, { status: 500 });
  }

  return json(data ?? []);
};
