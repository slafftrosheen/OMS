// UI telemetry is never authoritative order/audit evidence.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const MANAGEMENT_ROLES = new Set(['RD', 'Boss', 'HeadOfProduction']);
const validName = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-z][a-z0-9._-]{0,63}$/i.test(v);

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw error(400, 'Invalid request body');
  const { action, entityType, details } = body;
  if (!validName(action) || !validName(entityType) ||
      (details !== undefined && (typeof details !== 'string' || details.length > 1000)))
    throw error(400, 'Invalid client activity event');
  // Client-selected username, entity ID and old/new values are never forwarded.
  const { data, error: rpcError } = await locals.supabase.rpc('oms_log_client_event', {
    p_section: entityType, p_action: action, p_details: details ?? null
  });
  if (rpcError) {
    console.error('[Audit Log] Client event rejected', rpcError.code);
    throw error(rpcError.code === 'PGRST202' ? 503 : 400, 'Client activity log unavailable');
  }
  return json({ success: true, id: data }, { headers: { 'Cache-Control': 'private, no-store' } });
};

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  const { data: actor, error: actorError } = await locals.supabase
    .from('profiles').select('role,is_active').eq('id', locals.user.id).maybeSingle();
  if (actorError) throw error(503, 'Permissions unavailable');
  if (!actor?.is_active || !MANAGEMENT_ROLES.has(actor.role)) throw error(403, 'Forbidden');

  const rawLimit = url.searchParams.get('limit') ?? '100';
  if (!/^\d{1,3}$/.test(rawLimit) || Number(rawLimit) < 1)
    throw error(400, 'Invalid limit');
  const limit = Math.min(Number(rawLimit), 500);
  const entityType = url.searchParams.get('entityType');
  if (entityType && !/^[a-z][a-z0-9._:-]{0,80}$/i.test(entityType))
    throw error(400, 'Invalid entity type');

  let query = locals.supabase.from('audit_log')
    .select('id,created_at,username,entity_type,action,old_values,new_values')
    .order('created_at', { ascending: false }).limit(limit);
  if (entityType) query = query.eq('entity_type', entityType);
  const { data, error: dbError } = await query;
  if (dbError) {
    console.error('[Audit Log] Query failed', dbError.code);
    throw error(500, 'Failed to fetch audit logs');
  }
  return json((data ?? []).map(row => ({
    id: row.id, createdAt: row.created_at, username: row.username,
    entityType: row.entity_type, action: row.action,
    details: typeof row.new_values?.details === 'string' ? row.new_values.details : '',
    oldValues: row.old_values, newValues: row.new_values
  })), { headers: { 'Cache-Control': 'private, no-store' } });
};
