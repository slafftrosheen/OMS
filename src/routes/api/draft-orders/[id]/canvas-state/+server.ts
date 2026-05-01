import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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
    const body = await request.json();
    const snapshot = body?.snapshot ?? null;

    const { data: order, error: findError } = await locals.supabase
        .from('draft_orders')
        .select('id')
        .or(`id.eq.${params.id},po_number.eq.${params.id}`)
        .single();

    if (findError || !order) throw error(404, 'Order not found');

    const { error: updateError } = await locals.supabase
        .from('draft_orders')
        .update({ canvas_state: snapshot, updated_at: new Date().toISOString() })
        .eq('id', order.id);

    if (updateError) {
        console.error('Failed to persist canvas_state:', updateError);
        throw error(500, 'Failed to save canvas state');
    }

    return json({ ok: true });
};
