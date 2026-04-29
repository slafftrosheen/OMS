// Chat sessions: GET (list), POST (create), DELETE (?id=...).

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/config';

function db() {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

export const GET: RequestHandler = async ({ url }) => {
    const archived = url.searchParams.get('archived') === '1';
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
    const { data, error } = await db()
        .from('ai_chat_sessions')
        .select('id,title,persona,model,pinned,archived,last_message_at,created_at,updated_at')
        .eq('archived', archived)
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(limit);
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ items: data ?? [] });
};

export const POST: RequestHandler = async ({ request, locals }) => {
    const body = (await request.json().catch(() => ({}))) as {
        title?: string;
        persona?: string;
        model?: string;
    };
    const userId = ((locals as unknown as { user?: { id?: string } }).user)?.id ?? null;
    const { data, error } = await db()
        .from('ai_chat_sessions')
        .insert({
            title: body.title ?? 'New conversation',
            persona: body.persona ?? null,
            model: body.model ?? null,
            user_id: userId
        })
        .select('*')
        .single();
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ session: data });
};

export const DELETE: RequestHandler = async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'id required' }, { status: 400 });
    const { error } = await db().from('ai_chat_sessions').delete().eq('id', id);
    // ai_chat_messages cascade-deletes via FK on session_id.
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ ok: true });
};
