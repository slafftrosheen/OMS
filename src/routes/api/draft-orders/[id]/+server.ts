// src/routes/api/draft-orders/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { splitVersionedOrderPayload } from '$lib/server/order/edit-version';
import { orderFields, canonicalDraftFields, canonicalOrderProfiles,
  canEditDraft, canEditConfirmedMetadata, DRAFT_EDIT_STATUSES
} from '$lib/server/order/draft-contract';

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
          quantity2,quantity3,quantity4,order_index,
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
        files = orderFiles.map((linked: any) => {
          const file = Array.isArray(linked.files) ? linked.files[0] : linked.files;
          return {
            id: file?.id,
            filename: file?.filename,
            originalName: file?.original_name,
            fileType: linked.file_type,
            displayName: linked.display_name,
            uploadedAt: file?.created_at
          };
        }).filter((entry: any) => entry.id);
    }

    return json({
      id: order.id,
      poNumber: order.po_number,
      internalRef: order.internal_ref,
      createdBy: order.created_by,
      clientName: order.client,
      title: order.title,
      deadline: order.due_date,
      loadingDate: order.loading_date,
      status: order.status,
      notes: order.notes,
      priority: order.priority || 'NORMAL',
      deliveryPresetId: order.delivery_preset_id,
      isRd: order.is_rd,
      rdNotes: order.rd_notes,
      badges: order.badges,
      deliveryAddress: order.delivery_address,
      deliveryContact: order.delivery_contact,
      deliveryPhone: order.delivery_phone,
      deliveryEmail: order.metadata?.delivery_email ?? '',
      // PostgREST embedded relations do not guarantee row ordering.
      // Keep native profile numbering and persisted order_index stable across
      // editor reloads, assistant references and subsequent atomic PUT saves.
      profiles: (order.profiles || []).slice()
        .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map((p: any) => ({ ...p, dbId: p.id, profileTemplateId: p.profile_template_id })),
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
/** Update an unconfirmed draft atomically with its profile instances.
 * Confirmation/status/PO mutation is explicitly out of scope.
 */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');
  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      ['poNumber','po_number','status','newFileIds','created_by','createdBy'].some(k => k in raw)) {
    throw error(400, 'Use the dedicated order lifecycle endpoints and file uploads');
  }
  const versioned = splitVersionedOrderPayload(raw);
  if (!versioned) throw error(428, 'Reload this order before saving: revision required');
  const parsed = orderFields.safeParse(versioned.form);
  if (!parsed.success) return json({ error: 'Invalid order form', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const { data: order, error: lookupError } = await locals.supabase.from('draft_orders')
    .select('id,created_by,status').eq('id', params.id).maybeSingle();
  if (lookupError) throw error(503, 'Order lookup unavailable');
  if (!order) throw error(404, 'Draft not found');
  if (!canEditDraft(user.role, order.created_by, user.id, order.status)) {
    throw error(403, 'Only authorized draft editors may change this order');
  }
  const fields = canonicalDraftFields(parsed.data, false);
  const { data: updated, error: updateError } = await locals.supabase.rpc('oms_update_draft_form', {
    p_order_id: order.id, p_fields: fields,
    p_profiles: parsed.data.profiles === undefined ? null : canonicalOrderProfiles(parsed.data.profiles),
    p_expected_updated_at: versioned.expectedUpdatedAt
  });
  if (updateError || !updated) {
    if (updateError?.code === 'PGRST202') throw error(503, 'Atomic draft-form migration is not deployed');
    console.error('[Orders] Atomic draft form update failed', updateError?.code);
    throw error(409, 'Order was changed in another session. Reload before saving.');
  }
  return json({
    id: updated.id, poNumber: updated.po_number, client: updated.client,
    clientName: updated.client, title: updated.title, due: updated.due_date,
    deadline: updated.due_date, loadingDate: updated.loading_date,
    priority: updated.priority, notes: updated.notes, status: updated.status,
    deliveryAddress: updated.delivery_address, deliveryContact: updated.delivery_contact,
    deliveryPhone: updated.delivery_phone, deliveryEmail: updated.metadata?.delivery_email ?? '',
    deliveryPresetId: updated.delivery_preset_id,
    isRd: updated.is_rd, rdNotes: updated.rd_notes, badges: updated.badges,
    updatedAt: updated.updated_at
  }, { headers: { 'Cache-Control': 'private, no-store' } });
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');
  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      ['poNumber','po_number','status','profiles','newFileIds','created_by','createdBy'].some(k => k in raw)) {
    throw error(400, 'Use dedicated lifecycle and file endpoints');
  }
  const versioned = splitVersionedOrderPayload(raw);
  if (!versioned) throw error(428, 'Reload this order before saving: revision required');
  const parsed = orderFields.safeParse(versioned.form);
  if (!parsed.success) return json({ error: 'Invalid order form', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const { data: order, error: lookupError } = await locals.supabase.from('draft_orders')
    .select('id,created_by,status').eq('id', params.id).maybeSingle();
  if (lookupError) throw error(503, 'Order lookup unavailable');
  if (!order) throw error(404, 'Order not found');
  if (DRAFT_EDIT_STATUSES.has(order.status)) {
    if (!canEditDraft(user.role,order.created_by,user.id,order.status)) throw error(403, 'Draft editor role required');
    const { data: updated, error: failed } = await locals.supabase.rpc('oms_update_draft_form', {
      p_order_id: order.id, p_fields: canonicalDraftFields(parsed.data,false), p_profiles: null,
      p_expected_updated_at: versioned.expectedUpdatedAt
    });
    if (failed || !updated) throw error(failed?.code === 'PGRST202' ? 503 : 409, 'Draft update unavailable');
    return json(updated, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  if (!canEditConfirmedMetadata(user.role)) throw error(403, 'Manager role required');
  if (!['CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD'].includes(order.status)) {
    throw error(409,'Order metadata is locked in this lifecycle state');
  }
  const allowed = canonicalDraftFields(parsed.data,false);
  const permitted = new Set(['title','client','due_date','priority','notes','is_rd','rd_notes','badges']);
  if (Object.keys(allowed).some(k => !permitted.has(k))) {
    throw error(409,'Confirmed order logistics and delivery are edited through dedicated workflows');
  }
  if (!Object.keys(allowed).length) throw error(400,'No permitted fields supplied');
  const { data: updated, error: failed } = await locals.supabase.from('draft_orders')
    .update({ ...allowed, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('id',order.id).eq('status',order.status)
    .eq('updated_at',versioned.expectedUpdatedAt).select().maybeSingle();
  if (failed) throw error(503,'Order metadata update unavailable');
  if (!updated) throw error(409,'Order changed since it was opened. Reload first.');
  return json(updated, { headers: { 'Cache-Control': 'private, no-store' } });
};

/** Cancel, never physically delete, a draft with persisted attachments. */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');
  const { data: order, error: lookupError } = await locals.supabase.from('draft_orders')
    .select('id,created_by,status').eq('id',params.id).maybeSingle();
  if (lookupError) throw error(503, 'Order lookup unavailable');
  if (!order) throw error(404, 'Order not found');
  if (!canEditDraft(user.role,order.created_by,user.id,order.status)) throw error(403,'Draft owner or manager required');
  const { data: cancelled, error: cancelError } = await locals.supabase.from('draft_orders')
    .update({ status: 'CANCELLED', updated_by: user.id })
    .eq('id',order.id).eq('status',order.status).select('id,status').maybeSingle();
  if (cancelError) throw error(503,'Draft cancellation unavailable');
  if (!cancelled) throw error(409,'Order status changed. Reload first.');
  return json({ success:true, id:cancelled.id, status:cancelled.status });
};
