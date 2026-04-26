// Canvas documents: GET (list), POST (create), DELETE (?id=).
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/config';

function db() {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

export const GET: RequestHandler = async () => {
    const { data, error } = await db()
        .from('canvas_documents')
        .select('id,title,thumbnail_url,shared,created_at,updated_at')
        .order('updated_at', { ascending: false })
        .limit(100);
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ items: data ?? [] });
};

export const POST: RequestHandler = async ({ request, locals }) => {
    const body = (await request.json().catch(() => ({}))) as { title?: string; payload?: unknown };
    const userId = ((locals as unknown as { user?: { id?: string } }).user)?.id ?? null;
    const { data, error } = await db()
        .from('canvas_documents')
        .insert({
            title: body.title ?? 'Untitled canvas',
            payload: body.payload ?? {},
            user_id: userId
        })
        .select('*')
        .single();
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ canvas: data });
};

export const DELETE: RequestHandler = async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'id required' }, { status: 400 });
    const { error } = await db().from('canvas_documents').delete().eq('id', id);
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ ok: true });
};
