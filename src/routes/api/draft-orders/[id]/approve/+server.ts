import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { postStationMessage } from '$lib/server/chat/stationMessenger';

/**
 * Workflow stages for a production order — must match the rooms seeded in
 * 20260501000001_chat_rooms.sql (so approve can post the routing message).
 */
const WORKFLOW_STAGES = ['CAD', 'CNC', 'EDGE', 'ASSEMBLY', 'PAINT', 'PACKAGING', 'DELIVERY'] as const;
const PRIVILEGED_ROLES = new Set(['RD', 'Boss', 'HeadOfProduction']);

/**
 * POST /api/draft-orders/[id]/approve - Legacy approval endpoint. The
 * canonical confirmation path is /api/draft-orders/[id]/confirm (which
 * also accepts a Boss-supplied PO). This endpoint is kept for the older
 * UI buttons and only succeeds if the row already has a po_number.
 */
export const POST: RequestHandler = async ({ params, locals }) => {
  const session = await locals.getSession();
  if (!session) {
    return json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data: actor } = await locals.supabase
    .from('profiles')
    .select('id, role, display_name, username')
    .eq('id', session.user.id)
    .single();

  if (!actor || !PRIVILEGED_ROLES.has(actor.role)) {
    return json({ message: 'Privileged role required (RD / Boss / HeadOfProduction)' }, { status: 403 });
  }

  const idParam = params.id;

  try {
    const { data: order, error: fetchError } = await locals.supabase
        .from('draft_orders')
        .select('*')
        .or(`id.eq.${idParam},po_number.eq.${idParam}`)
        .single();

    if (fetchError || !order) {
        return json({ message: 'Order not found' }, { status: 404 });
    }

    if (order.status !== 'draft' && order.status !== 'DRAFT' && order.status !== 'PENDING_REVIEW') {
        return json({ message: 'Only draft / pending-review orders can be approved' }, { status: 400 });
    }

    if (!order.po_number) {
        return json({
          message: 'PO number must be assigned before approval. Use /confirm to set the PO.',
        }, { status: 400 });
    }

    // 1. Flip the draft to CONFIRMED (canonical state)
    const { error: updateError } = await locals.supabase
        .from('draft_orders')
        .update({
            status: 'CONFIRMED',
            confirmed_at: new Date().toISOString(),
            confirmed_by: actor.id,
            updated_by: actor.id,
        })
        .eq('id', order.id);

    if (updateError) throw updateError;

    // 2. Initialize the production pipeline: one order_stages row per workflow
    //    stage, first stage is QUEUED, rest NOT_STARTED. Idempotent via upsert
    //    so re-approval (after rejection) does not crash.
    const stageRows = WORKFLOW_STAGES.map((station, idx) => ({
        draft_order_id: order.id,
        station,
        state: idx === 0 ? 'QUEUED' : 'NOT_STARTED',
    }));

    const { error: stagesError } = await locals.supabase
        .from('order_stages')
        .upsert(stageRows, { onConflict: 'draft_order_id,station' });

    if (stagesError) {
        // Surface but don't block approval — log to audit instead
        console.error('Failed to initialize order_stages:', stagesError);
    }

    // 3. Audit (best-effort)
    await locals.supabase.from('audit_log').insert({
        user_id: actor.id,
        username: actor.username ?? actor.display_name ?? null,
        action: 'APPROVE_ORDER',
        entity_type: 'order',
        entity_id: order.id,
        details: { po_number: order.po_number, first_stage: WORKFLOW_STAGES[0] }
    }).then(({ error }) => { if (error) console.error('audit_log insert failed:', error); });

    // 4. Post a station-room message announcing the new order at the first stage
    try {
      await postStationMessage(locals.supabase, {
          station: WORKFLOW_STAGES[0],
          poNumber: order.po_number,
          state: 'QUEUED',
          actorName: actor.display_name || actor.username || 'system',
      });
    } catch (err) {
      console.error('postStationMessage failed:', err);
    }

    return json({
        success: true,
        message: 'Order approved successfully',
        poNumber: order.po_number,
        firstStage: WORKFLOW_STAGES[0],
    });

  } catch (err: any) {
    console.error('Error approving order:', err);
    return json(
      { message: err.message || 'Failed to approve order' },
      { status: err.status || 500 }
    );
  }
};
