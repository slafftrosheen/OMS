/**
 * GET /api/chat/search?q=…&roomId=…&limit=…
 * Phase 10: full-text search across chat messages.
 *
 * Optional roomId narrows to a single room. RLS on chat_messages limits the
 * search to rooms the user can see, so no extra auth is needed.
 *
 * Returns: { results: Array<{ id, roomId, authorId, text, ts, snippet, room? }> }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const MAX_LIMIT = 50;

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
    if (!locals.supabase) return json({ error: 'Database unavailable' }, { status: 503 });

    const q = url.searchParams.get('q')?.trim() ?? '';
    const roomId = url.searchParams.get('roomId') ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10) || 20, MAX_LIMIT);

    if (q.length < 2) {
        return json({ results: [], total: 0 });
    }

    let query = locals.supabase
        .from('chat_messages')
        .select('id, room_id, user_id, content, text, created_at')
        .ilike('content', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (roomId) query = query.eq('room_id', roomId);

    const { data, error } = await query;
    if (error) {
        // Some older rows have content NULL but text populated. Re-try against text column.
        const fallback = locals.supabase
            .from('chat_messages')
            .select('id, room_id, user_id, content, text, created_at')
            .ilike('text', `%${q}%`)
            .order('created_at', { ascending: false })
            .limit(limit);
        const fb = roomId ? fallback.eq('room_id', roomId) : fallback;
        const { data: fbData } = await fb;
        if (!fbData) {
            console.error('[/api/chat/search] error:', error);
            return json({ error: 'Search failed' }, { status: 500 });
        }
        return json({ results: mapResults(fbData, q), total: fbData.length });
    }

    return json({ results: mapResults(data ?? [], q), total: (data ?? []).length });
};

function snippet(text: string, q: string, radius = 60): string {
    if (!text) return '';
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text.slice(0, radius * 2);
    const start = Math.max(0, idx - radius);
    const end = Math.min(text.length, idx + q.length + radius);
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

function mapResults(rows: any[], q: string) {
    return rows.map((m) => {
        const body: string = m.content ?? m.text ?? '';
        return {
            id: m.id,
            roomId: m.room_id,
            authorId: m.user_id,
            text: body,
            ts: m.created_at,
            snippet: snippet(body, q),
        };
    });
}
