// src/lib/server/notifications/orderNotifier.ts
//
// Server-side notification fan-out for the order lifecycle. The
// `notifications` table powers the bell in the topbar; inserting rows
// here is enough for the existing realtime subscription on the client
// to surface the message.
//
// All helpers are best-effort: failures are logged by the caller, not
// raised, so a flaky notify path can't break the lifecycle transition.

import type { SupabaseClient } from '@supabase/supabase-js';

type Sb = SupabaseClient<any, any, any>;

const RECIPIENT_ROLES_FOR_DRAFT = ['HeadOfProduction', 'Boss', 'RD'] as const;

interface DraftCreatedPayload {
  orderId: string;
  internalRef: string | null;
  client: string;
  createdById: string;
}

/**
 * Notify HeadOfProduction / Boss / RD when a new draft order enters
 * the review queue. Excludes the creator so they don't get a self-ping.
 */
export async function notifyDraftCreated(
  supabase: Sb,
  payload: DraftCreatedPayload
): Promise<void> {
  const { orderId, internalRef, client, createdById } = payload;

  const { data: recipients, error } = await supabase
    .from('profiles')
    .select('id')
    .in('role', RECIPIENT_ROLES_FOR_DRAFT as unknown as string[])
    .eq('is_active', true);

  if (error) {
    console.error('orderNotifier.notifyDraftCreated lookup failed:', error);
    return;
  }
  if (!recipients || recipients.length === 0) return;

  const ref = internalRef ?? orderId.slice(0, 8);
  const rows = recipients
    .filter((r) => r.id !== createdById)
    .map((r) => ({
      user_id: r.id,
      notification_type: 'order_pending_review',
      title: 'New draft order',
      message: `${ref} for ${client} is awaiting review`,
      link: `/orders/${orderId}`,
      source_type: 'order',
      source_id: orderId,
    }));

  if (rows.length === 0) return;

  const { error: insertErr } = await supabase.from('notifications').insert(rows);
  if (insertErr) {
    console.error('orderNotifier.notifyDraftCreated insert failed:', insertErr);
  }
}

interface OrderConfirmedPayload {
  orderId: string;
  poNumber: string;
  client: string;
  createdById: string | null;
  confirmedById: string;
}

/**
 * Notify the creator (and any assignees) once the draft has been
 * confirmed and a PO number assigned.
 */
export async function notifyOrderConfirmed(
  supabase: Sb,
  payload: OrderConfirmedPayload
): Promise<void> {
  const { orderId, poNumber, client, createdById, confirmedById } = payload;

  const recipientIds = new Set<string>();
  if (createdById && createdById !== confirmedById) recipientIds.add(createdById);

  const { data: assignees } = await supabase
    .from('order_assignees')
    .select('assignee_id')
    .eq('draft_order_id', orderId);
  for (const a of assignees ?? []) {
    if (a.assignee_id && a.assignee_id !== confirmedById) {
      recipientIds.add(a.assignee_id);
    }
  }

  if (recipientIds.size === 0) return;

  const rows = Array.from(recipientIds).map((uid) => ({
    user_id: uid,
    notification_type: 'order_confirmed',
    title: `Order ${poNumber} confirmed`,
    message: `${client} – ready for production`,
    link: `/orders/${orderId}`,
    source_type: 'order',
    source_id: orderId,
  }));

  const { error } = await supabase.from('notifications').insert(rows);
  if (error) {
    console.error('orderNotifier.notifyOrderConfirmed insert failed:', error);
  }
}
