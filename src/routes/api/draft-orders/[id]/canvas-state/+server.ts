import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canEditDraft } from '$lib/server/order/draft-contract';

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
    const snapshot = body?.snapshot ?? null;
    if (snapshot !== null && (typeof snapshot !== 'object' || Array.isArray(snapshot))) {
      throw error(400, 'Canvas snapshot must be an object');
    }
    if (snapshot && ['conversation','conversations','messages','proposals'].some(k => k in snapshot)) {
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

    const { error: updateError } = await locals.supabase
        .from('draft_orders')
        .update({ canvas_state: snapshot, updated_at: new Date().toISOString() })
        .eq('id', order.id).eq('status',order.status);

    if (updateError) {
        console.error('Failed to persist canvas_state:', updateError);
        throw error(500, 'Failed to save canvas state');
    }

    return json({ ok: true });
};
