// GET / PATCH a canvas document (tldraw payload).
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
    const { data, error } = await db().from('canvas_documents').select('*').eq('id', id).single();
    if (error) return json({ error: error.message }, { status: 404 });
    return json({ canvas: data });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
    const id = params.id;
    if (!id) return json({ error: 'id required' }, { status: 400 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const allowed = ['title', 'payload', 'thumbnail_url', 'shared'] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) patch[k] = body[k];
    if (Object.keys(patch).length === 0) return json({ ok: true });
    const { data, error } = await db()
        .from('canvas_documents')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ canvas: data });
};
