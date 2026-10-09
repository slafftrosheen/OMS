/**
 * Draft order badges API
 * PATCH /api/draft-orders/[id]/badges
 * Persists UI status badges (rush, vip, hot, ...) into draft_orders.badges JSONB.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
// Query using the request-scoped, RLS-aware Supabase client.

// PATCH /api/draft-orders/[id]/badges
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const supabase = locals.supabase;
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { id } = params as { id: string };
  const body = await request.json().catch(() => ({}));
  const badges = Array.isArray(body?.badges) ? body.badges : [];

  try {
    const { data, error: updError } = await supabase
      .from('draft_orders')
      .update({ badges })
      .eq('id', id)
      .select('id, badges')
      .single();

    if (updError) {
      console.error('[Draft badges] update error:', updError);
      throw error(500, 'Failed to update badges');
    }

    return json({ data });
  } catch (err) {
    console.error('[Draft badges] Error:', err);
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw error(500, 'Failed to update badges');
  }
};
