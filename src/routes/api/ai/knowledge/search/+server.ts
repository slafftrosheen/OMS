// POST /api/ai/knowledge/search — semantic search over the knowledge base.
// Requires authentication and respects RLS policies on knowledge_sources table.
// Body: { query, tags?, top_k?, no_rerank? } → { hits, embed_model, rerank_model }

import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { searchKnowledge } from '$lib/server/ai/tools-registry/knowledge-search';

export const POST: RequestHandler = async ({ request, locals }) => {
    // Authentication check - must be logged in
    const session = await locals.getSession();
    if (!session) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
        query?: string;
        tags?: string[];
        top_k?: number;
        no_rerank?: boolean;
    } | null;
    
    if (!body?.query) return json({ error: 'query required' }, { status: 400 });
    
    try {
        const result = await searchKnowledge({
            query: body.query,
            tags: body.tags,
            top_k: body.top_k,
            no_rerank: body.no_rerank
        });
        return json(result);
    } catch (err: any) {
        console.error('Knowledge search error:', err);
        return json({ error: err.message || 'Search failed' }, { status: 500 });
    }
};