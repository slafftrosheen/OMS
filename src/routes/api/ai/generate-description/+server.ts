// src/routes/api/ai/generate-description/+server.ts
import { error as svelteError, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { aiRateLimit, okOne, rateLimitIdentifier, requireAuth, validate } from '$lib/server/api/helpers';
import { openRouterComplete } from '$lib/server/ai/openrouter';

const GenerateDescriptionSchema = z.object({
    title: z.string().min(1),
    client: z.string().min(1),
    notes: z.string().optional().nullable()
});

export const POST: RequestHandler = async (event) => {
    requireAuth(event.locals);
    aiRateLimit(rateLimitIdentifier(event));

    const input = validate(GenerateDescriptionSchema, await event.request.json().catch(() => null));

    const messages = [
        {
            role: 'system' as const,
            content:
                'You write concise internal production descriptions (max 4 sentences) for a ' +
                'signage manufacturer. Stay factual, use the client name once, mention the ' +
                'apparent product type if implied, and avoid marketing fluff.'
        },
        {
            role: 'user' as const,
            content: `Title: ${input.title}\nClient: ${input.client}\nNotes: ${input.notes ?? '(none)'}\n\nWrite the description.`
        }
    ];

    try {
        const description = await openRouterComplete(messages, { temperature: 0.5, maxTokens: 400 });
        return okOne({ description });
    } catch (err) {
        throw svelteError(503, `AI description generation failed: ${(err as Error).message}`);
    }
};
