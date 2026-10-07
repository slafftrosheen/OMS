/**
 * Draft order redo API
 * POST /api/draft-orders/[id]/redo
 * Marks an order for rework: bumps rework_count (via the `increment` RPC added
 * in 20260810000001) and sets the order state back to REWORK.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';

// POST /api/draft-orders/[id]/redo
export const POST: RequestHandler = async ({ params, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { id } = params as { id: string };

  try {
    // Bump the rework counter (increment RPC — created in migration 20260810000001)
    const { error: incError } = await supabase.rpc('increment', { row_id: id });
    if (incError) {
      console.error('[Draft redo] increment error:', incError);
      // Non-fatal: continue and just set status.
    }

    const { data, error: updError } = await supabase
      .from('draft_orders')
      .update({ status: 'REWORK' })
      .eq('id', id)
      .select('id, status, rework_count')
      .single();

    if (updError) {
      console.error('[Draft redo] update error:', updError);
      throw error(500, 'Failed to mark order for rework');
    }

    return json({ data });
  } catch (err) {
    console.error('[Draft redo] Error:', err);
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw error(500, 'Failed to mark order for rework');
  }
};
