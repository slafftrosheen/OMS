// POST /api/ai/station/paint-match — colour match recipe.
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { matchPaint, type PaintMatchArgs } from '$lib/server/ai/tools-registry/paint-match';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
    const body = (await request.json().catch(() => null)) as PaintMatchArgs | null;
    if (!body?.target || !body.substrate) {
        return json({ error: 'target, substrate required' }, { status: 400 });
    }
    try {
        return json(await matchPaint(body, locals.supabase));
    } catch (err) {
        console.error('[AI station] Tool unavailable', err instanceof Error ? err.name : 'unknown');
        return json({ error: 'Tool unavailable or insufficient permissions' }, { status: 503 });
    }
};
