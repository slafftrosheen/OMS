// src/routes/api/draft-orders/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { getPagination } from '$lib/server/pagination';
import { apiError } from '$lib/server/errors';

/**
 * GET /api/draft-orders - List all draft orders with pagination
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const { page, limit, offset } = getPagination(url);

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

    const { data: orders, count, error: fetchError } = await locals.supabase
      .from('draft_orders')
      .select(`
        *,
        profiles:order_profiles(
          id,
          profile_template_id,
          quantity1,
          quantity2,
          quantity3,
          quantity4,
          configuration,
          notes,
          order_index
        )
      `, { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Supabase fetch error:', fetchError);
      // Return empty array with error info instead of throwing
      return json({ 
        data: [], 
        pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
        error: fetchError.message 
      }, { status: 500 });
    }

    // Ensure orders is an array
    const ordersArray = Array.isArray(orders) ? orders : [];

    // Transform to match frontend expectations
    const transformedOrders = ordersArray.map(row => ({
      id: row.id,
      poNumber: row.po_number || 'N/A',
      clientName: row.client || 'Unknown',
      title: row.title || 'Untitled',
      deadline: row.due_date || null,
      loadingDate: row.loading_date || null,
      status: row.status || 'draft',
      priority: row.priority || 'normal',
      deliveryAddress: row.delivery_address || null,
      deliveryContact: row.delivery_contact || null,
      deliveryPhone: row.delivery_phone || null,
      profiles: Array.isArray(row.profiles) ? row.profiles.map((profile: any) => ({
        ...profile,
        totalQuantity: (profile.quantity1 || 0) + (profile.quantity2 || 0) + (profile.quantity3 || 0) + (profile.quantity4 || 0)
      })) : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    return json({
      data: transformedOrders,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: count ? Math.ceil(count / limit) : 0,
        hasMore: count ? page * limit < count : false
      }
    });
  } catch (err) {
    // Catch any unexpected errors
    if ('status' in (err as any)) throw err;
    console.error('Unexpected error fetching draft orders:', err);
    
    // Return safe fallback response
    return json({ 
      data: [], 
      pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
      error: 'An unexpected error occurred' 
    }, { status: 500 });
  }
};
