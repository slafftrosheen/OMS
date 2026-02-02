import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface SearchResult {
    entity_type: string;
    entity_id: string;
    title: string;
    subtitle: string;
    description: string;
    url: string;
    metadata: any;
    relevance: number;
}

export const GET: RequestHandler = async ({ url, locals }) => {
    const supabase = locals.supabase;
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        throw error(401, 'Unauthorized');
    }

    const query = url.searchParams.get('q') || '';
    const entityTypes = url.searchParams.get('types')?.split(',') || ['orders', 'materials', 'inventory', 'users'];
    const limit = parseInt(url.searchParams.get('limit') || '50');

    if (!query.trim()) {
        return json({ results: [], query: '', count: 0 });
    }

    try {
        // Call global search function
        const { data, error: searchError } = await supabase
            .rpc('global_search', {
                p_query: query,
                p_entity_types: entityTypes,
                p_limit: limit
            });

        if (searchError) {
            console.error('Global search error:', searchError);
            throw error(500, 'Search failed');
        }

        // Log search for analytics
        await supabase
            .from('search_history')
            .insert({
                user_id: session.user.id,
                query,
                entity_type: entityTypes.join(','),
                results_count: data?.length || 0
            })
            .select()
            .single();

        return json({
            results: data || [],
            query,
            count: data?.length || 0
        });

    } catch (err: any) {
        console.error('Search API error:', err);
        throw error(500, err.message || 'Search failed');
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    const supabase = locals.supabase;
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        throw error(401, 'Unauthorized');
    }

    try {
        const body = await request.json();
        const { query, filters = {}, sortBy = 'relevance', sortOrder = 'desc', limit = 50, offset = 0 } = body;

        if (!query?.trim()) {
            return json({ data: [], count: 0, limit, offset });
        }

        // Advanced order search with filters
        const { data, error: searchError } = await supabase
            .rpc('search_orders_advanced', {
                p_query: query,
                p_filters: filters,
                p_sort_by: sortBy,
                p_sort_order: sortOrder,
                p_limit: limit,
                p_offset: offset
            });

        if (searchError) {
            console.error('Advanced search error:', searchError);
            throw error(500, 'Search failed');
        }

        // Log search
        await supabase
            .from('search_history')
            .insert({
                user_id: session.user.id,
                query,
                entity_type: 'orders',
                filters,
                results_count: data?.length || 0
            });

        return json({
            data: data || [],
            count: data?.length || 0,
            limit,
            offset,
            query
        });

    } catch (err: any) {
        console.error('Advanced search API error:', err);
        throw error(500, err.message || 'Search failed');
    }
};
