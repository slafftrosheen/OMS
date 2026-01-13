// src/routes/api/chat/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/chat - List chat rooms
 */
export const GET: RequestHandler = async ({ locals }) => {
  try {
    const { data: rooms, error } = await locals.supabase
      .from('chat_rooms')
      .select('id, name, room_type, is_private, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    const formattedRooms = rooms.map(row => ({
      id: row.id,
      name: row.name,
      type: row.room_type,
      isPrivate: row.is_private,
      createdAt: row.created_at
    }));

    return json(formattedRooms);
  } catch (err) {
    console.error('Failed to fetch chat rooms:', err);
    return json([], { status: 500 });
  }
};

/**
 * POST /api/chat - Create chat room
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();

  if (!data.id || !data.name) {
    return json({ error: 'Room ID and name required' }, { status: 400 });
  }

  try {
    // Upsert
    const { data: room, error } = await locals.supabase
      .from('chat_rooms')
      .upsert({
        id: data.id,
        name: data.name,
        room_type: data.type || 'channel',
        is_private: data.isPrivate || false
      })
      .select()
      .single();

    if (error) throw error;

    return json({
      id: room.id,
      name: room.name,
      type: room.room_type,
      isPrivate: room.is_private,
      createdAt: room.created_at
    }, { status: 201 });
  } catch (err) {
    console.error('Failed to create chat room:', err);
    return json({ error: 'Failed to create room' }, { status: 500 });
  }
};

/**
 * DELETE /api/chat - Delete chat room
 */
export const DELETE: RequestHandler = async ({ url, locals }) => {
  const roomId = url.searchParams.get('id');

  if (!roomId) {
    return json({ error: 'Room ID required' }, { status: 400 });
  }

  try {
    const { error } = await locals.supabase
        .from('chat_rooms')
        .delete()
        .eq('id', roomId);

    if (error) throw error;

    return json({ success: true });
  } catch (err) {
    console.error('Failed to delete chat room:', err);
    return json({ error: 'Failed to delete room' }, { status: 500 });
  }
};
