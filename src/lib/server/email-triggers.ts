/**
 * Email Trigger Functions
 * Automatically send notifications on specific events
 */

import { supabase } from './supabase';

export class EmailTriggers {
  /**
   * Trigger order created notification
   */
  static async onOrderCreated(orderId: string): Promise<void> {
    try {
      await supabase.rpc('send_order_notification', {
        p_order_id: orderId,
        p_notification_type: 'created'
      });
    } catch (error) {
      console.error('[Email Triggers] Order created error:', error);
    }
  }

  /**
   * Trigger order assigned notification
   */
  static async onOrderAssigned(orderId: string): Promise<void> {
    try {
      await supabase.rpc('send_order_notification', {
        p_order_id: orderId,
        p_notification_type: 'assigned'
      });
    } catch (error) {
      console.error('[Email Triggers] Order assigned error:', error);
    }
  }

  /**
   * Trigger order updated notification
   */
  static async onOrderUpdated(orderId: string): Promise<void> {
    try {
      await supabase.rpc('send_order_notification', {
        p_order_id: orderId,
        p_notification_type: 'updated'
      });
    } catch (error) {
      console.error('[Email Triggers] Order updated error:', error);
    }
  }

  /**
   * Trigger station issue notification
   */
  static async onStationIssue(logId: string): Promise<void> {
    try {
      // Get log details
      const { data: log, error } = await supabase
        .from('station_logs')
        .select(`
          *,
          order:draft_orders(id, po_number, title, assignees)
        `)
        .eq('id', logId)
        .single();

      if (error || !log) return;

      // Queue emails for assignees
      const variables = {
        station: log.station,
        order_po: log.order.po_number,
        message: log.message,
        severity: log.issue_severity || 'medium',
        order_url: `https://app.example.com/orders/${log.order.id}`
      };

      for (const assigneeId of log.order.assignees || []) {
        const { data: user } = await supabase
          .from('auth.users')
          .select('email')
          .eq('id', assigneeId)
          .single();

        if (user) {
          await supabase.rpc('queue_email', {
            p_recipient_email: user.email,
            p_recipient_user_id: assigneeId,
            p_template_key: 'station_issue',
            p_variables: variables,
            p_priority: log.issue_severity === 'critical' ? 'urgent' : 'high'
          });
        }
      }

    } catch (error) {
      console.error('[Email Triggers] Station issue error:', error);
    }
  }

  /**
   * Trigger loading day full notification
   */
  static async onLoadingDayFull(loadingDayId: string): Promise<void> {
    try {
      const { data: loadingDay, error } = await supabase
        .from('loading_days')
        .select('*')
        .eq('id', loadingDayId)
        .single();

      if (error || !loadingDay) return;

      const variables = {
        date: loadingDay.date,
        current_capacity: loadingDay.current_capacity,
        max_capacity: loadingDay.max_capacity
      };

      // Send to all managers/admins
      // NOTE: the real table is `profiles` (PK = auth user id), with a `role`
      // text column. `user_profiles` does not exist.
      const { data: managers } = await supabase
        .from('profiles')
        .select('id, email')
        .in('role', ['admin', 'manager']);

      if (managers) {
        type ManagerRow = { id?: string; email?: string | null };
        for (const m of managers as unknown as ManagerRow[]) {
          const email = m.email;
          if (!email) continue;
          await supabase.rpc('queue_email', {
            p_recipient_email: email,
            p_recipient_user_id: m.id,
            p_template_key: 'loading_day_full',
            p_variables: variables,
            p_priority: 'high'
          });
        }
      }

    } catch (error) {
      console.error('[Email Triggers] Loading day full error:', error);
    }
  }
}