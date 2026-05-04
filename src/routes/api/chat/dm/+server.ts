/**
 * POST /api/chat/dm
 * Phase 10: create (or return existing) DM room between the current user and a peer.
 *
 * Body: { peerId: string }
 *
 * Idempotent: room id is deterministic (`dm-<minId>-<maxId>`) so calling twice
 * just returns the same room. Both users are added to chat_room_members.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
    if (!locals.supabase) return json({ error: 'Database unavailable' }, { status: 503 });

    const body = await request.json().catch(() => ({}));
    const peerId = (body as any).peerId as string | undefined;

    if (!peerId || typeof peerId !== 'string') {
        return json({ error: 'peerId required' }, { status: 400 });
    }

    if (peerId === locals.user.id) {
        return json({ error: 'Cannot DM yourself' }, { status: 400 });
    }

    // Resolve peer profile (also serves as authorization: only existing users
    // can be DMed) and grab a label for the room name.
    const { data: peer, error: peerError } = await locals.supabase
        .from('profiles')
        .select('id, display_name, username, email')
        .eq('id', peerId)
        .single();

    if (peerError || !peer) {
        return json({ error: 'Peer not found' }, { status: 404 });
    }

    const myId = locals.user.id;
    const [a, b] = [myId, peerId].sort();
    const roomId = `dm-${a}-${b}`;

    // Look up display name for the *other* side from current user's perspective
    const { data: me } = await locals.supabase
        .from('profiles')
        .select('display_name, username')
        .eq('id', myId)
        .single();

    const roomName = `${peer.display_name || peer.username || peer.email} ↔ ${me?.display_name || me?.username || 'me'}`;

    // Upsert the room (idempotent)
    const { error: roomError } = await locals.supabase
        .from('chat_rooms')
        .upsert({
            id: roomId,
            name: roomName,
            kind: 'direct',
            // legacy column on the original migration (20260204000008)
            // — supabase upsert ignores unknown columns silently so we set
            // both safely to remain compatible across migration generations.
            ...({ is_private: true } as any),
            created_by: myId,
        }, { onConflict: 'id' });

    if (roomError) {
        console.error('[/api/chat/dm] room upsert error:', roomError);
        return json({ error: 'Failed to create DM room' }, { status: 500 });
    }

    // Ensure both members are in chat_room_members
    const memberRows = [
        { room_id: roomId, user_id: myId, is_admin: true },
        { room_id: roomId, user_id: peerId, is_admin: false },
    ];

    const { error: memError } = await locals.supabase
        .from('chat_room_members')
        .upsert(memberRows, { onConflict: 'room_id,user_id' });

    if (memError) {
        console.warn('[/api/chat/dm] member upsert warning:', memError);
        // Don't fail — the room exists and RLS may still allow the user via owner
    }

    return json({
        success: true,
        room: {
            id: roomId,
            name: roomName,
            kind: 'direct',
            peer: {
                id: peer.id,
                displayName: peer.display_name,
                username: peer.username,
            },
        },
    });
};
