// src/routes/api/ai/canvas/+server.ts
// Canvas documents: GET (list), POST (create), DELETE (?id=).

import type { RequestHandler } from '@sveltejs/kit';
import { json, error as svelteError } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.supabase || !locals.user) {
        throw svelteError(401, 'Unauthorized');
    }

    const { data, error } = await locals.supabase
        .from('canvas_documents')
        .select('id,title,thumbnail_url,shared,created_at,updated_at')
        .order('updated_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error('[/api/ai/canvas] GET error:', error);
        return json({ error: error.message }, { status: 500 });
    }

    return json({ items: data ?? [] });
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.supabase || !locals.user) {
        throw svelteError(401, 'Unauthorized');
    }

    const body = (await request.json().catch(() => ({}))) as { title?: string; payload?: unknown };

    const { data, error } = await locals.supabase
        .from('canvas_documents')
        .insert({
            title: body.title ?? 'Untitled canvas',
            payload: body.payload ?? {},
            user_id: locals.user.id
        })
        .select('*')
        .single();

    if (error) {
        console.error('[/api/ai/canvas] POST error:', error);
        return json({ error: error.message }, { status: 500 });
    }

    return json({ canvas: data });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
    if (!locals.supabase || !locals.user) {
        throw svelteError(401, 'Unauthorized');
    }

    const id = url.searchParams.get('id');
    if (!id) {
        return json({ error: 'id required' }, { status: 400 });
    }

    // RLS will ensure user only deletes their own canvas
    const { error } = await locals.supabase
        .from('canvas_documents')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('[/api/ai/canvas] DELETE error:', error);
        return json({ error: error.message }, { status: 500 });
    }

    return json({ ok: true });
};
