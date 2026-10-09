// src/routes/api/draft-orders/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateRequest } from '$lib/server/validation';
import { draftOrderUpdateSchema } from '$lib/server/schemas/draftOrders';
import { requireOwnership } from '$lib/server/auth/permissions';

/**
 * GET /api/draft-orders/[id] - Get single order with profiles
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  try {
    const { data: order, error: fetchError } = await locals.supabase
      .from('draft_orders')
      .select(`
        *,
        profiles:order_profiles(
          id,
          profile_template_id,
          quantity:quantity1,
          configuration,
          notes
        )
      `)
      .or(`id.eq.${params.id},po_number.eq.${params.id}`)
      .single();

    if (fetchError) {
       if (fetchError.code === 'PGRST116') throw error(404, 'Order not found');
       console.error('Supabase error fetching order:', fetchError);
       throw error(500, `Database error: ${fetchError.message}`);
    }

    if (!order) {
       throw error(404, 'Order not found');
    }

    // Fetch files
    let files: any[] = [];
    const { data: orderFiles } = await locals.supabase
        .from('order_files')
        .select(`
            id, file_type, display_name,
            files(id, filename, original_name, created_at)
        `)
        .eq('draft_order_id', order.id);

    if (orderFiles) {
        files = orderFiles.map((of: any) => ({
            id: of.files?.id,
            filename: of.files?.filename,
            originalName: of.files?.original_name,
            fileType: of.file_type,
            uploadedAt: of.files?.created_at
        }));
    }

    return json({
      id: order.id,
      poNumber: order.po_number,
      clientName: order.client,
      title: order.title,
      deadline: order.due_date,
      loadingDate: order.loading_date,
      status: order.status,
      notes: order.notes,
      priority: order.priority || 'NORMAL',
      deliveryAddress: order.delivery_address,
      deliveryContact: order.delivery_contact,
      deliveryPhone: order.delivery_phone,
      profiles: order.profiles || [],
      files,
      createdAt: order.created_at,
      updatedAt: order.updated_at
    });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to fetch order:', err);
    throw error(500, 'Failed to fetch order');
  }
};

/**
 * PUT /api/draft-orders/[id] - Update order
 */
export const PUT: RequestHandler = async (event) => {
  const { params, request } = event;
  await requireOwnership(event, 'draft_orders', params.id, 'created_by');
  const data = await validateRequest(request, draftOrderUpdateSchema);
  if (data.status !== undefined) throw error(409, 'Use the dedicated order lifecycle endpoints to change status');

  try {
    const { data: order, error: findError } = await event.locals.supabase
        .from('draft_orders')
        .select('id,status')
        .or(`id.eq.${params.id},po_number.eq.${params.id}`)
        .single();

    if (findError || !order) throw error(404, 'Order not found');

    if (data.loadingDate !== undefined && !['DRAFT','draft','PENDING_REVIEW'].includes(order.status)) {
      throw error(409, 'Confirmed orders must use loading-day assignment');
    }
    const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString()
    };
    if (data.clientName || data.client) updates.client = data.clientName ?? data.client;
    if (data.title) updates.title = data.title;
    if (data.deadline || data.due) updates.due_date = data.deadline ?? data.due;
    // Allow clearing date if explicitly null
    if (data.loadingDate !== undefined) updates.loading_date = data.loadingDate;

    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.priority) updates.priority = data.priority;
    if (data.deliveryAddress !== undefined) updates.delivery_address = data.deliveryAddress;
    if (data.deliveryContact !== undefined) updates.delivery_contact = data.deliveryContact;
    if (data.deliveryPhone !== undefined) updates.delivery_phone = data.deliveryPhone;

    const { data: updatedOrder, error: updateError } = await event.locals.supabase
        .from('draft_orders')
        .update(updates)
        .eq('id', order.id)
        .select()
        .single();

    if (updateError) throw updateError;

    // Update profiles
    if (data.profiles && Array.isArray(data.profiles)) {
        // Live RPC contract: replace_order_profiles(p_order_id uuid, p_profiles jsonb)
        // where each item carries profile_template_id, quantity1..4, configuration,
        // notes, order_index. The UI sends camelCase with a single quantity.
        const profileItems = data.profiles.map((p: any, idx: number) => {
            const cfg = (p.configuration && typeof p.configuration === 'object') ? p.configuration : {};
            const q = (typeof p.quantity === 'number' && p.quantity > 0) ? Math.floor(p.quantity) : 1;
            return {
                profile_template_id: p.profileTemplateId ?? p.profile_template_id ?? null,
                quantity1: q,
                quantity2: p.quantity2 ?? 0,
                quantity3: p.quantity3 ?? 0,
                quantity4: p.quantity4 ?? 0,
                configuration: cfg,
                notes: p.notes ?? '',
                order_index: idx
            };
        });

        // RPC path: server-side delete+insert is atomic and RLS-safe (SECURITY DEFINER).
        const { error: profilesError } = await event.locals.supabase.rpc('replace_order_profiles', {
            p_order_id: order.id,
            p_profiles: profileItems
        });

        if (profilesError) {
            // No manual fallback: the old fallback inserted a nonexistent `order_id`
            // column into order_profiles (live column is draft_order_id) and always failed.
            console.error('replace_order_profiles failed:', profilesError);
            throw error(500, 'Failed to update order profiles');
        }
    }

    // Link new files
    if (data.newFileIds && Array.isArray(data.newFileIds) && data.newFileIds.length > 0) {
        const filesToInsert = data.newFileIds.map((fid: string) => ({
            draft_order_id: order.id,
            file_id: fid,
            file_type: 'sketch',
            display_name: null
        }));
        await event.locals.supabase.from('order_files').insert(filesToInsert);
    }

    return json({
      id: updatedOrder.id,
      poNumber: updatedOrder.po_number,
      client: updatedOrder.client,
      title: updatedOrder.title,
      due: updatedOrder.due_date,
      loadingDate: updatedOrder.loading_date,
      status: updatedOrder.status,
      notes: updatedOrder.notes,
      priority: updatedOrder.priority,
      deliveryAddress: updatedOrder.delivery_address,
      deliveryContact: updatedOrder.delivery_contact,
      deliveryPhone: updatedOrder.delivery_phone
    });

  } catch (err: any) {
    console.error('Failed to update order:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to update order');
  }
};

/**
 * PATCH /api/draft-orders/[id] - Partial update
 */
export const PATCH: RequestHandler = async (event) => {
  const { params, request } = event;
  await requireOwnership(event, 'draft_orders', params.id, 'created_by');
  const data = await validateRequest(request, draftOrderUpdateSchema);
  if (data.status !== undefined) throw error(409, 'Use the dedicated order lifecycle endpoints to change status');

  try {
     const { data: order, error: findError } = await event.locals.supabase
        .from('draft_orders')
        .select('id,status')
        .or(`id.eq.${params.id},po_number.eq.${params.id}`)
        .single();

    if (findError || !order) throw error(404, 'Order not found');

    if (data.loadingDate !== undefined && !['DRAFT','draft','PENDING_REVIEW'].includes(order.status)) {
      throw error(409, 'Confirmed orders must use loading-day assignment');
    }
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.loadingDate !== undefined) updates.loading_date = data.loadingDate;

    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.notes !== undefined) updates.notes = data.notes;

    if (Object.keys(updates).length <= 1) {
       throw error(400, 'No fields to update');
    }

    const { data: updatedOrder, error: updateError } = await event.locals.supabase
        .from('draft_orders')
        .update(updates)
        .eq('id', order.id)
        .select()
        .single();

    if (updateError) throw updateError;

    return json({
      id: updatedOrder.id,
      poNumber: updatedOrder.po_number,
      loadingDate: updatedOrder.loading_date,
      status: updatedOrder.status,
      priority: updatedOrder.priority,
      notes: updatedOrder.notes
    });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to patch order:', err);
    throw error(500, 'Failed to update order');
  }
};

/**
 * DELETE /api/draft-orders/[id] - Delete order
 */
export const DELETE: RequestHandler = async (event) => {
  const { params } = event;
  await requireOwnership(event, 'draft_orders', params.id, 'created_by');
  try {
    const { data: deleted, error: deleteError } = await event.locals.supabase
        .from('draft_orders')
        .delete()
        .or(`id.eq.${params.id},po_number.eq.${params.id}`)
        .select('po_number')
        .single();

    if (deleteError || !deleted) {
         // Try to verify existence first if delete returns 0 rows (PostgREST V10+ behavior depends on Prefer header)
         throw error(404, 'Order not found');
    }

    return json({ success: true, id: deleted.po_number });
  } catch (err: any) {
    if (err.status) throw err;
    console.error('Failed to delete order:', err);
    throw error(500, 'Failed to delete order');
  }
};
