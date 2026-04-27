// POST /api/ai/forge/matting — RMBG-2.0 / BiRefNet background remove.
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { removeBackground } from '$lib/server/ai/forge';
import { AILAB } from '$lib/server/config';

export const POST: RequestHandler = async ({ request }) => {
    if (!AILAB.forge) return json({ error: 'forge disabled' }, { status: 404 });
    const body = (await request.json().catch(() => null)) as { image_url?: string } | null;
    if (!body?.image_url) return json({ error: 'image_url required' }, { status: 400 });
    try {
        const artifact = await removeBackground(body.image_url);
        return json({ ok: true, artifact });
    } catch (err) {
        return json({ error: (err as Error).message }, { status: 502 });
    }
};
