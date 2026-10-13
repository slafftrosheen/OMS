// src/routes/api/draft-orders/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { getPagination } from '$lib/server/pagination';
import { apiError } from '$lib/server/errors';
import { notifyDraftCreated } from '$lib/server/notifications/orderNotifier';
import { orderFields, canonicalDraftFields, canonicalOrderProfiles } from '$lib/server/order/draft-contract';

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
  const user = locals.user;
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!['RD','Boss','HeadOfProduction'].includes(user.role)) {
    return json({ error: 'Only manufacturing management can create orders' }, { status: 403 });
  }
  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      raw.poNumber !== undefined || raw.po_number !== undefined) {
    return json({ error: 'Invalid order; PO is assigned during confirmation' }, { status: 400 });
  }
  const parsed = orderFields.safeParse(raw);
  if (!parsed.success) return json({ error: 'Invalid order fields', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const input = parsed.data;
  let fields: Record<string, unknown>;
  try { fields = canonicalDraftFields(input, true); }
  catch (err) { return json({ error: (err as Error).message }, { status: 400 }); }
  const { data: order, error: createError } = await locals.supabase.rpc('oms_create_draft_form', {
    p_fields: fields,
    p_profiles: canonicalOrderProfiles(input.profiles),
    p_status: input.status ?? 'PENDING_REVIEW'
  });
  if (createError || !order) {
    if (createError?.code === 'PGRST202') return json({
      error: 'Atomic draft-form migration missing; deploy 20261013000001_atomic_draft_forms.sql'
    }, { status: 503 });
    console.error('[Orders] Transactional draft create failed', createError?.code);
    return json({ error: 'Order was not created. Verify required fields, profiles and permissions.' },
      { status: createError?.code === '23505' ? 409 : 400 });
  }
  if (order.status === 'PENDING_REVIEW') {
    try {
      await notifyDraftCreated(locals.supabase, {
        orderId: order.id, internalRef: order.internal_ref ?? null,
        client: order.client, createdById: user.id
      });
    } catch (err) { console.error('[Orders] Draft notification unavailable', err); }
  }
  return json({ success: true, order }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
};
