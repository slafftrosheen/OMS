import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  buildCreateChangeRequestArgs,
  CHANGE_REQUEST_SELECT_WITH_ORDER,
  normalizeChangeRequestRow
} from '$lib/server/change-requests/contract';

export const GET: RequestHandler = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const orderId = url.searchParams.get('orderId');
  const status = url.searchParams.get('status');
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '20', 10) || 20));
  let query = locals.supabase
    .from('change_requests')
    .select(CHANGE_REQUEST_SELECT_WITH_ORDER, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (orderId) query = query.eq('order_id', orderId);
  if (status) query = query.eq('status', status);

  const { data, error: dbError, count } = await query;
  if (dbError) {
    console.error('[CR API] List error:', dbError);
    throw error(500, 'Failed to fetch change requests');
  }

  const normalized = (data ?? []).map(normalizeChangeRequestRow);
  return json({
    data: normalized,
    pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) }
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.orderId !== 'string') {
    throw error(400, 'orderId is required');
  }

  let rpcArgs: ReturnType<typeof buildCreateChangeRequestArgs>;
  try {
    rpcArgs = buildCreateChangeRequestArgs(body.orderId, body);
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : 'Invalid change request');
  }

  const { data: id, error: rpcError } = await locals.supabase.rpc('create_change_request', rpcArgs);
  if (rpcError || !id) {
    console.error('[CR API] Create error:', rpcError);
    throw error(500, 'Failed to create change request');
  }

  const { data: created, error: fetchError } = await locals.supabase
    .from('change_requests')
    .select(CHANGE_REQUEST_SELECT_WITH_ORDER)
    .eq('id', id)
    .single();
  if (fetchError || !created) {
    console.error('[CR API] Fetch created CR error:', fetchError);
    throw error(500, 'Change request was created but could not be loaded');
  }

  return json({ data: normalizeChangeRequestRow(created) }, { status: 201 });
};
