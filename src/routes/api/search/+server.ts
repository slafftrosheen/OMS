// src/routes/api/search/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
  const query = url.searchParams.get('q')?.trim() || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);

  if (!query) {
    return json({ 
      results: [], 
      query: '', 
      count: 0 
    });
  }

  try {
    if (!locals.supabase) {
      return json({ 
        results: [], 
        query, 
        count: 0,
        error: 'Database not available'
      }, { status: 503 });
    }

    const searchPattern = `%${query}%`;

    // Search in orders
    const { data: orders, error: ordersError } = await locals.supabase
      .from('draft_orders')
      .select('id, po_number, client, title, status, due_date')
      .or(`po_number.ilike.${searchPattern},client.ilike.${searchPattern},title.ilike.${searchPattern}`)
      .limit(limit);

    if (ordersError) {
      console.error('Search error:', ordersError);
      return json({ 
        results: [], 
        query, 
        count: 0,
        error: ordersError.message 
      }, { status: 500 });
    }

    // Ensure orders is an array
    const ordersArray = Array.isArray(orders) ? orders : [];

    const results = ordersArray.map(order => ({
      id: order.id,
      type: 'order' as const,
      title: order.title || order.client || order.po_number || 'Untitled',
      subtitle: order.client || '',
      poNumber: order.po_number || 'N/A',
      status: order.status || 'unknown',
      dueDate: order.due_date || null,
      href: `/orders/${order.id}`
    }));

    return json({
      results,
      query,
      count: results.length
    });

  } catch (error) {
    console.error('Search error:', error);
    return json({ 
      results: [], 
      query, 
      count: 0,
      error: 'Search failed'
    }, { status: 500 });
  }
};