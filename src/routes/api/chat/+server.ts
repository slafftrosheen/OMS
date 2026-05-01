// src/routes/api/chat/+server.ts
// Phase 10: Persistent chat rooms backed by the chat_rooms table.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const FALLBACK_ROOMS = [
    { id: 'general',       name: 'General',       kind: 'channel' },
    { id: 'workstations',  name: 'Workstations',  kind: 'channel' },
    { id: 'logistics',     name: 'Logistics',     kind: 'channel' },
    { id: 'station-cad',   name: 'CAD',           kind: 'station' },
    { id: 'station-cnc',   name: 'CNC',           kind: 'station' },
    { id: 'station-edge',  name: 'Edge',          kind: 'station' },
    { id: 'station-assembly', name: 'Assembly',   kind: 'station' },
    { id: 'station-paint', name: 'Paint',         kind: 'station' },
    { id: 'station-packaging', name: 'Packaging', kind: 'station' },
    { id: 'station-delivery',  name: 'Delivery',  kind: 'station' },
];

/**
 * GET /api/chat — list chat rooms from DB, fallback to hardcoded list.
 */
export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    if (!locals.supabase) return json(FALLBACK_ROOMS);

    const { data, error } = await locals.supabase
        .from('chat_rooms')
        .select('id, name, kind, station, order_id, created_at')
        .is('archived_at', null)
        .order('kind')
        .order('name');

    if (error || !data?.length) {
        console.warn('[/api/chat] DB fetch failed, using fallback rooms:', error?.message);
        return json(FALLBACK_ROOMS);
    }

    return json(data);
};

/**
 * POST /api/chat — create a new chat room.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { id, name, kind = 'channel', station, order_id } = body as Record<string, string>;

    if (!id || !name) return json({ error: 'id and name are required' }, { status: 400 });

    if (!locals.supabase) return json({ success: true, room: { id, name, kind } });

    const { data, error } = await locals.supabase
        .from('chat_rooms')
        .upsert({ id, name, kind, station: station || null, order_id: order_id || null, created_by: locals.user.id })
        .select()
        .single();

    if (error) {
        console.error('[/api/chat POST] upsert error:', error);
        return json({ error: 'Failed to create room' }, { status: 500 });
    }

    return json({ success: true, room: data });
};

/**
 * DELETE /api/chat?id=<roomId> — soft-delete (archive) a chat room.
 */
export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    const roomId = url.searchParams.get('id');
    if (!roomId) return json({ error: 'Room ID required' }, { status: 400 });

    if (!locals.supabase) return json({ success: true });

    const { error } = await locals.supabase
        .from('chat_rooms')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', roomId);

    if (error) {
        console.error('[/api/chat DELETE] error:', error);
        return json({ error: 'Failed to delete room' }, { status: 500 });
    }

    return json({ success: true });
};
