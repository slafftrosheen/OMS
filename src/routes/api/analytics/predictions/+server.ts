// src/routes/api/analytics/predictions/+server.ts
import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AnalyticsService } from '$lib/server/analytics/AnalyticsService';

export const GET: RequestHandler = async ({ url, locals }) => {
    const user = locals.user;
    if (!user) {
        throw svelteError(401, 'Unauthorized');
    }

    // Use last 90 days of data for predictions
    const end = new Date();
    const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);

    const analytics = new AnalyticsService(locals.supabase);

    try {
        const insights = await analytics.getPredictiveInsights({ start, end });

        return json({
            success: true,
            data: insights
        });
    } catch (err) {
        throw svelteError(500, 'Failed to generate predictions');
    }
};