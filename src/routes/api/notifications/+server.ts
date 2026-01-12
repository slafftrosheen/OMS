// src/routes/api/notifications/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';
import crypto from 'crypto';

/**
 * Helper to get user ID from session
 */
async function getUserIdFromSession(cookies: any): Promise<number | null> {
  const token = cookies.get('session');
  if (!token) return null;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const result = await query(
    `SELECT user_id FROM user_sessions WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash]
  );

  return result.rowCount > 0 ? result.rows[0].user_id : null;
}

/**
 * GET /api/notifications - List user notifications
 * Query params: ?unreadOnly=true&limit=50
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
  const userId = await getUserIdFromSession(cookies);
  const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
  const limit = parseInt(url.searchParams.get('limit') || '50');

  if (!userId) {
    return json([]);
  }

  let sql = `
    SELECT id, notification_type, title, message, link, is_read, 
           source_type, source_id, created_at, read_at
    FROM notifications
    WHERE user_id = $1 AND is_dismissed = false
  `;

  const params: any[] = [userId];
  let idx = 2;

  if (unreadOnly) {
    sql += ` AND is_read = false`;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
  params.push(Math.min(limit, 200));

  try {
    const result = await query(sql, params);

    const notifications = result.rows.map(row => ({
      id: row.id,
      type: row.notification_type,
      title: row.title,
      message: row.message,
      link: row.link,
      isRead: row.is_read,
      sourceType: row.source_type,
      sourceId: row.source_id,
      createdAt: row.created_at?.toISOString(),
      readAt: row.read_at?.toISOString()
    }));

    return json(notifications);
  } catch (err) {
    console.error('Failed to fetch notifications:', err);
    return json([], { status: 500 });
  }
};

/**
 * POST /api/notifications - Create notification
 */
export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();

  if (!data.userId || !data.title || !data.type) {
    return json({ error: 'userId, title, and type required' }, { status: 400 });
  }

  try {
    const result = await query(
      `INSERT INTO notifications (
        user_id, notification_type, title, message, link, source_type, source_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, notification_type, title, message, link, is_read, created_at`,
      [
        data.userId,
        data.type,
        data.title,
        data.message || '',
        data.link || null,
        data.sourceType || null,
        data.sourceId || null
      ]
    );

    const notif = result.rows[0];
    return json({
      id: notif.id,
      type: notif.notification_type,
      title: notif.title,
      message: notif.message,
      link: notif.link,
      isRead: notif.is_read,
      createdAt: notif.created_at?.toISOString()
    }, { status: 201 });
  } catch (err) {
    console.error('Failed to create notification:', err);
    return json({ error: 'Failed to create notification' }, { status: 500 });
  }
};

/**
 * PUT /api/notifications - Mark notifications as read
 */
export const PUT: RequestHandler = async ({ request, cookies }) => {
  const userId = await getUserIdFromSession(cookies);
  const data = await request.json();

  if (!userId) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    if (data.markAllRead) {
      await query(
        `UPDATE notifications SET is_read = true, read_at = NOW() 
         WHERE user_id = $1 AND is_read = false`,
        [userId]
      );
    } else if (data.ids && Array.isArray(data.ids)) {
      await query(
        `UPDATE notifications SET is_read = true, read_at = NOW() 
         WHERE user_id = $1 AND id = ANY($2)`,
        [userId, data.ids]
      );
    }

    return json({ success: true });
  } catch (err) {
    console.error('Failed to update notifications:', err);
    return json({ error: 'Failed to update notifications' }, { status: 500 });
  }
};

/**
 * DELETE /api/notifications - Dismiss notifications
 */
export const DELETE: RequestHandler = async ({ url, cookies }) => {
  const userId = await getUserIdFromSession(cookies);
  const notificationId = url.searchParams.get('id');

  if (!userId) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    if (notificationId) {
      await query(
        `UPDATE notifications SET is_dismissed = true WHERE user_id = $1 AND id = $2`,
        [userId, notificationId]
      );
    } else {
      // Dismiss all read notifications
      await query(
        `UPDATE notifications SET is_dismissed = true WHERE user_id = $1 AND is_read = true`,
        [userId]
      );
    }

    return json({ success: true });
  } catch (err) {
    console.error('Failed to dismiss notifications:', err);
    return json({ error: 'Failed to dismiss notifications' }, { status: 500 });
  }
};
