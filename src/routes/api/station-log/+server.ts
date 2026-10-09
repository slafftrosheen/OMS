/** Legacy singular station-log alias. Translates old PO/note fields to the canonical RPC. */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { stationLogRpcArgs } from '$lib/server/contracts/oms-r01';

async function orderIdForPo(locals: App.Locals, po: string): Promise<string> {
  const { data, error: dbError } = await locals.supabase.from('draft_orders')
    .select('id').eq('po_number', po).maybeSingle();
  if (dbError) {
    console.error('[Station Log] PO lookup failed:', dbError);
    throw error(500, 'Failed to resolve order');
  }
  if (!data) throw error(404, 'Order not found');
  return data.id;
}

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  const po = url.searchParams.get('po');
  const station = url.searchParams.get('station');
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
  let query = locals.supabase.from('station_timeline')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (station) query = query.eq('station', station.toUpperCase());
  if (po) query = query.eq('details->>order_id', await orderIdForPo(locals, po));
  const { data, error: dbError } = await query;
  if (dbError) {
    console.error('[Station Log] List failed:', dbError);
    throw error(500, 'Failed to load station logs');
  }
  return json(data ?? []);
};

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, 'Invalid request body');
  if (typeof body.station !== 'string' || !body.station.trim()) throw error(400, 'station is required');
  const orderId = typeof body.orderId === 'string' && body.orderId
    ? body.orderId
    : typeof body.po === 'string' && body.po
      ? await orderIdForPo(locals, body.po) : undefined;
  const details = {
    notes: typeof body.notes === 'string' ? body.notes : '',
    redo: body.redo === true,
    ...(typeof body.po === 'string' ? { po: body.po } : {})
  };
  const args = stationLogRpcArgs({
    station: body.station,
    orderId,
    logType: body.redo === true ? 'REWORK' : 'STATION_NOTE',
    message: details.notes,
    details
  });
  const { data: id, error: rpcError } = await locals.supabase.rpc('create_station_log', args);
  if (rpcError) {
    console.error('[Station Log] Insert failed:', rpcError);
    throw error(500, 'Failed to create station log');
  }
  return json({ id, station: args.p_station, action: args.p_action, details: args.p_details }, { status: 201 });
};
