/**
 * Loading Capacity API
 * Provides capacity management and monitoring endpoints
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
// Query using the request-scoped, RLS-aware Supabase client.

// GET /api/loading-days/capacity - Get capacity overview
export const GET: RequestHandler = async ({ url, locals }) => {
  const supabase = locals.supabase;
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const status = url.searchParams.get('status'); // 'ok', 'warning', 'full'

  let query = supabase
    .from('loading_capacity_overview')
    .select('*')
    .order('date', { ascending: true });

  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);
  if (status) query = query.eq('capacity_status', status);

  const { data, error: dbError } = await query;

  if (dbError) {
    console.error('[Capacity API] Error:', dbError);
    throw error(500, 'Failed to fetch capacity data');
  }

  return json({ data });
};

// POST /api/loading-days/capacity/lock - Lock/unlock loading day
export const POST: RequestHandler = async ({ request, locals }) => {
  const supabase = locals.supabase;
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();
  const { loadingDayId, lock } = body;

  if (!loadingDayId || typeof lock !== 'boolean') {
    throw error(400, 'Missing required fields: loadingDayId, lock');
  }

  const { error: dbError } = await supabase
    .rpc('toggle_loading_day_lock', {
      p_loading_day_id: loadingDayId,
      p_lock: lock
    });

  if (dbError) {
    console.error('[Capacity API] Lock error:', dbError);
    throw error(500, 'Failed to toggle loading day lock');
  }

  return json({ success: true, locked: lock });
};