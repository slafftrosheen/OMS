// POST /api/ai/forge/tts — Kokoro / Piper text-to-speech.

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { speak } from '$lib/server/ai/forge';
import { AILAB } from '$lib/server/config';

export const POST: RequestHandler = async ({ request }) => {
    if (!AILAB.forge) return json({ error: 'forge disabled' }, { status: 404 });
    const body = (await request.json().catch(() => null)) as {
        text?: string;
        voice?: string;
        speed?: number;
    } | null;
    if (!body?.text) return json({ error: 'text required' }, { status: 400 });
    try {
        const artifact = await speak({ ...body, text: body.text });
        return json({ ok: true, artifact });
    } catch (err) {
        return json({ error: (err as Error).message }, { status: 502 });
    }
};
