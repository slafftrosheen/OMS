// src/routes/api/chat/+server.ts
import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/chat - List all chat rooms
 */
export const GET: RequestHandler = async ({ locals }) => {
    const user = locals.user;
    if (!user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // For now, return default rooms
    // In the future, this could fetch from database
    const rooms = [
        { id: 'general', name: 'General' },
        { id: 'workstations', name: 'Workstations' },
        { id: 'logistics', name: 'Logistics' }
    ];

    return json(rooms);
};

/**
 * POST /api/chat - Create a new chat room
 */
export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { id, name } = await request.json();

        if (!id || !name) {
            return json({ error: 'Room ID and name required' }, { status: 400 });
        }

        // In a real implementation, store the room in database
        // For now, just acknowledge
        return json({ success: true, room: { id, name } });
    } catch (err) {
        return json({ error: 'Failed to create room' }, { status: 500 });
    }
};

/**
 * DELETE /api/chat - Delete a chat room
 */
export const DELETE: RequestHandler = async ({ url, locals }) => {
    const user = locals.user;
    if (!user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const roomId = url.searchParams.get('id');
    if (!roomId) {
        return json({ error: 'Room ID required' }, { status: 400 });
    }

    // In a real implementation, delete from database
    return json({ success: true });
};