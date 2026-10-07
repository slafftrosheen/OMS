import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/api/helpers';
import { CHANGE_REQUEST_SELECT_WITH_ORDER, normalizeChangeRequestRow, buildReviewChangeRequestArgs } from '$lib/server/change-requests/contract';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  requireAdmin(locals);
  const body = await request.json().catch(() => null);
  const status = body?.status;
  if (status !== 'approved' && status !== 'rejected') {
    throw error(400, 'Status must be "approved" or "rejected"');
  }

  const { error: dbError } = await locals.supabase.rpc(
    'review_change_request',
    buildReviewChangeRequestArgs(params.id, status, typeof body.comment === 'string' ? body.comment : null)
  );
  if (dbError) {
    console.error('[CR Review API] Error:', dbError);
    throw error(500, 'Failed to review change request');
  }

  const { data: updatedCR, error: fetchError } = await locals.supabase
    .from('change_requests')
    .select(CHANGE_REQUEST_SELECT_WITH_ORDER)
    .eq('id', params.id)
    .single();
  if (fetchError || !updatedCR) throw error(500, 'Failed to load reviewed change request');

  return json({ data: normalizeChangeRequestRow(updatedCR) });
};
