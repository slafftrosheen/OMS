/** Station activity API using the deployed 3-argument RPC contract. */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { stationLogRpcArgs, type StationLogInput } from '$lib/server/contracts/oms-r01';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  const orderId = url.searchParams.get('orderId');
  const station = url.searchParams.get('station');
  const type = url.searchParams.get('type');
  const issuesOnly = url.searchParams.get('issuesOnly') === 'true';
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
  const offset = (page - 1) * limit;

  // Deployed station_timeline view: station, action, details, created_at,
  // user_name, username. No id/order_id/log_type/is_issue columns.
  let query = locals.supabase.from('station_timeline')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (station) query = query.eq('station', station.toUpperCase());
  if (type) query = query.eq('action', type);
  if (orderId) query = query.eq('details->>order_id', orderId);
  if (issuesOnly) query = query.eq('details->>is_issue', 'true');

  const { data, error: dbError, count } = await query;
  if (dbError) {
    console.error('[Station Logs] Query failed:', dbError);
    throw error(500, 'Failed to load station logs');
  }
  return json({
    data: data ?? [],
    pagination: {
      page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit)
    }
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, 'Invalid request body');
  let args: ReturnType<typeof stationLogRpcArgs>;
  try {
    const input = body as StationLogInput;
    args = stationLogRpcArgs(input);
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : 'Invalid station log');
  }
  const { data: logId, error: rpcError } = await locals.supabase.rpc('create_station_log', args);
  if (rpcError) {
    console.error('[Station Logs] create_station_log failed:', rpcError);
    throw error(500, 'Failed to create station log');
  }
  // The RPC returns a UUID; station_timeline has no id to look up.
  return json({
    data: { id: logId, station: args.p_station, action: args.p_action, details: args.p_details }
  }, { status: 201 });
};
