// src/routes/api/audit-log/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';
import crypto from 'crypto';

/**
 * Helper to get user ID from session
 */
async function getUserFromSession(cookies: any): Promise<{ id: number; username: string } | null> {
  const token = cookies.get('session');
  if (!token) return null;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const result = await query(
    `SELECT u.id, u.username FROM users u
     JOIN user_sessions s ON s.user_id = u.id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [tokenHash]
  );

  return result.rowCount > 0 ? result.rows[0] : null;
}

/**
 * GET /api/audit-log - List audit log entries
 * Query params: ?limit=100&action=LOGIN&entityType=user
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
  const user = await getUserFromSession(cookies);
  const limit = parseInt(url.searchParams.get('limit') || '100');
  const action = url.searchParams.get('action');
  const entityType = url.searchParams.get('entityType');

  // Only allow admins to view audit logs
  // For now, allow all authenticated users
  if (!user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  let sql = `
    SELECT id, user_id, username, action, entity_type, entity_id,
           old_values, new_values, created_at
    FROM audit_log
    WHERE 1=1
  `;

  const params: any[] = [];
  let idx = 1;

  if (action) {
    sql += ` AND action = $${idx++}`;
    params.push(action);
  }

  if (entityType) {
    sql += ` AND entity_type = $${idx++}`;
    params.push(entityType);
  }

  sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
  params.push(Math.min(limit, 1000));

  try {
    const result = await query(sql, params);

    const logs = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      oldValues: row.old_values,
      newValues: row.new_values,
      createdAt: row.created_at?.toISOString(),
      details: row.new_values?.details || ''
    }));

    return json(logs);
  } catch (err) {
    console.error('Failed to fetch audit logs:', err);
    return json([], { status: 500 });
  }
};

/**
 * POST /api/audit-log - Create audit log entry
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = await getUserFromSession(cookies);
  const data = await request.json();

  if (!data.action) {
    return json({ error: 'Action required' }, { status: 400 });
  }

  try {
    const result = await query(
      `INSERT INTO audit_log (
        user_id, username, action, entity_type, entity_id, new_values
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at`,
      [
        user?.id || null,
        data.username || user?.username || 'anonymous',
        data.action,
        data.entityType || null,
        data.entityId || null,
        data.details ? JSON.stringify({ details: data.details }) : null
      ]
    );

    return json({
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at?.toISOString()
    }, { status: 201 });
  } catch (err) {
    console.error('Failed to create audit log:', err);
    return json({ error: 'Failed to create log' }, { status: 500 });
  }
};
