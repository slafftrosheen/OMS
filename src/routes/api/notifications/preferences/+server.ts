/**
 * Notification Preferences API
 * Manage user email preferences
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
// Query using the request-scoped, RLS-aware Supabase client.

// GET /api/notifications/preferences - Get user preferences
export const GET: RequestHandler = async ({ locals }) => {
  const supabase = locals.supabase;
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  try {
    const { data, error: dbError } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (dbError && dbError.code !== 'PGRST116') { // Not found is ok
      console.error('[Preferences API] Error:', dbError);
      throw error(500, 'Failed to fetch preferences');
    }

    // Create default preferences if none exist
    if (!data) {
      const { data: newPrefs, error: createError } = await supabase
        .from('notification_preferences')
        .insert({ user_id: user.id })
        .select()
        .single();

      if (createError) throw createError;
      return json({ data: newPrefs });
    }

    return json({ data });

  } catch (err) {
    console.error('[Preferences API] Error:', err);
    throw error(500, 'Failed to fetch preferences');
  }
};

// PATCH /api/notifications/preferences - Update preferences
export const PATCH: RequestHandler = async ({ request, locals }) => {
  const supabase = locals.supabase;
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();

  try {
    const { data, error: dbError } = await supabase
      .from('notification_preferences')
      .update({
        ...body,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .select()
      .single();

    if (dbError) {
      console.error('[Preferences API] Update error:', dbError);
      throw error(500, 'Failed to update preferences');
    }

    return json({ data });

  } catch (err) {
    console.error('[Preferences API] Error:', err);
    throw error(500, 'Failed to update preferences');
  }
};