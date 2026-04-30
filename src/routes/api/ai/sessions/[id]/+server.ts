// GET /api/ai/sessions/[id] — full session + messages.
// PATCH /api/ai/sessions/[id] — update title/persona/pinned/archived.

import type { RequestHandler } from '@sveltejs/kit';
import { json, error as svelteError } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.supabase || !locals.user) {
        throw svelteError(401, 'Unauthorized');
    }

    const id = params.id;
    if (!id) return json({ error: 'id required' }, { status: 400 });

    // Using locals.supabase enforces RLS (auth.uid() = user_id)
    const { data: session, error } = await locals.supabase
        .from('ai_chat_sessions')
        .select('*')
        .eq('id', id)
        .single();

    if (error) return json({ error: error.message }, { status: 404 });

    const { data: messages } = await locals.supabase
        .from('ai_chat_messages')
        .select('id,role,content,tool_calls,tool_name,citations,model,node_label,latency_ms,tokens_in,tokens_out,created_at')
        .eq('session_id', id)
        .order('created_at', { ascending: true });

    return json({ session, messages: messages ?? [] });
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.supabase || !locals.user) {
        throw svelteError(401, 'Unauthorized');
    }

    const id = params.id;
    if (!id) return json({ error: 'id required' }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const allowed = ['title', 'persona', 'model', 'pinned', 'archived'] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) patch[k] = body[k];
    
    if (Object.keys(patch).length === 0) return json({ ok: true });

    // RLS prevents updating sessions that don't belong to the user
    const { data, error } = await locals.supabase
        .from('ai_chat_sessions')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();

    if (error) return json({ error: error.message }, { status: 500 });

    return json({ session: data });
};
