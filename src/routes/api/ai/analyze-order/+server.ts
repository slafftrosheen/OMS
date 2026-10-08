// src/routes/api/ai/analyze-order/+server.ts
import { error as svelteError, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { aiRateLimit, okOne, rateLimitIdentifier, requireAuth, validate } from '$lib/server/api/helpers';
import { logger } from '$lib/server/logging/logger';
import { openRouterComplete } from '$lib/server/ai/openrouter';

const AnalyzeOrderSchema = z.object({
    title: z.string().min(1),
    client: z.string().min(1),
    dueDate: z.string().min(1),
    notes: z.string().optional().nullable(),
    materials: z.array(z.any()).optional()
});

export const POST: RequestHandler = async (event) => {
    const user = requireAuth(event.locals);
    aiRateLimit(rateLimitIdentifier(event));

    const input = validate(AnalyzeOrderSchema, await event.request.json().catch(() => null));

    const messages = [
        {
            role: 'system' as const,
            content:
                'You are an OMS production planner for Réclame Fabriek. Given a signage order, ' +
                'return JSON with shape { feasibility: "yes"|"caution"|"no", risks: string[], ' +
                'suggested_stations: string[], notes: string }. Respond with valid JSON only — ' +
                'no markdown fences, no commentary.'
        },
        {
            role: 'user' as const,
            content: JSON.stringify(input)
        }
    ];

    try {
        const raw = await openRouterComplete(messages, { temperature: 0.2, jsonMode: true, maxTokens: 1200 });
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            const m = raw.match(/\{[\s\S]*\}/);
            if (!m) throw new Error('Model did not return JSON');
            parsed = JSON.parse(m[0]);
        }
        logger.info('AI order analysis succeeded', { userId: user.id, title: input.title });
        return okOne({ analysis: parsed, raw });
    } catch (err) {
        logger.error('AI analysis endpoint error', err as Error, { userId: user.id });
        throw svelteError(503, 'AI analysis failed');
    }
};
