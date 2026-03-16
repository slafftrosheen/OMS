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

    // Simplified query without embedded profiles join
    const { data: orders, count, error: fetchError } = await locals.supabase
      .from('draft_orders')
      .select('*', { count: 'exact' })
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
      profiles: [], // Empty array for now - profiles can be loaded separately if needed
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

/**
 * POST /api/draft-orders - Create a new draft order
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Map frontend fields (clientName, deadline, priority) to database schema (client, due_date, priority)
    const client = body.clientName || body.client;
    const due_date = body.deadline || body.due_date;
    const po_number = body.poNumber || body.po_number;
    const title = body.title || `${client} Order ${po_number}`; // Safely synthesize title

    if (!client || !due_date || !po_number) {
      return json({ error: 'Missing required fields: client, due_date, po_number' }, { status: 400 });
    }

    // 1. Create the order
    const { data: order, error: orderError } = await locals.supabase
      .from('draft_orders')
      .insert({
        po_number,
        title,
        client,
        due_date,
        loading_date: body.loadingDate || null,
        priority: body.priority || 'NORMAL',
        status: body.status || 'draft',
        notes: body.notes || '',
        delivery_preset_id: body.deliveryPresetId || null,
        delivery_address: body.deliveryAddress || '',
        delivery_contact: body.deliveryContact || '',
        delivery_phone: body.deliveryPhone || '',
        created_by: session.user.id
      })
      .select()
      .single();

    if (orderError) {
      console.error('Database order creation error:', orderError);
      return json({ error: `Failed to create order: ${orderError.message}` }, { status: 500 });
    }

    // 2. Insert Profiles (if any)
    if (body.profiles && Array.isArray(body.profiles) && body.profiles.length > 0) {
      const profilesToInsert = body.profiles.map((p: any) => ({
        draft_order_id: order.id,
        profile_template_id: p.profileTemplateId || null,
        quantity1: p.quantity || 1,
        configuration: p.configuration || {},
        notes: p.notes || ''
      }));

      const { error: profileError } = await locals.supabase
        .from('order_profiles')
        .insert(profilesToInsert);

      if (profileError) {
        console.error('Database profile insertion error:', profileError);
        // Continue but log error (don't fail the whole order creation)
      }
    }

    return json({ success: true, order }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/draft-orders error:', err);
    return json({ error: 'Internal server error processing order creation' }, { status: 500 });
  }
};

