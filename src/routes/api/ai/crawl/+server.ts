// POST /api/ai/crawl — fetch one URL, return clean text + optional links.

import type { RequestHandler } from '@sveltejs/kit';
import { json, error as svelteError } from '@sveltejs/kit';
import { crawlUrl } from '$lib/server/ai/tools-registry/web-search';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.supabase || !locals.user) throw svelteError(401, 'Unauthorized');

    const body = (await request.json().catch(() => null)) as
        | { url?: string; selector?: string; include_links?: boolean; max_chars?: number }
        | null;
    if (!body?.url) return json({ error: 'url required' }, { status: 400 });

    try {
        const result = await crawlUrl({
            url: body.url,
            selector: body.selector,
            include_links: body.include_links,
            max_chars: body.max_chars
        });
        return json(result);
    } catch (err) {
        return json({ error: (err as Error).message }, { status: 502 });
    }
};
