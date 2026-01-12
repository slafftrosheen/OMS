import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, transaction } from '$lib/server/db/connection';

/**
 * POST /api/draft-orders/[id]/approve - Approve a draft order
 */
export const POST: RequestHandler = async ({ params, locals }) => {
  const user = locals.user;
  
  if (!user || (user.role !== 'Admin' && user.role !== 'SuperAdmin')) {
    return json({ message: 'Admin access required' }, { status: 403 });
  }

  const idParam = params.id;

  try {
    const result = await transaction(async (client) => {
      // Check order exists and is draft - support both numeric ID and PO number
      const orderResult = await client.query(
        'SELECT * FROM draft_orders WHERE po_number = $1 OR id::text = $1',
        [idParam]
      );

      if (orderResult.rowCount === 0) {
        throw { status: 404, message: 'Order not found' };
      }

      const order = orderResult.rows[0];
      const orderId = order.id;
      
      if (order.status !== 'draft') {
        throw { status: 400, message: 'Only draft orders can be approved' };
      }

      // Update status to approved (moves to production)
      await client.query(
        `UPDATE draft_orders 
         SET status = 'approved', 
             approved_at = NOW(),
             approved_by = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [orderId, user.username]
      );

      // Create notification for SuperAdmin
      try {
        const superAdminResult = await client.query(
          `SELECT id FROM users WHERE roles->>'Admin' = 'SuperAdmin' AND is_active = true`
        );
        
        for (const admin of superAdminResult.rows) {
          await client.query(
            `INSERT INTO notifications (user_id, notification_type, title, message, link, source_type, source_id)
             VALUES ($1, 'order', 'Order Approved', $2, $3, 'order', $4)`,
            [
              admin.id,
              `Order ${order.po_number} has been approved and moved to production`,
              `/orders/${order.po_number}`,
              orderId.toString()
            ]
          );
        }
      } catch (notifErr) {
        console.warn('Failed to create notification:', notifErr);
      }

      // Log audit
      try {
        await client.query(
          `INSERT INTO audit_log (user_id, username, action, entity_type, entity_id, details)
           VALUES ($1, $2, 'APPROVE_ORDER', 'order', $3, $4)`,
          [user.id, user.username, orderId.toString(), JSON.stringify({ po_number: order.po_number })]
        );
      } catch (auditErr) {
        console.warn('Failed to log audit:', auditErr);
      }

      return { success: true, message: 'Order approved successfully', poNumber: order.po_number };
    });

    return json(result);
  } catch (err: any) {
    console.error('Error approving order:', err);
    return json(
      { message: err.message || 'Failed to approve order' },
      { status: err.status || 500 }
    );
  }
};
