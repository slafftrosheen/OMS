import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Workflow stages for a production order — must match the rooms seeded in
 * 20260501000001_chat_rooms.sql (so approve can post the routing message).
 */
const WORKFLOW_STAGES = ['CAD', 'CNC', 'EDGE', 'ASSEMBLY', 'PAINT', 'PACKAGING', 'DELIVERY'] as const;

/**
 * POST /api/draft-orders/[id]/approve - Approve a draft order, route it to the
 * production pipeline by creating order_stages rows and queuing the first stage.
 */
export const POST: RequestHandler = async ({ params, locals }) => {
  const user = locals.user;

  if (!user || (user.roles?.Admin !== 'Admin' && user.roles?.Admin !== 'SuperAdmin')) {
    return json({ message: 'Admin access required' }, { status: 403 });
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

    if (order.status !== 'draft') {
        return json({ message: 'Only draft orders can be approved' }, { status: 400 });
    }

    // 1. Flip the draft to approved
    const { error: updateError } = await locals.supabase
        .from('draft_orders')
        .update({
            status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: user.username,
            updated_at: new Date().toISOString()
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

    // 3. Audit
    await locals.supabase.from('audit_log').insert({
        user_id: user.id,
        username: user.username,
        action: 'APPROVE_ORDER',
        entity_type: 'order',
        entity_id: order.id,
        details: { po_number: order.po_number, first_stage: WORKFLOW_STAGES[0] }
    });

    // 4. Post a station-room message announcing the new order at the first stage
    try {
        await locals.supabase.from('chat_messages').insert({
            room_id: `station-${WORKFLOW_STAGES[0].toLowerCase()}`,
            user_id: null,
            content: `Order ${order.po_number} approved by ${user.username} — queued for ${WORKFLOW_STAGES[0]}`,
            text: `Order ${order.po_number} approved by ${user.username} — queued for ${WORKFLOW_STAGES[0]}`,
        });
    } catch (chatErr) {
        console.warn('Failed to post station-room message:', chatErr);
    }

    // 5. Notify SuperAdmins
    const { data: superAdmins } = await locals.supabase
        .from('profiles')
        .select('id')
        .eq('roles->>Admin', 'SuperAdmin')
        .eq('is_active', true);

    if (superAdmins && superAdmins.length > 0) {
        const notifications = superAdmins.map(admin => ({
            user_id: admin.id,
            notification_type: 'order',
            title: 'Order Approved',
            message: `Order ${order.po_number} queued for ${WORKFLOW_STAGES[0]}`,
            link: `/orders/${order.po_number}`,
            source_type: 'order',
            source_id: order.id
        }));

        await locals.supabase.from('notifications').insert(notifications);
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
