/**
 * Saved Filters API — single-filter operations
 * PATCH /api/filters/[id] - Update a saved filter
 * DELETE /api/filters/[id] - Delete a saved filter
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
// Query using the request-scoped, RLS-aware Supabase client.

// PATCH /api/filters/[id] - Update saved filter
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const supabase = locals.supabase;
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const { id } = params as { id: string };
  const body = await request.json();

  try {
    const { data, error: dbError } = await supabase
      .from('saved_filters')
      .update({
        ...body,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (dbError) {
      console.error('[Filters API] Update error:', dbError);
      throw error(500, 'Failed to update filter');
    }

    return json({ data });

  } catch (err) {
    console.error('[Filters API] Error:', err);
    throw error(500, 'Failed to update filter');
  }
};

// DELETE /api/filters/[id] - Delete saved filter
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const supabase = locals.supabase;
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const { id } = params as { id: string };

  try {
    const { error: dbError } = await supabase
      .from('saved_filters')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (dbError) {
      console.error('[Filters API] Delete error:', dbError);
      throw error(500, 'Failed to delete filter');
    }

    return json({ success: true });

  } catch (err) {
    console.error('[Filters API] Error:', err);
    throw error(500, 'Failed to delete filter');
  }
};
