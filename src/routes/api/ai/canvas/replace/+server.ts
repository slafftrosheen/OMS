/**
 * POST /api/ai/canvas/replace
 * Phase 8: take a selected sketch's raw geometry (or a free-form description)
 * and ask the AI to return a parametric Maker.js model that replaces it.
 *
 * Body: {
 *   prompt: string,                       // user instruction ("clean this up to a 50mm flange")
 *   selection?: Array<{ type, x, y, w, h, props? }>  // raw selection geometry
 * }
 *
 * Response: { code: string, params: Record<string, number> }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { ollamaComplete } from '$lib/server/ai/ollama-client';
import { swarmChat } from '$lib/server/ai/swarm';
import { MODEL } from '$lib/server/config';

const SYSTEM_PROMPT = `You are a CAD assistant. Convert the user's description and any provided
geometry hints into a single Maker.js parametric model.

Reply with ONLY a JSON object (no prose, no fences) of the form:
{
  "code": "module.exports = function(<params>) { ... };",
  "params": { "<paramName>": <numericDefault> }
}

The code MUST:
  - Be valid JavaScript that exports a constructor function via module.exports.
  - Use only the global "makerjs" library (paths, models, model, exporter).
  - Build a 2-D outline / cutout suitable for laser cutting.
  - NEVER perform I/O, fetch, or import anything other than makerjs.
  - Default parameters should be sensible millimeter values.`;

function tryParseJson(text: string): { code: string; params: Record<string, number> } | null {
    // Strip code fences and prose if any
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = (fenced ? fenced[1] : text).trim();
    try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed.code === 'string') {
            return {
                code: parsed.code,
                params: typeof parsed.params === 'object' && parsed.params ? parsed.params : {},
            };
        }
    } catch {
        // fall through
    }
    return null;
}

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.prompt !== 'string') {
        return json({ error: 'prompt required' }, { status: 400 });
    }

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...(Array.isArray(body.selection) && body.selection.length > 0
            ? [{ role: 'user', content: `Selected geometry (raw): ${JSON.stringify(body.selection)}` }]
            : []),
        { role: 'user', content: body.prompt },
    ];

    try {
        let raw: string;
        try {
            const result = await swarmChat({
                model: MODEL.chat,
                messages,
                stream: false,
                cap: 'reasoning',
            });
            if (result.response.ok) {
                const data = await result.response.json();
                raw = data?.message?.content ?? '';
            } else {
                throw new Error(`Swarm response ${result.response.status}`);
            }
        } catch {
            raw = await ollamaComplete(messages as any);
        }

        const parsed = tryParseJson(raw);
        if (!parsed) {
            return json({ error: 'AI did not return valid JSON', raw }, { status: 502 });
        }

        return json(parsed);
    } catch (err: any) {
        console.error('[/api/ai/canvas/replace] error:', err);
        return json({ error: err.message ?? 'AI unavailable' }, { status: 503 });
    }
};
