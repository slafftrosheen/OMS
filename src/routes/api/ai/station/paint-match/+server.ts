// POST /api/ai/station/paint-match — colour match recipe.
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { matchPaint, type PaintMatchArgs } from '$lib/server/ai/tools-registry/paint-match';

export const POST: RequestHandler = async ({ request }) => {
    const body = (await request.json().catch(() => null)) as PaintMatchArgs | null;
    if (!body?.target || !body.substrate) {
        return json({ error: 'target, substrate required' }, { status: 400 });
    }
    try {
        return json(await matchPaint(body));
    } catch (err) {
        return json({ error: (err as Error).message }, { status: 500 });
    }
};
