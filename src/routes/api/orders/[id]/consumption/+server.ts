// src/routes/api/orders/[id]/consumption/+server.ts
//
// GET: per-station + per-item consumption rollup for a single order.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  const session = await locals.getSession();
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await locals.supabase
    .from('station_consumption_summary')
    .select('*')
    .eq('order_id', params.id);

  if (error) {
    console.error('consumption summary query failed:', error);
    return json({ error: 'Failed to load consumption' }, { status: 500 });
  }

  return json(data ?? []);
};
