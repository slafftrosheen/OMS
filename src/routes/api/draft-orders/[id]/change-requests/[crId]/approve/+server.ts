import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/session';
import { buildReviewChangeRequestArgs } from '$lib/server/change-requests/contract';

export const POST: RequestHandler = async (event) => {
  const actor = await requireAdmin(event);
  const { params, locals } = event;
  const { data: reviewed, error: reviewError } = await locals.supabase.rpc(
    'review_change_request',
    buildReviewChangeRequestArgs(params.crId, 'approved', 'Approved via API')
  );
  if (reviewError) {
    console.error('Error reviewing change request:', reviewError);
    throw error(500, 'Failed to approve change request');
  }

  const { data: applied, error: applyError } = await locals.supabase.rpc('apply_change_request', {
    p_change_request_id: params.crId
  });
  if (applyError) {
    console.error('Error applying change request:', applyError);
    throw error(500, 'Change request was approved, but applying it failed');
  }

  return json({ success: true, applied: true, data: applied, reviewed, actorId: actor.id });
};
