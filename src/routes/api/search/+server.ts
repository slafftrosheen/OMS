// src/routes/api/search/+server.ts
import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SearchService } from '$lib/server/search/SearchService';

export const GET: RequestHandler = async ({ url, locals }) => {
    const user = locals.user;
    if (!user) {
        throw svelteError(401, 'Unauthorized');
    }

    const query = url.searchParams.get('q');
    if (!query) {
        throw svelteError(400, 'Query parameter required');
    }

    const filters = {
        status: url.searchParams.get('status')?.split(','),
        dateFrom: url.searchParams.get('dateFrom') || undefined,
        dateTo: url.searchParams.get('dateTo') || undefined,
        client: url.searchParams.get('client') || undefined
    };

    const limit = parseInt(url.searchParams.get('limit') || '50');

    const searchService = new SearchService(locals.supabase);

    try {
        const results = await searchService.search(query, filters, limit);

        // Save search query
        await searchService.saveSearchQuery(user.id, query, results.length);

        return json({
            success: true,
            query,
            results,
            count: results.length
        });
    } catch (err) {
        const error = err as Error;
        throw svelteError(400, error.message);
    }
};