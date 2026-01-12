// src/routes/api/chat/messages/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';

/**
 * GET /api/chat/messages - List messages
 * Query params: ?roomId=general&limit=50&before=uuid
 */
export const GET: RequestHandler = async ({ url }) => {
  const roomId = url.searchParams.get('roomId');
  const limit = parseInt(url.searchParams.get('limit') || '100');
  const before = url.searchParams.get('before');

  if (!roomId) {
    return json({ error: 'roomId required' }, { status: 400 });
  }

  let sql = `
    SELECT 
      m.id, m.room_id, m.author_id, m.text, m.variant, 
      m.mentions, m.event_type, m.event_data, m.created_at,
      u.username as author_username, u.display_name as author_name
    FROM chat_messages m
    LEFT JOIN users u ON u.id = m.author_id
    WHERE m.room_id = $1 AND m.is_deleted = false
  `;

  const params: any[] = [roomId];
  let idx = 2;

  if (before) {
    sql += ` AND m.created_at < (SELECT created_at FROM chat_messages WHERE id = $${idx++})`;
    params.push(before);
  }

  sql += ` ORDER BY m.created_at DESC LIMIT $${idx}`;
  params.push(Math.min(limit, 500));

  try {
    const result = await query(sql, params);

    // Reverse to get chronological order
    const messages = result.rows.reverse().map(row => ({
      id: row.id,
      roomId: row.room_id,
      authorId: row.author_id ? String(row.author_id) : 'system',
      authorName: row.author_name || 'System',
      text: row.text,
      variant: row.variant,
      mentions: row.mentions || [],
      event: row.event_type ? { type: row.event_type, ...row.event_data } : undefined,
      ts: row.created_at?.toISOString()
    }));

    return json(messages);
  } catch (err) {
    console.error('Failed to fetch messages:', err);
    return json([], { status: 500 });
  }
};

/**
 * POST /api/chat/messages - Send message
 */
export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();

  if (!data.roomId || !data.text) {
    return json({ error: 'roomId and text required' }, { status: 400 });
  }

  try {
    const result = await query(
      `INSERT INTO chat_messages (
        room_id, author_id, text, variant, mentions, event_type, event_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, room_id, author_id, text, variant, mentions, event_type, event_data, created_at`,
      [
        data.roomId,
        data.authorId || null,
        data.text,
        data.variant || 'user',
        data.mentions || [],
        data.event?.type || null,
        data.event ? JSON.stringify(data.event) : null
      ]
    );

    const msg = result.rows[0];
    return json({
      id: msg.id,
      roomId: msg.room_id,
      authorId: msg.author_id ? String(msg.author_id) : 'system',
      text: msg.text,
      variant: msg.variant,
      mentions: msg.mentions || [],
      event: msg.event_type ? { type: msg.event_type, ...msg.event_data } : undefined,
      ts: msg.created_at?.toISOString()
    }, { status: 201 });
  } catch (err) {
    console.error('Failed to send message:', err);
    return json({ error: 'Failed to send message' }, { status: 500 });
  }
};
