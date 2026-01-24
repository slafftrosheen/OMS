/**
 * Advanced Search API
 * Handles complex search queries with filters
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/server/supabase';

// POST /api/search - Execute advanced search
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();
  const {
    query = null,
    filters = {},
    sortBy = 'created_at',
    sortDirection = 'desc',
    page = 1,
    limit = 50
  } = body;

  const offset = (page - 1) * limit;

  try {
    // Use the database search function
    const { data, error: dbError } = await supabase
      .rpc('search_orders', {
        p_query: query,
        p_filters: filters,
        p_limit: limit,
        p_offset: offset
      });

    if (dbError) {
      console.error('[Search API] Error:', dbError);
      throw error(500, 'Search failed');
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('draft_orders')
      .select('*', { count: 'exact', head: true });

    // Apply same filters for count
    if (filters.status) {
      countQuery = countQuery.eq('status', filters.status);
    }
    if (filters.client) {
      countQuery = countQuery.ilike('client', `%${filters.client}%`);
    }
    if (filters.dateFrom) {
      countQuery = countQuery.gte('created_at', filters.dateFrom);
    }
    if (filters.dateTo) {
      countQuery = countQuery.lte('created_at', filters.dateTo);
    }

    const { count } = await countQuery;

    return json({
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      },
      query,
      filters
    });

  } catch (err) {
    console.error('[Search API] Error:', err);
    throw error(500, 'Search failed');
  }
};

// GET /api/search/suggestions - Get search suggestions
export const GET: RequestHandler = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const type = url.searchParams.get('type'); // 'client', 'status', 'recent'
  const query = url.searchParams.get('query') || '';

  try {
    let suggestions: any[] = [];

    if (type === 'recent') {
      // Get user's recent searches
      const { data, error: dbError } = await supabase
        .from('search_history')
        .select('query, searched_at')
        .eq('user_id', user.id)
        .not('query', 'is', null)
        .order('searched_at', { ascending: false })
        .limit(10);

      if (dbError) throw dbError;

      suggestions = data?.map(s => ({
        type: 'recent',
        value: s.query,
        label: s.query
      })) || [];

    } else {
      // Get auto-complete suggestions
      const { data, error: dbError } = await supabase
        .from('search_suggestions')
        .select('*')
        .eq('suggestion_type', type || 'client')
        .ilike('value', `%${query}%`)
        .order('frequency', { ascending: false })
        .limit(10);

      if (dbError) throw dbError;

      suggestions = data?.map(s => ({
        type: s.suggestion_type,
        value: s.value,
        label: s.value,
        frequency: s.frequency
      })) || [];
    }

    return json({ data: suggestions });

  } catch (err) {
    console.error('[Search API] Suggestions error:', err);
    throw error(500, 'Failed to get suggestions');
  }
};