// POST /api/ai/web-search — SearxNG-backed search tool used by canvas nodes
// and the chat tool loop. Returns SearchResult.

import type { RequestHandler } from '@sveltejs/kit';
import { json, error as svelteError } from '@sveltejs/kit';
import { webSearch } from '$lib/server/ai/tools-registry/web-search';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.supabase || !locals.user) throw svelteError(401, 'Unauthorized');

    const body = (await request.json().catch(() => null)) as
        | { query?: string; top_k?: number; language?: string; site?: string[]; categories?: string[] }
        | null;
    if (!body?.query) return json({ error: 'query required' }, { status: 400 });

    try {
        const result = await webSearch({
            query: body.query,
            top_k: body.top_k,
            language: body.language,
            site: body.site,
            categories: body.categories
        });
        return json(result);
    } catch (err) {
        return json({ error: (err as Error).message }, { status: 502 });
    }
};
