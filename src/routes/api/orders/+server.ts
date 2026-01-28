// src/routes/api/orders/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { getPagination } from '$lib/server/pagination';
import { apiError } from '$lib/server/errors';

/**
 * GET /api/orders - List all orders (both draft and published) with pagination
 * This endpoint combines draft_orders and published orders for a unified view
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const { page, limit, offset } = getPagination(url);
  const sort = url.searchParams.get('sort') || 'created_at';
  const direction = url.searchParams.get('direction') || 'desc';
  const status = url.searchParams.get('status');

  try {
    // Ensure supabase client exists
    if (!locals.supabase) {
      console.error('Supabase client not initialized');
      return json({ 
        data: [], 
        pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
        error: 'Database connection not available'
      }, { status: 503 });
    }

    // Validate sort field
    const validSortFields = ['created_at', 'due_date', 'title', 'client', 'po_number', 'updated_at'];
    const sortField = validSortFields.includes(sort) ? sort : 'created_at';
    const ascending = direction === 'asc';

    // Build query for draft orders
    let draftQuery = locals.supabase
      .from('draft_orders')
      .select(`
        id,
        po_number,
        client,
        title,
        due_date,
        loading_date,
        status,
        priority,
        delivery_address,
        delivery_contact,
        delivery_phone,
        created_at,
        updated_at,
        created_by,
        profiles:order_profiles(
          id,
          profile_template_id,
          quantity,
          configuration,
          notes
        )
      `, { count: 'exact' });

    // Apply status filter if provided
    if (status) {
      draftQuery = draftQuery.eq('status', status);
    }

    const { data: drafts, count: draftCount, error: draftError } = await draftQuery
      .order(sortField, { ascending })
      .range(offset, offset + limit - 1);

    if (draftError) {
      console.error('Error fetching draft orders:', draftError);
      // Don't fail completely, just log and continue
    }

    // For now, just return draft orders
    // TODO: Merge with published orders from orders table if it exists
    const orders = Array.isArray(drafts) ? drafts : [];
    const total = draftCount || 0;

    // Transform to consistent format
    const transformedOrders = orders.map(order => ({
      id: order.id,
      poNumber: order.po_number || 'N/A',
      client: order.client || 'Unknown',
      title: order.title || 'Untitled',
      due_date: order.due_date || null,
      loading_date: order.loading_date || null,
      status: order.status || 'draft',
      priority: order.priority || 'NORMAL',
      delivery_address: order.delivery_address || null,
      delivery_contact: order.delivery_contact || null,
      delivery_phone: order.delivery_phone || null,
      profiles: Array.isArray(order.profiles) ? order.profiles : [],
      created_at: order.created_at,
      updated_at: order.updated_at,
      created_by: order.created_by,
      // Legacy field mappings for compatibility
      stages: {},
      rework_count: 0,
      price: null
    }));

    return json({
      data: transformedOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  } catch (err) {
    console.error('Unexpected error fetching orders:', err);
    
    return json({ 
      data: [], 
      pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
      error: 'An unexpected error occurred' 
    }, { status: 500 });
  }
};