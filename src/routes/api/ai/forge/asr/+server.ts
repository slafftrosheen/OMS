// POST /api/ai/forge/asr — transcribe audio/video.
// Accepts either multipart with `file` or JSON `{audio_url, language}`.

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { transcribe } from '$lib/server/ai/forge';
import { AILAB } from '$lib/server/config';

export const POST: RequestHandler = async ({ request }) => {
    if (!AILAB.forge) return json({ error: 'forge disabled' }, { status: 404 });
    const ct = request.headers.get('content-type') ?? '';
    try {
        if (ct.includes('multipart/form-data')) {
            const form = await request.formData();
            const file = form.get('file');
            if (!(file instanceof File)) return json({ error: 'file required' }, { status: 400 });
            const buf = new Uint8Array(await file.arrayBuffer());
            const language = (form.get('language') as string | null) ?? undefined;
            const out = await transcribe({
                file: { buf, mime: file.type, filename: file.name },
                language
            });
            return json(out);
        }
        const body = (await request.json()) as { audio_url?: string; language?: string };
        if (!body.audio_url) return json({ error: 'audio_url required' }, { status: 400 });
        const out = await transcribe({ audio_url: body.audio_url, language: body.language });
        return json(out);
    } catch (err) {
        return json({ error: (err as Error).message }, { status: 502 });
    }
};
