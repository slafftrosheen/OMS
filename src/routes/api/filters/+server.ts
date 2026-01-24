/**
 * Saved Filters API
 * Manage user-saved search filters
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';

// GET /api/filters - List saved filters
export const GET: RequestHandler = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const publicOnly = url.searchParams.get('public') === 'true';
  const favoritesOnly = url.searchParams.get('favorites') === 'true';

  let query = supabase
    .from('saved_filters')
    .select('*')
    .order('last_used_at', { ascending: false, nullsFirst: false });

  if (publicOnly) {
    query = query.eq('is_public', true);
  } else {
    query = query.or(`user_id.eq.${user.id},is_public.eq.true`);
  }

  if (favoritesOnly) {
    query = query.eq('is_favorite', true);
  }

  const { data, error: dbError } = await query;

  if (dbError) {
    console.error('[Filters API] List error:', dbError);
    throw error(500, 'Failed to fetch filters');
  }

  return json({ data });
};

// POST /api/filters - Create saved filter
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();
  const {
    name,
    description = null,
    filters,
    sortBy = null,
    sortDirection = null,
    isPublic = false,
    isFavorite = false,
    tags = []
  } = body;

  if (!name || !filters) {
    throw error(400, 'Missing required fields: name, filters');
  }

  try {
    const { data, error: dbError } = await supabase
      .from('saved_filters')
      .insert({
        user_id: user.id,
        name,
        description,
        filters,
        sort_by: sortBy,
        sort_direction: sortDirection,
        is_public: isPublic,
        is_favorite: isFavorite,
        tags
      })
      .select()
      .single();

    if (dbError) {
      console.error('[Filters API] Create error:', dbError);
      throw error(500, 'Failed to save filter');
    }

    return json({ data }, { status: 201 });

  } catch (err) {
    console.error('[Filters API] Error:', err);
    throw error(500, 'Failed to save filter');
  }
};

// PATCH /api/filters/[id] - Update saved filter
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();

  try {
    const { data, error: dbError } = await supabase
      .from('saved_filters')
      .update({
        ...body,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
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
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  try {
    const { error: dbError } = await supabase
      .from('saved_filters')
      .delete()
      .eq('id', params.id)
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