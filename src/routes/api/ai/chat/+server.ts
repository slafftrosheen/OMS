/**
 * POST /api/ai/chat — lightweight chat endpoint for the canvas AI panel.
 * Routes through the swarm; falls back to direct Ollama if swarm is unavailable.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { ollamaComplete } from '$lib/server/ai/ollama-client';
import { swarmChat } from '$lib/server/ai/swarm';
import { MODEL } from '$lib/server/config';

export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json().catch(() => null);

    if (!body || !Array.isArray(body.messages)) {
        return json({ error: 'messages array required' }, { status: 400 });
    }

    const messages: Array<{ role: string; content: string }> = body.messages;

    try {
        let reply: string;
        try {
            const result = await swarmChat({
                model: MODEL.chat,
                messages,
                stream: false,
                cap: 'reasoning',
            });

            if (result.response.ok) {
                const data = await result.response.json();
                reply = data?.message?.content ?? '';
            } else {
                throw new Error(`Swarm response ${result.response.status}`);
            }
        } catch {
            // Fallback: direct Ollama via ollama-client
            reply = await ollamaComplete(messages as any);
        }

        return json({
            message: { role: 'assistant', content: reply },
            reply,
        });
    } catch (err: any) {
        console.error('[/api/ai/chat] Error:', err);
        return json({ error: err.message ?? 'AI unavailable' }, { status: 503 });
    }
};
