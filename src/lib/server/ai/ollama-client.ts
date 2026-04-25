/**
 * Tiny Ollama client used by the small AI endpoints (analyze-order,
 * generate-description) so they don't depend on the legacy DASHSCOPE/Qwen
 * service.
 *
 * The orchestrator at src/lib/server/ai/orchestrator.ts has its own streaming
 * client; this module is only for short, non-streamed completions where a
 * single text response is fine.
 */

import {
    OLLAMA_URL as DEFAULT_OLLAMA_URL,
    OLLAMA_DEFAULT_MODEL as DEFAULT_MODEL,
    OLLAMA_TIMEOUT_MS as DEFAULT_TIMEOUT_MS,
    OLLAMA_KEEP_ALIVE
} from '$lib/server/config';

export interface OllamaMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface OllamaCompletionOptions {
    model?: string;
    timeoutMs?: number;
    keepAlive?: string;
    numCtx?: number;
    temperature?: number;
}

/**
 * Single-turn synchronous chat completion.  Returns the content string.
 * Throws on transport error, timeout, or non-2xx status.
 */
export async function ollamaComplete(
    messages: OllamaMessage[],
    opts: OllamaCompletionOptions = {}
): Promise<string> {
    const {
        model = DEFAULT_MODEL,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        keepAlive = OLLAMA_KEEP_ALIVE,
        numCtx = 4096,
        temperature
    } = opts;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
        const r = await fetch(`${DEFAULT_OLLAMA_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages,
                stream: false,
                keep_alive: keepAlive,
                options: {
                    num_ctx: numCtx,
                    ...(temperature !== undefined ? { temperature } : {})
                }
            }),
            signal: ctrl.signal
        });

        if (!r.ok) {
            const body = await r.text().catch(() => '');
            throw new Error(`Ollama returned ${r.status}: ${body.slice(0, 200)}`);
        }

        const json = await r.json();
        const content: string = json?.message?.content ?? '';
        return content.trim();
    } finally {
        clearTimeout(t);
    }
}

/**
 * Quick reachability probe used by the health check.  Resolves true if
 * Ollama answers /api/version within `timeoutMs`.
 */
export async function ollamaIsUp(timeoutMs = 3_000): Promise<boolean> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const r = await fetch(`${DEFAULT_OLLAMA_URL}/api/version`, { signal: ctrl.signal });
        return r.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(t);
    }
}
