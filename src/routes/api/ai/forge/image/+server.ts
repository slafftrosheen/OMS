// POST /api/ai/forge/image — Flux text-to-image.
// Body: { prompt, negative?, width?, height?, steps?, guidance?, seed? }

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { generateImage } from '$lib/server/ai/forge';
import { AILAB } from '$lib/server/config';

export const POST: RequestHandler = async ({ request }) => {
    if (!AILAB.forge) return json({ error: 'forge disabled' }, { status: 404 });
    const body = (await request.json().catch(() => null)) as {
        prompt?: string;
        negative?: string;
        width?: number;
        height?: number;
        steps?: number;
        guidance?: number;
        seed?: number;
    } | null;
    if (!body?.prompt) return json({ error: 'prompt required' }, { status: 400 });
    try {
        const artifact = await generateImage({ ...body, prompt: body.prompt });
        return json({ ok: true, artifact });
    } catch (err) {
        return json({ error: (err as Error).message }, { status: 502 });
    }
};
