// src/routes/api/chat/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';

/**
 * GET /api/chat - List chat rooms
 */
export const GET: RequestHandler = async () => {
  try {
    const result = await query(
      `SELECT id, name, room_type, is_private, created_at
       FROM chat_rooms
       ORDER BY created_at ASC`
    );

    const rooms = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.room_type,
      isPrivate: row.is_private,
      createdAt: row.created_at?.toISOString()
    }));

    return json(rooms);
  } catch (err) {
    console.error('Failed to fetch chat rooms:', err);
    return json([], { status: 500 });
  }
};

/**
 * POST /api/chat - Create chat room
 */
export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();

  if (!data.id || !data.name) {
    return json({ error: 'Room ID and name required' }, { status: 400 });
  }

  try {
    const result = await query(
      `INSERT INTO chat_rooms (id, name, room_type, is_private)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = $2
       RETURNING id, name, room_type, is_private, created_at`,
      [data.id, data.name, data.type || 'channel', data.isPrivate || false]
    );

    const room = result.rows[0];
    return json({
      id: room.id,
      name: room.name,
      type: room.room_type,
      isPrivate: room.is_private,
      createdAt: room.created_at?.toISOString()
    }, { status: 201 });
  } catch (err) {
    console.error('Failed to create chat room:', err);
    return json({ error: 'Failed to create room' }, { status: 500 });
  }
};

/**
 * DELETE /api/chat - Delete chat room
 */
export const DELETE: RequestHandler = async ({ url }) => {
  const roomId = url.searchParams.get('id');

  if (!roomId) {
    return json({ error: 'Room ID required' }, { status: 400 });
  }

  try {
    await query(`DELETE FROM chat_rooms WHERE id = $1`, [roomId]);
    return json({ success: true });
  } catch (err) {
    console.error('Failed to delete chat room:', err);
    return json({ error: 'Failed to delete room' }, { status: 500 });
  }
};
