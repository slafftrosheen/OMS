import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { orderSearchArgs, safeSearchQuery, searchRange } from '$lib/server/api-contracts';

export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, 'Invalid request body');
  const queryText = safeSearchQuery(body.query);
  const { limit, offset } = searchRange(body.limit, body.offset);

  if (queryText) {
    const { data: found, error: rpcError } = await locals.supabase.rpc('search_orders', orderSearchArgs(queryText));
    if (rpcError) {
      console.error('search_orders RPC failed:', rpcError);
      throw error(500, 'Order search failed');
    }
    const rows = found ?? [];
    if (!rows.length) return json({ data: [], count: 0, limit, offset });
    const ids = rows.slice(offset, offset + limit).map((row: any) => row.id);
    const { data: orders, error: fetchError } = await locals.supabase.from('order_summary').select('*').in('id', ids);
    if (fetchError) throw error(500, 'Failed to load matching orders');
    return json({ data: orders ?? [], count: rows.length, limit, offset });
  }

  let query = locals.supabase.from('order_summary').select('*', { count: 'exact' });
  const status = Array.isArray(body.status) ? body.status.filter((v: unknown): v is string => typeof v === 'string') : typeof body.status === 'string' ? [body.status] : [];
  const priority = Array.isArray(body.priority) ? body.priority.filter((v: unknown): v is string => typeof v === 'string') : typeof body.priority === 'string' ? [body.priority] : [];
  if (status.length) query = query.in('status', status);
  if (priority.length) query = query.in('priority', priority);
  if (body.client) query = query.ilike('client', `%${String(body.client).replace(/[%_]/g, '')}%`);
  if (body.is_rd !== undefined) query = query.eq('is_rd', body.is_rd === true);
  if (body.due_date_from) query = query.gte('due_date', body.due_date_from);
  if (body.due_date_to) query = query.lte('due_date', body.due_date_to);
  if (body.loading_date) query = query.eq('loading_date', body.loading_date);
  if (body.current_station) query = query.eq('current_station', body.current_station);
  if (body.has_blocked === true) query = query.contains('stages', [{ state: 'BLOCKED' }]);
  if (body.has_rework === true) query = query.contains('stages', [{ state: 'REWORK' }]);
  const requestedSort = typeof body.sort_by === 'string' ? body.sort_by : '';
  const sortColumn = ['priority', 'due_date', 'created_at', 'client', 'po_number', 'status'].includes(requestedSort) ? requestedSort : 'priority';
  query = query.order(sortColumn, { ascending: body.sort_order === 'asc' });
  query = query.range(offset, offset + limit - 1);

  const { data, error: queryError, count } = await query;
  if (queryError) throw error(500, 'Failed to filter orders');
  return json({ data: data ?? [], count: count ?? 0, limit, offset });
};
