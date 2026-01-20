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
    const { data: orders, count, error: fetchError } = await locals.supabase
      .from('draft_orders')
      .select(`
        *,
        profiles:order_profiles(
          id,
          profile_template_id,
          quantity,
          configuration,
          notes
        )
      `, { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (fetchError) {
      apiError(500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch orders');
    }

    // Transform to match frontend expectations
    const transformedOrders = (orders || []).map(row => ({
      id: row.id,
      poNumber: row.po_number,
      clientName: row.client,
      title: row.title,
      deadline: row.due_date,
      loadingDate: row.loading_date,
      status: row.status,
      priority: row.priority || 'NORMAL',
      deliveryAddress: row.delivery_address,
      deliveryContact: row.delivery_contact,
      deliveryPhone: row.delivery_phone,
      profiles: row.profiles || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    return json({
      data: transformedOrders,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: count ? Math.ceil(count / limit) : 0,
        hasMore: count ? page * limit < count : false
      }
    });
  } catch (err) {
    if ('status' in (err as any)) throw err;
    console.error('Error fetching draft orders:', err);
    apiError(500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch orders');
  }
};

/**
 * POST /api/draft-orders - Create a new draft order
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();

  if (!data.poNumber || !data.clientName) {
    apiError(400, 'VALIDATION_ERROR', 'PO Number and Client Name are required');
  }

  try {
    // Check for existing PO number first
    const { data: existing } = await locals.supabase
        .from('draft_orders')
        .select('id')
        .eq('po_number', data.poNumber)
        .single();

    if (existing) {
         apiError(409, 'INTERNAL_SERVER_ERROR', 'PO Number already exists');
    }

    // Insert order
    const { data: newOrder, error: orderError } = await locals.supabase
      .from('draft_orders')
      .insert({
        po_number: data.poNumber,
        client: data.clientName,
        title: data.title || `Order ${data.poNumber}`,
        due_date: data.deadline || null,
        loading_date: data.loadingDate || null,
        status: 'draft',
        notes: data.notes || '',
        priority: data.priority || 'NORMAL',
        delivery_address: data.deliveryAddress || null,
        delivery_contact: data.deliveryContact || null,
        delivery_phone: data.deliveryPhone || null,
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Insert profiles
    if (data.profiles && Array.isArray(data.profiles) && data.profiles.length > 0) {
      const profilesToInsert = data.profiles.map((p: any) => ({
        draft_order_id: newOrder.id,
        quantity: p.quantity || 1,
        configuration: p.configuration || {},
        notes: p.notes || ''
      }));

      const { error: profilesError } = await locals.supabase
        .from('order_profiles')
        .insert(profilesToInsert);

      if (profilesError) throw profilesError;
    }

    if (data.fileIds && Array.isArray(data.fileIds) && data.fileIds.length > 0) {
         const filesToInsert = data.fileIds.map((fileId: string) => ({
            draft_order_id: newOrder.id,
            file_id: fileId,
            file_type: 'sketch',
            display_name: null
         }));

         const { error: filesError } = await locals.supabase
            .from('order_files')
            .insert(filesToInsert);

         if (filesError) {
             console.error('Error inserting order files:', filesError);
         }
    }

    return json(newOrder, { status: 201 });
  } catch (err: any) {
    if ('status' in (err as any)) throw err;
    console.error('Error creating draft order:', err);
    if (err.code === '23505') {
      apiError(409, 'INTERNAL_SERVER_ERROR', 'PO Number already exists');
    }
    apiError(500, 'INTERNAL_SERVER_ERROR', 'Failed to create order');
  }
};