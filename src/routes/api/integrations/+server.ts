/**
 * Integrations API
 * Manage external service integrations
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';

// GET /api/integrations - List integrations
export const GET: RequestHandler = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const integrationType = url.searchParams.get('type');
  const isActive = url.searchParams.get('isActive');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  let query = supabase
    .from('integrations')
    .select('*', { count: 'exact' })
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (integrationType) query = query.eq('integration_type', integrationType);
  if (isActive) query = query.eq('is_active', isActive === 'true');

  const { data, error: dbError, count } = await query;

  if (dbError) {
    console.error('[Integrations API] List error:', dbError);
    throw error(500, 'Failed to fetch integrations');
  }

  return json({
    data: data || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit)
    }
  });
};

// POST /api/integrations - Create integration
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();
  const {
    integrationType,
    name,
    description = null,
    config = {},
    channels = {},
    subscribedEvents = []
  } = body;

  if (!integrationType || !name || !config) {
    throw error(400, 'Missing required fields: integrationType, name, config');
  }

  try {
    const { data, error: dbError } = await supabase
      .from('integrations')
      .insert({
        integration_type: integrationType,
        name,
        description,
        config,
        channels,
        subscribed_events: subscribedEvents,
        created_by: user.id
      })
      .select()
      .single();

    if (dbError) throw dbError;

    return json({ data }, { status: 201 });

  } catch (err) {
    console.error('[Integrations API] Create error:', err);
    throw error(500, 'Failed to create integration');
  }
};

// PATCH /api/integrations/[id] - Update integration
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();

  try {
    const { data, error: dbError } = await supabase
      .from('integrations')
      .update({
        ...body,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .eq('created_by', user.id)
      .select()
      .single();

    if (dbError) throw dbError;

    return json({ data });

  } catch (err) {
    console.error('[Integrations API] Update error:', err);
    throw error(500, 'Failed to update integration');
  }
};

// DELETE /api/integrations/[id]
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  try {
    const { error: dbError } = await supabase
      .from('integrations')
      .delete()
      .eq('id', params.id)
      .eq('created_by', user.id);

    if (dbError) throw dbError;

    return json({ success: true });

  } catch (err) {
    console.error('[Integrations API] Delete error:', err);
    throw error(500, 'Failed to delete integration');
  }
};