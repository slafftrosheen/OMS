/**
 * Loading Capacity API
 * Provides capacity management and monitoring endpoints
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canManageSharedInventory } from '$lib/server/authz/shared-data';
import { capacityStateFilter } from '$lib/server/contracts/oms-r01';
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
  const state = capacityStateFilter(status);
  if (status && !state) throw error(400, 'Invalid capacity status');
  if (state) query = query.eq('state', state);

  const { data, error: dbError } = await query;

  if (dbError) {
    console.error('[Capacity API] Error:', dbError);
    throw error(500, 'Failed to fetch capacity data');
  }

  return json({ data });
};

// POST /api/loading-days/capacity — set a requested lock state idempotently.
// Do not call toggle_loading_day_lock(p_date): it cannot express a requested state,
// and its SECURITY DEFINER implementation only checks that a user is authenticated.
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  if (!canManageSharedInventory(locals.user.role)) throw error(403, 'Loading-day management requires an elevated role');

  const body = await request.json().catch(() => null);
  if (!body || typeof body.loadingDayId !== 'string' || typeof body.lock !== 'boolean') {
    throw error(400, 'loadingDayId and boolean lock are required');
  }

  const { data: updated, error: dbError } = await locals.supabase
    .from('loading_days')
    .update({ is_blocked: body.lock })
    .eq('id', body.loadingDayId)
    .select('id, date, is_blocked')
    .maybeSingle();

  if (dbError) {
    console.error('[Capacity API] Lock update failed:', dbError);
    throw error(500, 'Failed to update loading-day lock');
  }
  if (!updated) throw error(404, 'Loading day not found');
  return json({ success: true, locked: updated.is_blocked, date: updated.date });
};
