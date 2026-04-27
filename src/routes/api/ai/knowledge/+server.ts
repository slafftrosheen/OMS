// GET /api/ai/knowledge — paginated list of knowledge sources.
// DELETE /api/ai/knowledge?id=<uuid> — remove a source + its chunks + blob.

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BUCKET } from '$lib/server/config';

function db() {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

export const GET: RequestHandler = async ({ url }) => {
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const status = url.searchParams.get('status');
    const tag = url.searchParams.get('tag');
    const q = url.searchParams.get('q');

    let query = db()
        .from('knowledge_sources')
        .select(
            'id,title,kind,status,visibility,mime_type,size_bytes,page_count,tags,summary,error,created_at,updated_at',
            { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (tag) query = query.contains('tags', [tag]);
    if (q) query = query.ilike('title', `%${q}%`);

    const { data, count, error } = await query;
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ items: data ?? [], total: count ?? 0, limit, offset });
};

export const DELETE: RequestHandler = async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'id required' }, { status: 400 });
    const c = db();
    const { data: src } = await c
        .from('knowledge_sources')
        .select('storage_key')
        .eq('id', id)
        .single();
    if (src && (src as { storage_key?: string }).storage_key) {
        await c.storage.from(BUCKET.knowledge).remove([(src as { storage_key: string }).storage_key]);
    }
    const { error } = await c.from('knowledge_sources').delete().eq('id', id);
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ ok: true });
};
