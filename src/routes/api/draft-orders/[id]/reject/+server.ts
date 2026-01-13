import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST /api/draft-orders/[id]/reject - Reject a draft order
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = locals.user;
  
  if (!user || (user.roles?.Admin !== 'Admin' && user.roles?.Admin !== 'SuperAdmin')) {
    return json({ message: 'Admin access required' }, { status: 403 });
  }

  const idParam = params.id;
  const body = await request.json();
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

    if (order.status !== 'draft') {
        return json({ message: 'Only draft orders can be rejected' }, { status: 400 });
    }

    const { error: updateError } = await locals.supabase
        .from('draft_orders')
        .update({
            status: 'rejected',
            rejection_reason: reason,
            rejected_at: new Date().toISOString(),
            rejected_by: user.username,
            updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

    if (updateError) throw updateError;

    // Notify SuperAdmins
    const { data: superAdmins } = await locals.supabase
        .from('profiles')
        .select('id')
        .eq('roles->>Admin', 'SuperAdmin')
        .eq('is_active', true);

    if (superAdmins && superAdmins.length > 0) {
        const notifications = superAdmins.map(admin => ({
            user_id: admin.id,
            notification_type: 'order',
            title: 'Order Rejected',
            message: `Order ${order.po_number} was rejected: ${reason}`,
            link: `/orders/${order.po_number}/edit`,
            source_type: 'order',
            source_id: order.id
        }));

        await locals.supabase.from('notifications').insert(notifications);
    }

    // Audit Log
    await locals.supabase.from('audit_log').insert({
        user_id: user.id,
        username: user.username,
        action: 'REJECT_ORDER',
        entity_type: 'order',
        entity_id: order.id,
        details: { po_number: order.po_number, reason }
    });

    return json({ success: true, message: 'Order rejected' });

  } catch (err: any) {
    console.error('Error rejecting order:', err);
    return json(
      { message: err.message || 'Failed to reject order' },
      { status: err.status || 500 }
    );
  }
};
