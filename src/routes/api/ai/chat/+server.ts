/**
 * POST /api/ai/chat — lightweight chat endpoint for the canvas AI panel.
 * Routes through the swarm; falls back to direct Ollama if swarm is unavailable.
 *
 * Set ?stream=1 (or body.stream=true) to receive a Server-Sent-Events stream.
 * Each chunk is a JSON line `{ delta: string }` followed by a final
 * `{ done: true, content: string }` event.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { ollamaComplete } from '$lib/server/ai/ollama-client';
import { swarmChat } from '$lib/server/ai/swarm';
import { MODEL } from '$lib/server/config';

function sseHeaders() {
    return {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    };
}

export const POST: RequestHandler = async ({ request, url }) => {
    const body = await request.json().catch(() => null);

    if (!body || !Array.isArray(body.messages)) {
        return json({ error: 'messages array required' }, { status: 400 });
    }

    const wantStream = url.searchParams.get('stream') === '1' || body.stream === true;
    const messages: Array<{ role: string; content: string }> = body.messages;

    // ── Streaming path (SSE) ──────────────────────────────────────────────
    if (wantStream) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                let assembled = '';
                const send = (obj: unknown) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
                };

                try {
                    let result: Awaited<ReturnType<typeof swarmChat>>;
                    try {
                        result = await swarmChat({
                            model: MODEL.chat,
                            messages,
                            stream: true,
                            cap: 'reasoning',
                        });
                    } catch {
                        // Swarm unavailable — fall back to a single non-stream completion
                        const reply = await ollamaComplete(messages as any);
                        send({ delta: reply });
                        send({ done: true, content: reply });
                        controller.close();
                        return;
                    }

                    if (!result.response.body) {
                        send({ done: true, content: '' });
                        controller.close();
                        return;
                    }

                    const reader = result.response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';

                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        // Ollama streams newline-delimited JSON
                        const lines = buffer.split('\n');
                        buffer = lines.pop() ?? '';
                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed) continue;
                            try {
                                const chunk = JSON.parse(trimmed);
                                const delta = chunk?.message?.content ?? '';
                                if (delta) {
                                    assembled += delta;
                                    send({ delta });
                                }
                                if (chunk?.done) {
                                    send({ done: true, content: assembled });
                                    controller.close();
                                    return;
                                }
                            } catch {
                                // skip malformed line
                            }
                        }
                    }

                    send({ done: true, content: assembled });
                    controller.close();
                } catch (err: any) {
                    send({ error: err?.message ?? 'AI unavailable' });
                    controller.close();
                }
            },
        });

        return new Response(stream, { headers: sseHeaders() });
    }

    // ── Non-stream path (legacy clients) ──────────────────────────────────
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
