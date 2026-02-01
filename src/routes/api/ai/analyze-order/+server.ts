// src/routes/api/ai/analyze-order/+server.ts
import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { aiService } from '$lib/server/ai/AIService';
import { logger } from '$lib/server/logging/logger';

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw svelteError(401, 'Unauthorized');
    }

    if (!aiService.isEnabled()) {
        throw svelteError(503, 'AI service not available');
    }

    try {
        const orderData = await request.json();

        // Validate input
        if (!orderData.title || !orderData.client || !orderData.dueDate) {
            throw svelteError(400, 'Missing required fields: title, client, dueDate');
        }

        const analysis = await aiService.analyzeOrder(orderData);

        logger.info('AI order analysis requested', {
            userId: user.id,
            orderTitle: orderData.title
        });

        return json({
            success: true,
            analysis
        });

    } catch (err) {
        if (err instanceof Response) {
            throw err;
        }
        
        logger.error('AI analysis endpoint error', err as Error, {
            userId: user.id
        });
        throw svelteError(500, 'Analysis failed');
    }
};