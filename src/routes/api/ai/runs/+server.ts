// src/routes/api/ai/runs/+server.ts
// GET /api/ai/runs — recent ai_runs (transparency: which model, which node).

import type { RequestHandler } from '@sveltejs/kit';
import { json, error as svelteError } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.supabase || !locals.user) {
        throw svelteError(401, 'Unauthorized');
    }

    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const kind = url.searchParams.get('kind');

    let q = locals.supabase
        .from('ai_runs')
        .select(
            'id,kind,status,user_id,session_id,node_label,model,cost_seconds,tokens_in,tokens_out,error,started_at,finished_at,created_at',
            { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (kind) q = q.eq('kind', kind);

    // RLS (auth.uid() = user_id) will naturally filter the runs
    const { data, count, error } = await q;

    if (error) {
        console.error('[/api/ai/runs] GET error:', error);
        return json({ error: error.message }, { status: 500 });
    }

    return json({ items: data ?? [], total: count ?? 0, limit, offset });
};
