/**
 * Webhooks API
 * Manage webhook endpoints and deliveries
 */

import { json, error } from ' @sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';
import { WebhookService } from '$lib/server/webhook-service';

// GET /api/webhooks - List webhooks
export const GET: RequestHandler = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const isActive = url.searchParams.get('isActive');
  const eventType = url.searchParams.get('eventType');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  let query = supabase
    .from('webhook_endpoints')
    .select(`
      *,
      delivery_stats:webhook_deliveries(count)
    `, { count: 'exact' })
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (isActive) query = query.eq('is_active', isActive === 'true');
  if (eventType) query = query.contains('events', [eventType]);

  const { data, error: dbError, count } = await query;

  if (dbError) {
    console.error('[Webhooks API] List error:', dbError);
    throw error(500, 'Failed to fetch webhooks');
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

// POST /api/webhooks - Create webhook
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();
  const {
    name,
    description = null,
    url,
    authType = 'none',
    authConfig = null,
    events = [],
    filters = null,
    headers = {},
    timeoutSeconds = 30,
    retryEnabled = true,
    maxRetries = 3
  } = body;

  if (!name || !url || events.length === 0) {
    throw error(400, 'Missing required fields: name, url, events');
  }

  try {
    const { data, error: dbError } = await supabase
      .from('webhook_endpoints')
      .insert({
        name,
        description,
        url,
        auth_type: authType,
        auth_config: authConfig,
        events,
        filters,
        headers,
        timeout_seconds: timeoutSeconds,
        retry_enabled: retryEnabled,
        max_retries: maxRetries,
        created_by: user.id
      })
      .select()
      .single();

    if (dbError) throw dbError;

    return json({ data }, { status: 201 });

  } catch (err) {
    console.error('[Webhooks API] Create error:', err);
    throw error(500, 'Failed to create webhook');
  }
};

// PATCH /api/webhooks/[id] - Update webhook
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();

  try {
    const { data, error: dbError } = await supabase
      .from('webhook_endpoints')
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
    console.error('[Webhooks API] Update error:', err);
    throw error(500, 'Failed to update webhook');
  }
};

// DELETE /api/webhooks/[id]
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  try {
    const { error: dbError } = await supabase
      .from('webhook_endpoints')
      .delete()
      .eq('id', params.id)
      .eq('created_by', user.id);

    if (dbError) throw dbError;

    return json({ success: true });

  } catch (err) {
    console.error('[Webhooks API] Delete error:', err);
    throw error(500, 'Failed to delete webhook');
  }
};