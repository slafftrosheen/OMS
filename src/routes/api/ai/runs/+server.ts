// GET /api/ai/runs — recent ai_runs (transparency: which model, which node).

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/config';

export const GET: RequestHandler = async ({ url }) => {
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const kind = url.searchParams.get('kind');
    const c = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    let q = c
        .from('ai_runs')
        .select(
            'id,kind,status,user_id,session_id,node_label,model,cost_seconds,tokens_in,tokens_out,error,started_at,finished_at,created_at',
            { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
    if (kind) q = q.eq('kind', kind);
    const { data, count, error } = await q;
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ items: data ?? [], total: count ?? 0, limit, offset });
};
