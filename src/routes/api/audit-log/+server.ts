import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const userId = url.searchParams.get('userId');
  const entityType = url.searchParams.get('entityType');
  const entityId = url.searchParams.get('entityId');
  const action = url.searchParams.get('action');
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo = url.searchParams.get('dateTo');

  let query = locals.supabase
    .from('audit_log')
    .select('*', { count: 'exact' });

  if (userId) query = query.eq('user_id', userId);
  if (entityType) query = query.eq('entity_type', entityType);
  if (entityId) query = query.eq('entity_id', entityId);
  if (action) query = query.eq('action', action);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error: dbError } = await query;

  if (dbError) {
    console.error('Audit log query error:', dbError);
    throw error(500, 'Failed to fetch audit logs');
  }

  return json({
    data,
    pagination: {
      total: count,
      limit,
      offset,
      hasMore: count ? (offset + limit) < count : false
    }
  });
};

// POST - Create a custom audit log entry (for manual logging from client)
export const POST: RequestHandler = async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) throw error(401, 'Unauthorized');

    const body = await request.json();
    const { action, entityType, entityId, metadata, oldValues, newValues } = body;

    if (!action) throw error(400, 'Action is required');

    const { error: insertError } = await locals.supabase
        .from('audit_log')
        .insert({
            user_id: session.user.id,
            username: session.user.email, // fallback if profile name not avail
            action,
            entity_type: entityType,
            entity_id: entityId,
            old_values: oldValues,
            new_values: newValues,
            // metadata is not standard in the schema provided earlier, but helpful if JSONB supports it
            // checking schema: old_values JSONB, new_values JSONB. 
            // We'll stick to standard fields.
        });

    if (insertError) throw error(500, 'Failed to create log entry');

    return json({ success: true });
};
