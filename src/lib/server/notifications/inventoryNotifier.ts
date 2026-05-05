// src/lib/server/notifications/inventoryNotifier.ts
//
// Two notification fan-outs related to station completions:
//   - notifyConsumptionSkipped: HoP/Boss/RD when an operator marks a
//     stage complete without declaring any materials.
//   - notifyLowStock: HoP/Boss/RD when post-deduction stock dips below
//     the configured `min_stock` threshold.
//
// Best-effort. Failures are logged, not raised.

import type { SupabaseClient } from '@supabase/supabase-js';

type Sb = SupabaseClient<any, any, any>;
const RECIPIENT_ROLES = ['HeadOfProduction', 'Boss', 'RD'] as const;

async function fanOut(
  supabase: Sb,
  rows: Array<{ user_id: string; notification_type: string; title: string; message: string; link: string; source_type: string; source_id: string }>,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('notifications').insert(rows);
  if (error) console.error('inventoryNotifier insert failed:', error);
}

async function recipients(supabase: Sb, exclude: string | null): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .in('role', RECIPIENT_ROLES as unknown as string[])
    .eq('is_active', true);
  return (data ?? []).map((r) => r.id).filter((id) => id !== exclude);
}

interface ConsumptionSkippedPayload {
  orderId: string;
  poOrRef: string;
  station: string;
  actorId: string;
  reason?: string | null;
}

export async function notifyConsumptionSkipped(
  supabase: Sb,
  payload: ConsumptionSkippedPayload,
): Promise<void> {
  const ids = await recipients(supabase, payload.actorId);
  const reasonNote = payload.reason ? ` (${payload.reason})` : '';
  const rows = ids.map((uid) => ({
    user_id: uid,
    notification_type: 'consumption_skipped',
    title: 'Stage completed without material consumption',
    message: `${payload.station} marked ${payload.poOrRef} complete without declaring stock${reasonNote}`,
    link: `/orders/${payload.orderId}?tab=consumption`,
    source_type: 'order',
    source_id: payload.orderId,
  }));
  await fanOut(supabase, rows);
}

interface LowStockPayload {
  orderId: string;
  poOrRef: string;
  actorId: string;
  hits: Array<{ item_id: string; sku: string; name: string; stock: number; min_stock: number }>;
}

export async function notifyLowStock(
  supabase: Sb,
  payload: LowStockPayload,
): Promise<void> {
  if (!payload.hits || payload.hits.length === 0) return;
  const ids = await recipients(supabase, payload.actorId);
  const rows = ids.flatMap((uid) =>
    payload.hits.map((hit) => ({
      user_id: uid,
      notification_type: 'low_stock',
      title: `Low stock: ${hit.sku || hit.name}`,
      message: `${hit.name} at ${hit.stock} (min ${hit.min_stock}) after ${payload.poOrRef}`,
      link: `/inventory?sku=${encodeURIComponent(hit.sku ?? '')}`,
      source_type: 'inventory',
      source_id: hit.item_id,
    })),
  );
  await fanOut(supabase, rows);
}
