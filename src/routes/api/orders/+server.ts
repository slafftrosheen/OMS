// src/routes/api/orders/+server.ts
// NOTE: This endpoint now uses the 'draft_orders' table which is the primary orders table
// in the system. The 'orders' table may not exist or may be a view.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET: List orders with optional filters
export const GET: RequestHandler = async ({ url, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { supabase } = locals;

  const status = url.searchParams.get('status');
  const station = url.searchParams.get('station');
  const search = url.searchParams.get('search');
  const loadingDate = url.searchParams.get('loading_date');
  const priority = url.searchParams.get('priority');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  try {
    // Use draft_orders table - this is the primary orders table
    let query = supabase
      .from('draft_orders')
      .select('*', { count: 'exact' });

    // Apply filters
    if (status) query = query.eq('status', status);
    if (loadingDate) query = query.eq('loading_date', loadingDate);
    if (priority) query = query.eq('priority', priority);

    // Station filter - resolve orders that have a stage at the given station.
    // Supabase's .in() does not accept a filter-builder directly, so we resolve
    // the matching order ids first and pass them as a plain array.
    if (station) {
      const { data: stageRows, error: stageErr } = await supabase
        .from('order_stages')
        .select('draft_order_id')
        .eq('station', station);

      if (stageErr) {
        console.error('[Orders API] Station lookup error:', stageErr);
        throw error(500, 'Failed to filter by station');
      }

      const ids = (stageRows ?? [])
        .map((r: { draft_order_id: string }) => r.draft_order_id)
        .filter(Boolean);

      if (ids.length === 0) {
        // No orders at this station -> return an empty, valid result.
        return json({ data: [], count: 0 });
      }
      query = query.in('id', ids);
    }

    // Full-text search
    if (search) {
      query = query.or(
        `po_number.ilike.%${search}%,title.ilike.%${search}%,client.ilike.%${search}%`
      );
    }

    // Pagination and ordering
    query = query
      .order('priority', { ascending: false })
      .order('due_date', { ascending: true })
      .range(offset, offset + limit - 1);

    const { data, error: queryError, count } = await query;

    if (queryError) {
      console.error('Orders query error:', queryError);
      throw error(500, 'Failed to fetch orders');
    }

    // Transform snake_case to camelCase for frontend
    const transformedData = (data || []).map(order => ({
      id: order.id,
      poNumber: order.po_number,
      clientName: order.client,
      title: order.title,
      deadline: order.due_date,
      loadingDate: order.loading_date,
      status: order.status,
      priority: order.priority,
      notes: order.notes,
      deliveryAddress: order.delivery_address,
      deliveryContact: order.delivery_contact,
      deliveryPhone: order.delivery_phone,
      deliveryPresetId: order.delivery_preset_id,
      profileCount: 0, // Will be populated separately if needed
      createdAt: order.created_at,
      updatedAt: order.updated_at
    }));

    return json({
      data: transformedData,
      count: count || 0,
      limit,
      offset
    });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Orders GET error:', err);
    throw error(500, 'Internal server error');
  }
};

// POST: Create new order
export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { supabase } = locals;

  try {
    const body = await request.json();

    // Map camelCase to snake_case
    const po_number = body.poNumber || body.po_number || null;
    const client = body.clientName || body.client;
    const due_date = body.deadline || body.due_date;
    const loading_date = body.loadingDate || body.loading_date;
    const priority = body.priority || 'normal';
    const status = body.status || 'draft';

    if (!client || !due_date) {
      throw error(400, 'Missing required fields: client, due_date');
    }

    // Validate PO number format if provided
    if (po_number && (typeof po_number !== 'string' || po_number.length > 16)) {
      throw error(400, 'PO number must be 1-16 characters');
    }

    // Create order in draft_orders table
    const { data: order, error: orderError } = await supabase
      .from('draft_orders')
      .insert({
        po_number,
        title: body.title || `${client} – ${po_number ?? 'pending'}`,
        client,
        due_date,
        loading_date,
        priority,
        status,
        notes: body.notes || '',
        delivery_address: body.deliveryAddress || '',
        delivery_contact: body.deliveryContact || '',
        delivery_phone: body.deliveryPhone || '',
        delivery_preset_id: body.deliveryPresetId || null,
        created_by: session.user.id
      })
      .select()
      .single();

    if (orderError) {
      console.error('Order creation error:', orderError);
      if (orderError.code === '23505' && /po_number/.test(orderError.message)) {
        throw error(409, 'PO number already in use');
      }
      throw error(500, `Failed to create order: ${orderError.message}`);
    }

    // Add materials if provided
    if (body.materials && Array.isArray(body.materials)) {
      const materials = body.materials.map((m: any, idx: number) => ({
        order_id: order.id,
        material_type: m.materialType || m.material_type,
        material_category: m.materialCategory || m.material_category,
        thickness: m.thickness,
        dimensions: m.dimensions,
        color: m.color,
        ral_code: m.ralCode || m.ral_code,
        pantone_code: m.pantoneCode || m.pantone_code,
        hex_code: m.hexCode || m.hex_code,
        oracal_code: m.oracalCode || m.oracal_code,
        quantity: m.quantity,
        unit: m.unit || 'pcs',
        supplier: m.supplier,
        notes: m.notes,
        display_order: idx
      }));

      const { error: materialsError } = await supabase
        .from('order_materials')
        .insert(materials);

      if (materialsError) {
        console.error('Materials creation error:', materialsError);
      }
    }

    // Add profiles if provided
    if (body.profiles && Array.isArray(body.profiles)) {
      const profiles = body.profiles.map((p: any, idx: number) => ({
        order_id: order.id,
        profile_template_id: p.profileTemplateId || p.profile_template_id || null,
        quantity1: p.quantity || p.quantity1 || 1,
        configuration: p.configuration || {},
        notes: p.notes || ''
      }));

      const { error: profileError } = await supabase
        .from('order_profiles')
        .insert(profiles);

      if (profileError) {
        console.error('Profile creation error:', profileError);
      }
    }

    // Add custom fields if provided
    if (body.fields && Array.isArray(body.fields)) {
      const fields = body.fields.map((f: any, idx: number) => ({
        order_id: order.id,
        key: f.key,
        label: f.label,
        value: f.value,
        field_type: f.fieldType || f.field_type || 'text',
        display_order: idx,
        is_required: f.isRequired || f.is_required || false
      }));

      const { error: fieldsError } = await supabase
        .from('order_fields')
        .insert(fields);

      if (fieldsError) {
        console.error('Fields creation error:', fieldsError);
      }
    }

    // Add files if provided (file IDs)
    if (body.fileIds && Array.isArray(body.fileIds)) {
      const files = body.fileIds.map((fileId: string, idx: number) => ({
        order_id: order.id,
        file_id: fileId,
        file_type: 'attachment',
        display_name: `File ${idx + 1}`
      }));

      const { error: filesError } = await supabase
        .from('order_files')
        .insert(files);

      if (filesError) {
        console.error('Files creation error:', filesError);
      }
    }

    // Transform response to camelCase
    const transformedOrder = {
      id: order.id,
      poNumber: order.po_number,
      clientName: order.client,
      title: order.title,
      deadline: order.due_date,
      loadingDate: order.loading_date,
      status: order.status,
      priority: order.priority,
      notes: order.notes,
      deliveryAddress: order.delivery_address,
      deliveryContact: order.delivery_contact,
      deliveryPhone: order.delivery_phone,
      deliveryPresetId: order.delivery_preset_id,
      createdAt: order.created_at,
      updatedAt: order.updated_at
    };

    return json(transformedOrder, { status: 201 });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Order POST error:', err);
    throw error(500, 'Internal server error');
  }
};