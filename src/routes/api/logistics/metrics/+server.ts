import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ORDER_METRIC_FIELDS, readMetricRows, logisticsMetrics, shopDate } from '$lib/server/analytics/order-metrics';
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) throw error(401,'Unauthorized');
  try {
    const now=new Date();
    const orders=await readMetricRows(locals.supabase,'draft_orders',ORDER_METRIC_FIELDS);
    const end=new Date(now.getTime()+7*86400000);
    const capacities=await readMetricRows(locals.supabase,'loading_capacity_overview','*',q=>q.gte('date',shopDate(now)).lt('date',shopDate(end)));
    return json(logisticsMetrics(orders,capacities,now),{headers:{'Cache-Control':'private, no-store'}});
  } catch { throw error(503,'Logistics metrics unavailable'); }
};
