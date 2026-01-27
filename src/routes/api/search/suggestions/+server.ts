// src/routes/api/search/suggestions/+server.ts
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
        return json({ success: true, suggestions: [] });
    }

    const searchService = new SearchService(locals.supabase);

    try {
        const suggestions = await searchService.getSuggestions(query);

        return json({
            success: true,
            suggestions
        });
    } catch (err) {
        throw svelteError(500, 'Failed to get suggestions');
    }
};