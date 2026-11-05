import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dateRangeForTimeframe } from '$lib/server/api-contracts';
import { ALL_STATIONS } from '$lib/order/workflow';
import { ORDER_METRIC_FIELDS, readMetricRows, summarizeOrders, dailyOrderTrends, shopDate } from '$lib/server/analytics/order-metrics';

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) throw error(401,'Unauthorized');
  const requested=url.searchParams.get('timeframe') || '30d';
  if (!['7d','30d','90d','1y'].includes(requested)) throw error(400,'Invalid timeframe');
  const now=new Date(), {from,to}=dateRangeForTimeframe(requested,now);
  const db=locals.supabase;
  try {
    const allOrders=await readMetricRows(db,'draft_orders',`${ORDER_METRIC_FIELDS},po_number,title,priority`);
    const orders=allOrders.filter(row=>row.status!=='CANCELLED');
    const period=orders.filter(row=>row.created_at && shopDate(row.created_at)>=from && shopDate(row.created_at)<=to);
    const stats=summarizeOrders(period,now);
    const live=new Set(orders.filter(row=>['CONFIRMED','IN_PRODUCTION','READY_TO_LOAD'].includes(row.status)).map(row=>row.id));
    const stages=await readMetricRows(db,'order_stages','id,draft_order_id,station,state');
    const rework=await readMetricRows(db,'rework_cycles','id,order_id,station,created_at',q=>q.gte('created_at',`${from}T00:00:00Z`).lte('created_at',`${to}T23:59:59.999Z`));
    const validIds=new Set(orders.map(row=>row.id));
    const reworkCounts=new Map<string,number>();
    for (const row of rework.filter(row=>validIds.has(row.order_id))) reworkCounts.set(row.station,(reworkCounts.get(row.station)??0)+1);
    const statuses=new Map<string,number>();
    for (const row of period) statuses.set(row.status,(statuses.get(row.status)??0)+1);
    const countDays=Math.ceil((Date.parse(to)-Date.parse(from))/86400000)+1;
    const trend=dailyOrderTrends(orders,countDays,now);
    return json({timeframe:requested,date_from:from,date_to:to,
      statistics:{total_orders:stats.total,active_orders:stats.active,completed_orders:stats.completed,
        avg_completion_days:stats.avgCompletionHours/24,total_rework:rework.filter(row=>validIds.has(row.order_id)).length},
      orders_at_risk:orders.filter(row=>live.has(row.id) && row.due_date && row.due_date<shopDate(now))
        .map(row=>({...row,risk_level:'overdue',days_to_due:Math.floor((Date.parse(row.due_date)-Date.parse(shopDate(now)))/86400000)})),
      station_workload:Object.fromEntries(ALL_STATIONS.map(station=>[station,['QUEUED','IN_PROGRESS','BLOCKED','REWORK'].map(status=>({
        status,count:stages.filter(row=>row.station===station && row.state===status && live.has(row.draft_order_id)).length
      }))])),
      top_rework_stations:[...reworkCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([station,count])=>({station,count})),
      orders_by_status:[...statuses.entries()].map(([status,count])=>({status,count})),
      completion_trend:trend.dates.map((date,i)=>({date,count:trend.completed[i]}))
    },{headers:{'Cache-Control':'private, no-store'}});
  } catch { throw error(503,'Analytics data unavailable'); }
};
