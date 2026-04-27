// POST /api/ai/knowledge/search — semantic search over the knowledge base.
// Body: { query, tags?, top_k?, no_rerank? } → { hits, embed_model, rerank_model }

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { searchKnowledge } from '$lib/server/ai/tools-registry/knowledge-search';

export const POST: RequestHandler = async ({ request }) => {
    const body = (await request.json().catch(() => null)) as {
        query?: string;
        tags?: string[];
        top_k?: number;
        no_rerank?: boolean;
    } | null;
    if (!body?.query) return json({ error: 'query required' }, { status: 400 });
    const result = await searchKnowledge({
        query: body.query,
        tags: body.tags,
        top_k: body.top_k,
        no_rerank: body.no_rerank
    });
    return json(result);
};
