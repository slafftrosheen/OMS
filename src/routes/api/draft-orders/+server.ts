// src/routes/api/draft-orders/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/draft-orders - List all draft orders
 */
export const GET: RequestHandler = async ({ locals: { supabase } }) => {
  const { data, error } = await supabase
    .from('draft_orders')
    .select(`
      *,
      order_profiles (
        id,
        profile_template_id,
        quantity,
        configuration,
        notes
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching draft orders:', error);
    return json([], { status: 500 });
  }

  // Map database fields to frontend model
  const orders = data.map(row => ({
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
    profiles: row.order_profiles || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));

  return json(orders);
};

/**
 * POST /api/draft-orders - Create a new draft order
 */
export const POST: RequestHandler = async ({ request, locals: { supabase } }) => {
  const data = await request.json();

  // Validation
  if (!data.poNumber || !data.clientName) {
    return json({ message: 'PO Number and Client Name are required' }, { status: 400 });
  }

  // 1. Create Draft Order
  const { data: order, error: orderError } = await supabase
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
      delivery_preset_id: data.deliveryPresetId || null
    })
    .select()
    .single();

  if (orderError) {
    console.error('Error creating draft order:', orderError);
    if (orderError.code === '23505') { // Unique violation
      return json({ message: 'PO Number already exists' }, { status: 409 });
    }
    return json({ message: 'Failed to create order' }, { status: 500 });
  }

  // 2. Create Profiles
  if (data.profiles && Array.isArray(data.profiles) && data.profiles.length > 0) {
    const profilesToInsert = data.profiles.map(p => ({
      draft_order_id: order.id,
      quantity: p.quantity || 1,
      configuration: p.configuration || {},
      notes: p.notes || ''
    }));

    const { error: profileError } = await supabase
      .from('order_profiles')
      .insert(profilesToInsert);

    if (profileError) {
      console.error('Error creating order profiles:', profileError);
      // Rollback might be needed here
    }
  }

  // 3. Link uploaded files
  if (data.fileIds && Array.isArray(data.fileIds) && data.fileIds.length > 0) {
    const filesToLink = data.fileIds.map(fileId => ({
      draft_order_id: order.id,
      file_id: fileId,
      file_type: 'sketch',
      display_name: null
    }));

    const { error: fileError } = await supabase
      .from('order_files')
      .insert(filesToLink);

    if (fileError) {
      console.warn('Could not link files to order:', fileError);
    }
  }

  return json(order, { status: 201 });
};
