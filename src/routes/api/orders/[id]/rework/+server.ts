import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isKnownStation } from '$lib/order/workflow';
import { canOperateStation } from '$lib/order/lifecycle-guards';

export const GET: RequestHandler = async ({ params, locals, url }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  const station = url.searchParams.get('station');
  let q = locals.supabase.from('rework_cycles')
    .select('*').eq('order_id', params.id).order('created_at', { ascending: false });
  if (station) q = q.eq('station', station.toUpperCase());
  const { data, error } = await q;
  if (error) return json({ error: 'Failed to load rework cycles' }, { status: 500 });
  return json(data ?? []);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.station !== 'string' || typeof body.reason !== 'string' ||
      typeof body.description !== 'string' || !body.description.trim()) {
    return json({ error: 'Station, reason and description are required' }, { status: 400 });
  }
  const station = body.station.toUpperCase();
  if (!isKnownStation(station)) return json({ error: 'Unknown station' }, { status: 400 });
  if (!canOperateStation(user, station)) return json({ error: 'Station assignment required' }, { status: 403 });
  const { data, error } = await locals.supabase.rpc('open_order_rework', {
    p_order_id: params.id, p_station: station,
    p_reason: body.reason, p_description: body.description
  });
  if (error) {
    console.error('[Rework] Open failed', error);
    const missing = error.code === 'PGRST202';
    return json({ error: missing ? 'Rework migration not installed' : 'Rework request rejected' },
      { status: missing ? 503 : 409 });
  }
  return json(data, { status: 201 });
};

export const PATCH: RequestHandler = async ({ params, request, locals, url }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  const reworkId = url.searchParams.get('rework_id');
  const body = await request.json().catch(() => null);
  const resolution = body?.resolution_notes;
  if (!reworkId || typeof resolution !== 'string' || !resolution.trim()) {
    return json({ error: 'rework_id and resolution_notes required' }, { status: 400 });
  }
  const { data, error } = await locals.supabase.rpc('resolve_order_rework', {
    p_order_id: params.id, p_rework_id: reworkId, p_resolution: resolution.trim()
  });
  if (error) {
    console.error('[Rework] Resolve failed', error);
    const missing = error.code === 'PGRST202';
    return json({ error: missing ? 'Rework migration not installed' : 'Rework resolution rejected' },
      { status: missing ? 503 : 409 });
  }
  return json(data);
};
