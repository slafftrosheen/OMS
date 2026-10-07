/**
 * Webhooks API — single-endpoint operations
 * PATCH /api/webhooks/[id] - Update a webhook endpoint
 * DELETE /api/webhooks/[id] - Delete a webhook endpoint
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';

// PATCH /api/webhooks/[id] - Update webhook
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const { id } = params as { id: string };
  const body = await request.json();

  try {
    const { data, error: dbError } = await supabase
      .from('webhook_endpoints')
      .update({
        ...body,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
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

  const { id } = params as { id: string };

  try {
    const { error: dbError } = await supabase
      .from('webhook_endpoints')
      .delete()
      .eq('id', id)
      .eq('created_by', user.id);

    if (dbError) throw dbError;

    return json({ success: true });

  } catch (err) {
    console.error('[Webhooks API] Delete error:', err);
    throw error(500, 'Failed to delete webhook');
  }
};
