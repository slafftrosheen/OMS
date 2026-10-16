// src/routes/api/orders/[id]/consumption/+server.ts
//
// GET: per-station + per-item consumption rollup for a single order.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  const session = await locals.getSession();
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  // The rollup is a PostgreSQL view and may bypass underlying RLS on older
  // Supabase versions. Explicitly require visibility of the canonical order
  // before exposing inventory movements to any logged-in user.
  const {data:visible,error:visibilityError}=await locals.supabase
    .from('draft_orders').select('id').eq('id',params.id).maybeSingle();
  if(visibilityError)
    return json({error:'Order visibility unavailable'},{status:503});
  if(!visible)return json({error:'Order not found or inaccessible'},{status:404});

  const { data, error } = await locals.supabase
    .from('station_consumption_summary')
    .select('*')
    .eq('order_id', params.id);

  if (error) {
    console.error('consumption summary query failed:', error);
    return json({ error: 'Failed to load consumption' }, { status: 500 });
  }

  return json(data ?? [],{headers:{'Cache-Control':'private, no-store'}});
};
