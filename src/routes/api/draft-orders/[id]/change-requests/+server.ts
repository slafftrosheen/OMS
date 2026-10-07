import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildCreateChangeRequestArgs, CHANGE_REQUEST_SELECT, normalizeChangeRequestRow } from '$lib/server/change-requests/contract';

export const GET: RequestHandler = async ({ params, locals }) => {
  const { id } = params;
  const { data, error: dbError } = await locals.supabase
    .from('change_requests')
    .select(CHANGE_REQUEST_SELECT)
    .eq('order_id', id)
    .order('created_at', { ascending: false });

  if (dbError) {
    console.error('Error fetching change requests:', dbError);
    return json({ error: 'Failed to fetch change requests' }, { status: 500 });
  }

  return json((data ?? []).map(normalizeChangeRequestRow));
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw error(400, 'Invalid request body');
  }

  let rpcArgs: ReturnType<typeof buildCreateChangeRequestArgs>;
  try {
    rpcArgs = buildCreateChangeRequestArgs(params.id, body);
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : 'Invalid change request');
  }

  const { data: id, error: rpcError } = await locals.supabase.rpc('create_change_request', rpcArgs);
  if (rpcError || !id) {
    console.error('create_change_request RPC failed:', rpcError);
    throw error(500, 'Failed to create change request');
  }

  const { data: created, error: fetchError } = await locals.supabase
    .from('change_requests')
    .select(CHANGE_REQUEST_SELECT)
    .eq('id', id)
    .single();
  if (fetchError || !created) {
    console.error('Created change request could not be loaded:', fetchError);
    throw error(500, 'Change request was created but could not be loaded');
  }

  return json(normalizeChangeRequestRow(created), { status: 201 });
};
