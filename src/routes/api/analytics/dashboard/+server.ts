// src/routes/api/analytics/dashboard/+server.ts
import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AnalyticsService } from '$lib/server/analytics/AnalyticsService';

export const GET: RequestHandler = async ({ url, locals }) => {
    const user = locals.user;
    if (!user) {
        throw svelteError(401, 'Unauthorized');
    }

    // Parse time range from query params
    const startParam = url.searchParams.get('start');
    const endParam = url.searchParams.get('end');
    const preset = url.searchParams.get('preset'); // 'today', 'week', 'month', 'quarter', 'year'

    let start: Date, end: Date;

    if (preset) {
        ({ start, end } = getPresetRange(preset));
    } else if (startParam && endParam) {
        start = new Date(startParam);
        end = new Date(endParam);
    } else {
        // Default to last 30 days
        end = new Date();
        start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const analytics = new AnalyticsService(locals.supabase);

    try {
        const summary = await analytics.getDashboardSummary({ start, end });

        return json({
            success: true,
            data: summary,
            timeRange: { start: start.toISOString(), end: end.toISOString() }
        });
    } catch (err) {
        throw svelteError(500, 'Failed to generate analytics');
    }
};

function getPresetRange(preset: string): { start: Date; end: Date } {
    const end = new Date();
    let start: Date;

    switch (preset) {
        case 'today':
            start = new Date(end);
            start.setHours(0, 0, 0, 0);
            break;
        case 'week':
            start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
            start = new Date(end);
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            break;
        case 'quarter':
            start = new Date(end);
            start.setMonth(Math.floor(end.getMonth() / 3) * 3);
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            break;
        case 'year':
            start = new Date(end.getFullYear(), 0, 1);
            break;
        default:
            start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return { start, end };
}