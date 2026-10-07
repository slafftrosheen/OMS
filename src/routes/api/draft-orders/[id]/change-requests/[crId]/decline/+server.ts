import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/session';
import { buildReviewChangeRequestArgs } from '$lib/server/change-requests/contract';

export const POST: RequestHandler = async (event) => {
  await requireAdmin(event);
  const { params, locals, request } = event;
  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  const { error: reviewError } = await locals.supabase.rpc(
    'review_change_request',
    buildReviewChangeRequestArgs(params.crId, 'rejected', reason || null)
  );
  if (reviewError) {
    console.error('Error rejecting change request:', reviewError);
    throw error(500, 'Failed to reject change request');
  }

  return json({ success: true });
};
