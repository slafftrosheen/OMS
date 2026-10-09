import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ACTIVE_ORDER_STATUSES } from '$lib/server/contracts/oms-r01';
import { isKnownStation } from '$lib/order/workflow';
import { compareStationOrders } from '$lib/order/operator-ui';

// Two explicit queries avoid PostgREST trying to infer an FK to the orders VIEW.
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  const station = params.station.toUpperCase();
  if (!isKnownStation(station)) throw error(400, 'Unknown station');
  const db = locals.supabase;
  const { data: stages, error: stageError } = await db
    .from('order_stages')
    .select('id, draft_order_id, station, state, started_at, blocked_reason, estimated_hours, actual_hours, notes')
    .eq('station', station)
    .neq('state', 'COMPLETED');
  if (stageError) {
    console.error('[Station Orders] Stage query failed:', stageError);
    throw error(500, 'Failed to load station stages');
  }
  const orderIds = [...new Set((stages ?? []).map(s => s.draft_order_id).filter(Boolean))];
  if (!orderIds.length) return json([]);
  const { data: orderRows, error: orderError } = await db.from('draft_orders')
    .select('id, po_number, title, client, due_date, priority, status, badges')
    .in('id', orderIds)
    .in('status', [...ACTIVE_ORDER_STATUSES]);
  if (orderError) {
    console.error('[Station Orders] Order query failed:', orderError);
    throw error(500, 'Failed to load station orders');
  }
  const ordersById = new Map((orderRows ?? []).map(o => [o.id, o]));
  const result = (stages ?? []).flatMap(stage => {
    const order = ordersById.get(stage.draft_order_id);
    if (!order) return [];
    return [{
      ...order,
      badges: order.badges ?? [],
      stage: {
        id: stage.id, state: stage.state, started_at: stage.started_at,
        blocked_reason: stage.blocked_reason, estimated_hours: stage.estimated_hours,
        actual_hours: stage.actual_hours, notes: stage.notes
      }
    }];
  });
  result.sort(compareStationOrders);
  return json(result);
};
