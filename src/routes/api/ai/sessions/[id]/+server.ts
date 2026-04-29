// GET /api/ai/sessions/[id] — full session + messages.
// PATCH /api/ai/sessions/[id] — update title/persona/pinned/archived.

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/config';

function db() {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

export const GET: RequestHandler = async ({ params }) => {
    const id = params.id;
    if (!id) return json({ error: 'id required' }, { status: 400 });
    const c = db();
    const { data: session, error } = await c
        .from('ai_chat_sessions')
        .select('*')
        .eq('id', id)
        .single();
    if (error) return json({ error: error.message }, { status: 404 });
    const { data: messages } = await c
        .from('ai_chat_messages')
        .select('id,role,content,tool_calls,tool_name,citations,model,node_label,latency_ms,tokens_in,tokens_out,created_at')
        .eq('session_id', id)
        .order('created_at', { ascending: true });
    return json({ session, messages: messages ?? [] });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
    const id = params.id;
    if (!id) return json({ error: 'id required' }, { status: 400 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const allowed = ['title', 'persona', 'model', 'pinned', 'archived'] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) patch[k] = body[k];
    if (Object.keys(patch).length === 0) return json({ ok: true });
    const { data, error } = await db()
        .from('ai_chat_sessions')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ session: data });
};
