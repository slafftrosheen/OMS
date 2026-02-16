import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/session';

export const POST: RequestHandler = async (event) => {
  const { params, locals } = event;
  await requireAdmin(event);

  const { crId } = params;

  try {
    // 1. Mark as reviewed and approved
    const { error: reviewError } = await locals.supabase.rpc('review_change_request', {
      p_cr_id: crId,
      p_status: 'approved',
      p_comment: 'Approved via API'
    });

    if (reviewError) {
      console.error('Error reviewing change request:', reviewError);
      // If RPC fails, try direct update
      const { error: updateError } = await locals.supabase
        .from('change_requests')
        .update({
          status: 'approved',
          reviewed_by: (await locals.getSession())?.user.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', crId);
        
      if (updateError) throw updateError;
    }

    // 2. Apply the changes
    const { error: applyError } = await locals.supabase.rpc('apply_change_request', {
      p_cr_id: crId
    });

    if (applyError) {
      console.warn('RPC apply_change_request failed or not found, changes not automatically merged', applyError);
      // In a real system, we'd manually fetch CR.changes and update draft_orders here
      // For now, we'll return success for the approval part
      return json({ 
        success: true, 
        message: 'Change request approved, but manual application might be required.',
        applied: false 
      });
    }

    return json({ success: true, applied: true });
  } catch (err: any) {
    console.error('Failed to approve change request:', err);
    throw error(500, err.message || 'Internal server error');
  }
};
