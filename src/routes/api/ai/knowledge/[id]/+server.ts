// GET /api/ai/knowledge/[id] — full source detail + chunks (paginated).

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/config';

export const GET: RequestHandler = async ({ params, url }) => {
    const id = params.id;
    if (!id) return json({ error: 'id required' }, { status: 400 });
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
    const offset = Number(url.searchParams.get('offset') ?? 0);

    const c = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: source, error: srcErr } = await c
        .from('knowledge_sources')
        .select('*')
        .eq('id', id)
        .single();
    if (srcErr) return json({ error: srcErr.message }, { status: 404 });

    const { data: chunks, count } = await c
        .from('knowledge_chunks')
        .select('id,page,chunk_index,content,token_count,created_at', { count: 'exact' })
        .eq('source_id', id)
        .order('chunk_index', { ascending: true })
        .range(offset, offset + limit - 1);

    return json({
        source,
        chunks: chunks ?? [],
        chunk_total: count ?? 0,
        limit,
        offset
    });
};
