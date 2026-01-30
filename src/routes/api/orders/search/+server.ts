import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST: Advanced search with filters
export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { supabase } = locals;

  try {
    const body = await request.json();

    // Use the database search function
    if (body.query) {
      const { data, error: searchError } = await supabase
        .rpc('search_orders', {
          p_search_query: body.query,
          p_limit: body.limit || 50
        });

      if (searchError) throw error(500, searchError.message);

      // Enrich with full order data
      if (data && data.length > 0) {
        const ids = data.map((r: any) => r.id);
        const { data: orders } = await supabase
          .from('order_summary')
          .select('*')
          .in('id', ids);

        return json(orders || []);
      }

      return json([]);
    }

    // Complex filter query
    let query = supabase
      .from('order_summary')
      .select('*', { count: 'exact' });

    // Apply filters
    if (body.status) query = query.in('status', Array.isArray(body.status) ? body.status : [body.status]);
    if (body.client) query = query.ilike('client', `%${body.client}%`);
    if (body.is_rd !== undefined) query = query.eq('is_rd', body.is_rd);
    if (body.priority_min) query = query.gte('priority', body.priority_min);
    if (body.priority_max) query = query.lte('priority', body.priority_max);
    if (body.due_date_from) query = query.gte('due_date', body.due_date_from);
    if (body.due_date_to) query = query.lte('due_date', body.due_date_to);
    if (body.loading_date) query = query.eq('loading_date', body.loading_date);
    if (body.current_station) query = query.eq('current_station', body.current_station);
    if (body.has_blocked) query = query.gt('blocked_stages', 0);
    if (body.has_rework) query = query.gt('rework_stages', 0);
    if (body.progress_min) query = query.gte('progress_percentage', body.progress_min);
    if (body.progress_max) query = query.lte('progress_percentage', body.progress_max);

    // Sorting
    const sortBy = body.sort_by || 'priority';
    const sortOrder = body.sort_order || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Pagination
    const limit = body.limit || 50;
    const offset = body.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error: queryError, count } = await query;

    if (queryError) throw error(500, queryError.message);

    return json({
      data: data || [],
      count: count || 0,
      limit,
      offset
    });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Search error:', err);
    throw error(500, 'Internal server error');
  }
};
