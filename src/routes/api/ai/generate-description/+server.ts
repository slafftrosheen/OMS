// src/routes/api/ai/generate-description/+server.ts
import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { aiService } from '$lib/server/ai/AIService';

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw svelteError(401, 'Unauthorized');
    }

    if (!aiService.isEnabled()) {
        throw svelteError(503, 'AI service not available');
    }

    try {
        const { title, client, notes } = await request.json();

        if (!title || !client) {
            throw svelteError(400, 'Title and client are required');
        }

        const description = await aiService.generateDescription(title, client, notes);

        return json({
            success: true,
            description
        });

    } catch (err) {
        if (err instanceof Response) {
            throw err;
        }
        throw svelteError(500, 'Description generation failed');
    }
};