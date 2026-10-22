import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canEditDraft } from '$lib/server/order/draft-contract';
import { splitVersionedOrderPayload } from '$lib/server/order/edit-version';

/**
 * GET /api/draft-orders/[id]/canvas-state
 * Returns the persisted tldraw snapshot for this order.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
    const { data, error: dbError } = await locals.supabase
        .from('draft_orders')
        .select('canvas_state')
        .or(`id.eq.${params.id},po_number.eq.${params.id}`)
        .single();

    if (dbError) throw error(404, 'Order not found');

    return json({ snapshot: data?.canvas_state ?? null });
};

/**
 * PUT /api/draft-orders/[id]/canvas-state
 * Persists the tldraw snapshot for this order.
 */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
    const user = locals.user;
    if (!user) throw error(401, 'Unauthorized');
    // Prevent oversized shared snapshots or embedding private discussion
    // messages into a public production drawing.
    const raw = await request.text();
    if (raw.length > 2_000_000) throw error(413, 'Canvas snapshot too large');
    let body: any;
    try { body = JSON.parse(raw); } catch { throw error(400, 'Invalid Canvas JSON'); }
    const versioned = splitVersionedOrderPayload(body);
    if (!versioned) throw error(428, 'Reload the order before saving Canvas: revision required');
    if (Object.keys(versioned.form).some(key => key !== 'snapshot') ||
        !Object.prototype.hasOwnProperty.call(versioned.form, 'snapshot')) {
      throw error(400, 'Only a Canvas snapshot may be updated here');
    }
    const snapshot = versioned.form.snapshot ?? null;
    if (snapshot !== null && (typeof snapshot !== 'object' || Array.isArray(snapshot))) {
      throw error(400, 'Canvas snapshot must be an object');
    }
    if (snapshot !== null && typeof snapshot === 'object' && ['conversation','conversations','messages','proposals'].some(k => k in snapshot)) {
      throw error(400, 'Private conversation data must not be placed in order Canvas snapshots');
    }

    const { data: order, error: findError } = await locals.supabase
        .from('draft_orders')
        .select('id,status,created_by')
        .or(`id.eq.${params.id},po_number.eq.${params.id}`)
        .single();

    if (findError || !order) throw error(404, 'Order not found');
    if (!canEditDraft(user.role, order.created_by, user.id, order.status)) {
      throw error(403, 'Only authorized editors can change an unconfirmed order Canvas');
    }

    // Same optimistic concurrency token as the native order/profile form PUT.
    // Do not overwrite a Canvas changed by another operator since GET.
    // Advance at least 1 ms even when two saves share the same system clock tick.
    const nextRevision = new Date(Math.max(
      Date.now(), Date.parse(versioned.expectedUpdatedAt) + 1
    )).toISOString();
    const { data: saved, error: updateError } = await locals.supabase
        .from('draft_orders')
        .update({ canvas_state: snapshot, updated_at: nextRevision, updated_by: user.id })
        .eq('id', order.id).eq('status', order.status)
        .eq('updated_at', versioned.expectedUpdatedAt)
        .select('id,updated_at').maybeSingle();

    if (!updateError && !saved) throw error(409,'Order changed while saving Canvas; reload before confirming');
    if (updateError) {
        console.error('Failed to persist canvas_state:', updateError);
        throw error(500, 'Failed to save canvas state');
    }

    return json({ ok: true, updatedAt: saved.updated_at },
      {headers:{'Cache-Control':'private, no-store'}});
};
