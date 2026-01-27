/**
 * Dashboard Configuration API
 * Manage user dashboard layouts and widgets
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseClient } from '$lib/server/supabase';

// GET /api/analytics/dashboard - Get user dashboards
export const GET: RequestHandler = async ({ url, locals, event }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const defaultOnly = url.searchParams.get('default') === 'true';

  const supabase = createSupabaseClient(event);

  let query = supabase
    .from('dashboard_configs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (defaultOnly) {
    query = query.eq('is_default', true);
  }

  const { data, error: dbError } = await query;

  if (dbError) {
    console.error('[Dashboard API] Error:', dbError);
    throw error(500, 'Failed to fetch dashboards');
  }

  return json({ data });
};

// POST /api/analytics/dashboard - Create dashboard
export const POST: RequestHandler = async ({ request, locals, event }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();
  const {
    name,
    description = null,
    layout = [],
    widgets = [],
    refreshInterval = 30,
    isDefault = false,
    isPublic = false
  } = body;

  if (!name) {
    throw error(400, 'Missing required field: name');
  }

  try {
    const supabase = createSupabaseClient(event);

    // If setting as default, unset other defaults
    if (isDefault) {
      await supabase
        .from('dashboard_configs')
        .update({ is_default: false })
        .eq('user_id', user.id);
    }

    const { data, error: dbError } = await supabase
      .from('dashboard_configs')
      .insert({
        user_id: user.id,
        name,
        description,
        layout,
        widgets,
        refresh_interval: refreshInterval,
        is_default: isDefault,
        is_public: isPublic
      })
      .select()
      .single();

    if (dbError) {
      console.error('[Dashboard API] Create error:', dbError);
      throw error(500, 'Failed to create dashboard');
    }

    return json({ data }, { status: 201 });

  } catch (err) {
    console.error('[Dashboard API] Error:', err);
    throw error(500, 'Failed to create dashboard');
  }
};

// PATCH /api/analytics/dashboard/[id] - Update dashboard
export const PATCH: RequestHandler = async ({ params, request, locals, event }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();

  try {
    const supabase = createSupabaseClient(event);

    // If setting as default, unset other defaults
    if (body.isDefault === true) {
      await supabase
        .from('dashboard_configs')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .neq('id', params.id);
    }

    const { data, error: dbError } = await supabase
      .from('dashboard_configs')
      .update({
        ...body,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (dbError) {
      console.error('[Dashboard API] Update error:', dbError);
      throw error(500, 'Failed to update dashboard');
    }

    return json({ data });

  } catch (err) {
    console.error('[Dashboard API] Error:', err);
    throw error(500, 'Failed to update dashboard');
  }
};

// DELETE /api/analytics/dashboard/[id]
export const DELETE: RequestHandler = async ({ params, locals, event }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  try {
    const supabase = createSupabaseClient(event);

    const { error: dbError } = await supabase
      .from('dashboard_configs')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id);

    if (dbError) {
      console.error('[Dashboard API] Delete error:', dbError);
      throw error(500, 'Failed to delete dashboard');
    }

    return json({ success: true });

  } catch (err) {
    console.error('[Dashboard API] Error:', err);
    throw error(500, 'Failed to delete dashboard');
  }
};