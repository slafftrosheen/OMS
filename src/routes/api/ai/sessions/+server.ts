// src/routes/api/ai/sessions/+server.ts
// Chat sessions: GET (list), POST (create), DELETE (?id=...).

import type { RequestHandler } from '@sveltejs/kit';
import { json, error as svelteError } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.supabase || !locals.user) {
        throw svelteError(401, 'Unauthorized');
    }

    const archived = url.searchParams.get('archived') === '1';
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);

    // Using locals.supabase to ensure RLS (auth.uid() = user_id) is enforced
    const { data, error } = await locals.supabase
        .from('ai_chat_sessions')
        .select('id,title,persona,model,pinned,archived,last_message_at,created_at,updated_at')
        .eq('archived', archived)
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[/api/ai/sessions] GET error:', error);
        return json({ error: error.message }, { status: 500 });
    }

    return json({ items: data ?? [] });
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.supabase || !locals.user) {
        throw svelteError(401, 'Unauthorized');
    }

    const body = (await request.json().catch(() => ({}))) as {
        title?: string;
        persona?: string;
        model?: string;
    };

    const { data, error } = await locals.supabase
        .from('ai_chat_sessions')
        .insert({
            title: body.title ?? 'New conversation',
            persona: body.persona ?? null,
            model: body.model ?? null,
            user_id: locals.user.id
        })
        .select('*')
        .single();

    if (error) {
        console.error('[/api/ai/sessions] POST error:', error);
        return json({ error: error.message }, { status: 500 });
    }

    return json({ session: data });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.supabase || !locals.user) {
        throw svelteError(401, 'Unauthorized');
    }

    const id = url.searchParams.get('id');
    if (!id) {
        return json({ error: 'id required' }, { status: 400 });
    }

    // RLS will prevent deleting other users' sessions
    const { error } = await locals.supabase
        .from('ai_chat_sessions')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('[/api/ai/sessions] DELETE error:', error);
        return json({ error: error.message }, { status: 500 });
    }

    return json({ ok: true });
};
