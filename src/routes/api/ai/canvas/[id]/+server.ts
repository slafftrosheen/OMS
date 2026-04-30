// src/routes/api/ai/canvas/[id]/+server.ts
// GET / PATCH a canvas document (tldraw payload).

import type { RequestHandler } from '@sveltejs/kit';
import { json, error as svelteError } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.supabase || !locals.user) {
        throw svelteError(401, 'Unauthorized');
    }

    const id = params.id;
    if (!id) return json({ error: 'id required' }, { status: 400 });

    const { data, error } = await locals.supabase
        .from('canvas_documents')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error(`[/api/ai/canvas/${id}] GET error:`, error);
        return json({ error: error.message }, { status: 404 });
    }

    return json({ canvas: data });
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.supabase || !locals.user) {
        throw svelteError(401, 'Unauthorized');
    }

    const id = params.id;
    if (!id) return json({ error: 'id required' }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const allowed = ['title', 'payload', 'thumbnail_url', 'shared'] as const;
    const patch: Record<string, unknown> = {};

    for (const k of allowed) {
        if (k in body) patch[k] = body[k];
    }

    if (Object.keys(patch).length === 0) {
        return json({ ok: true });
    }

    const { data, error } = await locals.supabase
        .from('canvas_documents')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();

    if (error) {
        console.error(`[/api/ai/canvas/${id}] PATCH error:`, error);
        return json({ error: error.message }, { status: 500 });
    }

    return json({ canvas: data });
};
