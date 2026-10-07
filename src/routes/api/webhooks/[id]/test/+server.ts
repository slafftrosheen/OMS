/**
 * Webhooks API — test a single endpoint
 * POST /api/webhooks/[id]/test - Fire a test delivery against the endpoint
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';

// POST /api/webhooks/[id]/test
export const POST: RequestHandler = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const { id } = params as { id: string };

  try {
    const { data: endpoint, error: fetchError } = await supabase
      .from('webhook_endpoints')
      .select('*')
      .eq('id', id)
      .eq('created_by', user.id)
      .single();

    if (fetchError || !endpoint) throw error(404, 'Webhook not found');

    // Fire a synthetic ping event to the endpoint.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (endpoint.timeout_seconds ?? 10) * 1000);
    let status = 0;
    let ok = false;
    try {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(endpoint.headers ?? {}) },
        body: JSON.stringify({ type: 'ping', sentAt: new Date().toISOString() }),
        signal: controller.signal
      });
      status = res.status;
      ok = res.ok;
    } catch (e) {
      ok = false;
    } finally {
      clearTimeout(timeout);
    }

    // Record the test delivery.
    await supabase.from('webhook_deliveries').insert({
      endpoint_id: id,
      event_type: 'ping',
      payload: { type: 'ping' },
      response_status: status,
      success: ok
    });

    return json({ success: ok, status });

  } catch (err) {
    console.error('[Webhooks API] Test error:', err);
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw error(500, 'Failed to test webhook');
  }
};
