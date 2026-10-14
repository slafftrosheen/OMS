import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw error(400, 'Invalid request body');
  }

  const { username, action, entityType, details, entityId, oldValues, newValues } = body;
  if (!username || !action || !entityType) {
    throw error(400, 'username, action, and entityType are required');
  }

  try {
    const { data, error: rpcError } = await locals.supabase.rpc('create_audit_log', {
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: entityId ?? null,
      p_old_values: oldValues ?? null,
      p_new_values: newValues ?? null
    });

    if (rpcError) {
      console.error('[Audit Log] RPC error:', rpcError);
      throw error(500, 'Failed to create audit log');
    }

    return json({ success: true, id: data });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('[Audit Log] Unexpected error:', err);
    throw error(500, 'Internal server error');
  }
};

export const GET: RequestHandler = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const limit = Math.min(Number(url.searchParams.get('limit') ?? '100'), 500);
  const entityType = url.searchParams.get('entityType') ?? null;

  try {
    let query = locals.supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (entityType) {
      query = query.eq('entity_type', entityType);
    }

    const { data, error: dbError } = await query;

    if (dbError) {
      console.error('[Audit Log] Query error:', dbError);
      throw error(500, 'Failed to fetch audit logs');
    }

    return json((data ?? []).map(row => ({
      id: row.id,
      createdAt: row.created_at,
      username: row.username,
      entityType: row.entity_type,
      action: row.action,
      details: row.details,
      oldValues: row.old_values,
      newValues: row.new_values
    })));
  } catch (err: any) {
    if (err.status) throw err;
    console.error('[Audit Log] Unexpected error:', err);
    throw error(500, 'Internal server error');
  }
};