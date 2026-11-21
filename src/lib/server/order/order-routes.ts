import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderRouteStage } from '$lib/order/types';

const ROUTE_BATCH_SIZE = 40;

export async function readOrderRoutes(
  supabase: SupabaseClient,
  orderIds: readonly string[]
): Promise<Map<string, OrderRouteStage[]> | null> {
  const batches: string[][] = [];
  for (let start = 0; start < orderIds.length; start += ROUTE_BATCH_SIZE) {
    batches.push(orderIds.slice(start, start + ROUTE_BATCH_SIZE));
  }

  const results = await Promise.all(batches.map(ids => supabase.from('order_stages')
    .select('draft_order_id, station, state')
    .in('draft_order_id', ids)));

  const routes = new Map<string, OrderRouteStage[]>();
  for (const { data, error } of results) {
    if (error) {
      console.error('[Orders] Route lookup failed:', error.code);
      return null;
    }
    for (const { draft_order_id, station, state } of data ?? []) {
      if (typeof station !== 'string' || typeof state !== 'string') continue;
      const route = routes.get(draft_order_id) ?? [];
      route.push({ station, state });
      routes.set(draft_order_id, route);
    }
  }

  return routes;
}
