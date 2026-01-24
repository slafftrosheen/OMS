/**
 * Change Request Review API
 * Handles approval/rejection of change requests
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';

// POST /api/change-requests/[id]/review - Approve/Reject CR
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  // Check if user is admin
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    throw error(403, 'Only admins can review change requests');
  }

  const body = await request.json();
  const { status, comment } = body;

  if (!['approved', 'rejected'].includes(status)) {
    throw error(400, 'Status must be "approved" or "rejected"');
  }

  // Review CR using database function
  const { error: dbError } = await supabase
    .rpc('review_change_request', {
      p_cr_id: params.id,
      p_status: status,
      p_comment: comment || null
    });

  if (dbError) {
    console.error('[CR Review API] Error:', dbError);
    throw error(500, 'Failed to review change request');
  }

  // Fetch updated CR
  const { data: updatedCR } = await supabase
    .from('change_requests')
    .select(`
      *,
      proposed_by_user:auth.users!change_requests_proposed_by_fkey(email, id),
      reviewed_by_user:auth.users!change_requests_reviewed_by_fkey(email, id),
      order:draft_orders(id, title, po_number)
    `)
    .eq('id', params.id)
    .single();

  return json({ data: updatedCR });
};