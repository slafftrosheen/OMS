// POST /api/ai/station/similar — find similar past projects.
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { findSimilarProjects } from '$lib/server/ai/tools-registry/similar-projects';

export const POST: RequestHandler = async ({ request }) => {
    const body = (await request.json().catch(() => null)) as { query?: string } | null;
    if (!body?.query) return json({ error: 'query required' }, { status: 400 });
    try {
        return json(await findSimilarProjects({ query: body.query }));
    } catch (err) {
        return json({ error: (err as Error).message }, { status: 500 });
    }
};
