import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const PRIVILEGED_ROLES = new Set(['RD', 'Boss', 'HeadOfProduction']);

/**
 * POST /api/draft-orders/[id]/reject - Reject (cancel) a draft order.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
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
    return json({ message: 'Privileged role required' }, { status: 403 });
  }

  const idParam = params.id;
  const body = await request.json().catch(() => ({}));
  const reason = body.reason || 'No reason provided';

  try {
    const { data: order, error: fetchError } = await locals.supabase
        .from('draft_orders')
        .select('*')
        .or(`id.eq.${idParam},po_number.eq.${idParam}`)
        .single();

    if (fetchError || !order) {
        return json({ message: 'Order not found' }, { status: 404 });
    }

    if (
      order.status !== 'draft' &&
      order.status !== 'DRAFT' &&
      order.status !== 'PENDING_REVIEW'
    ) {
        return json({ message: 'Only draft / pending-review orders can be rejected' }, { status: 400 });
    }

    const { error: updateError } = await locals.supabase
        .from('draft_orders')
        .update({
            status: 'CANCELLED',
            voided_reason: reason,
            voided_at: new Date().toISOString(),
            voided_by: actor.id,
            updated_by: actor.id,
        })
        .eq('id', order.id);

    if (updateError) throw updateError;

    // Notify the creator + privileged roles so they see the reason
    const { data: recipients } = await locals.supabase
        .from('profiles')
        .select('id, role')
        .or(`id.eq.${order.created_by ?? '00000000-0000-0000-0000-000000000000'},role.in.(RD,Boss,HeadOfProduction)`)
        .eq('is_active', true);

    const refLabel = order.po_number || 'draft order';
    const recipientRows = (recipients ?? [])
      .filter((r) => r.id !== actor.id)
      .map((r) => ({
          user_id: r.id,
          notification_type: 'order_cancelled',
          title: 'Order rejected',
          message: `${refLabel} was rejected: ${reason}`,
          link: `/orders/${order.id}`,
          source_type: 'order',
          source_id: order.id,
      }));
    if (recipientRows.length > 0) {
        await locals.supabase.from('notifications').insert(recipientRows);
    }

    // Audit Log
    await locals.supabase.from('audit_log').insert({
        user_id: actor.id,
        username: actor.username ?? actor.display_name ?? null,
        action: 'REJECT_ORDER',
        entity_type: 'order',
        entity_id: order.id,
        details: { po_number: order.po_number, reason }
    }).then(({ error }) => { if (error) console.error('audit_log insert failed:', error); });

    return json({ success: true, message: 'Order rejected' });

  } catch (err: any) {
    console.error('Error rejecting order:', err);
    return json(
      { message: err.message || 'Failed to reject order' },
      { status: err.status || 500 }
    );
  }
};
