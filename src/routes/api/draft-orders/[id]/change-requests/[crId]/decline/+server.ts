import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/session';

export const POST: RequestHandler = async (event) => {
  const { params, locals, request } = event;
  await requireAdmin(event);

  const { crId } = params;
  const { reason } = await request.json().catch(() => ({ reason: 'Declined via API' }));

  try {
    const { error: reviewError } = await locals.supabase.rpc('review_change_request', {
      p_cr_id: crId,
      p_status: 'rejected',
      p_comment: reason
    });

    if (reviewError) {
      console.error('Error rejecting change request:', reviewError);
      // Fallback to direct update
      const { error: updateError } = await locals.supabase
        .from('change_requests')
        .update({
          status: 'rejected',
          reviewed_by: (await locals.getSession())?.user.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', crId);
        
      if (updateError) throw updateError;
    }

    return json({ success: true });
  } catch (err: any) {
    console.error('Failed to decline change request:', err);
    throw error(500, err.message || 'Internal server error');
  }
};
