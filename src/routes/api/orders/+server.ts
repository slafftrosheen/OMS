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
  const isRd = url.searchParams.get('is_rd');
  const loadingDate = url.searchParams.get('loading_date');
  const priority = url.searchParams.get('priority');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  try {
    let query = supabase
      .from('ordersummary')
      .select('*', { count: 'exact' });

    // Apply filters
    if (status) query = query.eq('status', status);
    if (isRd === 'true') query = query.eq('is_rd', true);
    if (loadingDate) query = query.eq('loading_date', loadingDate);
    if (priority) query = query.eq('priority', parseInt(priority));

    // Station filter (requires current_station)
    if (station) query = query.eq('current_station', station);

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

    return json({
      data: data || [],
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
    
    // Validate required fields
    if (!body.title || !body.client || !body.due_date) {
      throw error(400, 'Missing required fields: title, client, due_date');
    }

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        po_number: body.po_number,
        title: body.title,
        client: body.client,
        due_date: body.due_date,
        loading_date: body.loading_date,
        is_rd: body.is_rd || false,
        rd_notes: body.rd_notes,
        priority: body.priority || 0,
        status: body.status || 'draft',
        notes: body.notes,
        badges: body.badges || [],
        created_by: session.user.id
      })
      .select()
      .single();

    if (orderError) {
      console.error('Order creation error:', orderError);
      throw error(500, `Failed to create order: ${orderError.message}`);
    }

    // Add materials if provided
    if (body.materials && Array.isArray(body.materials)) {
      const materials = body.materials.map((m: any, idx: number) => ({
        order_id: order.id,
        material_type: m.material_type,
        material_category: m.material_category,
        thickness: m.thickness,
        dimensions: m.dimensions,
        color: m.color,
        ral_code: m.ral_code,
        pantone_code: m.pantone_code,
        hex_code: m.hex_code,
        oracal_code: m.oracal_code,
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
        // Don't fail the entire request, but log it
      }
    }

    // Add custom fields if provided
    if (body.fields && Array.isArray(body.fields)) {
      const fields = body.fields.map((f: any, idx: number) => ({
        order_id: order.id,
        key: f.key,
        label: f.label,
        value: f.value,
        field_type: f.field_type || 'text',
        display_order: idx,
        is_required: f.is_required || false
      }));

      const { error: fieldsError } = await supabase
        .from('order_fields')
        .insert(fields);

      if (fieldsError) {
        console.error('Fields creation error:', fieldsError);
      }
    }

    // Assign users if provided
    if (body.assignees && Array.isArray(body.assignees)) {
      const assignees = body.assignees.map((a: any) => ({
        order_id: order.id,
        station: a.station,
        user_id: a.user_id,
        role: a.role || 'worker',
        assigned_by: session.user.id
      }));

      const { error: assigneesError } = await supabase
        .from('order_assignees')
        .insert(assignees);

      if (assigneesError) {
        console.error('Assignees creation error:', assigneesError);
      }
    }

    // Fetch complete order with relations
    const { data: completeOrder } = await supabase
      .from('ordersummary')
      .select('*')
      .eq('id', order.id)
      .single();

    return json(completeOrder || order, { status: 201 });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Order POST error:', err);
    throw error(500, 'Internal server error');
  }
};
