import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dateRangeForTimeframe, mapAnalyticsWorkload, STATION_WORKFLOW } from '$lib/server/api-contracts';

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!(await locals.getSession())) throw error(401, 'Unauthorized');
  const supabase = locals.supabase;
  const requested = url.searchParams.get('timeframe') || '30d';
  const timeframe = ['7d', '30d', '90d', '1y'].includes(requested) ? requested : '30d';
  const { from: fromDate, to: toDate } = dateRangeForTimeframe(timeframe);

  const [statsResult, atRiskResult, workloadResult, reworkResult, statusResult, completionResult] = await Promise.all([
    supabase.rpc('get_order_statistics', { p_from: fromDate, p_to: toDate }),
    supabase.from('orders_at_risk').select('*'),
    supabase.rpc('get_station_workload'),
    supabase.from('rework_cycles').select('station, created_at, cost_impact, time_impact').gte('created_at', `${fromDate}T00:00:00.000Z`).lt('created_at', `${toDate}T23:59:59.999Z`),
    supabase.from('draft_orders').select('status').gte('created_at', `${fromDate}T00:00:00.000Z`).lte('created_at', `${toDate}T23:59:59.999Z`),
    supabase.from('draft_orders').select('status, completed_at').gte('completed_at', `${fromDate}T00:00:00.000Z`).lte('completed_at', `${toDate}T23:59:59.999Z`)
  ]);

  const failures = [statsResult.error, atRiskResult.error, workloadResult.error, reworkResult.error, statusResult.error, completionResult.error].filter(Boolean);
  if (failures.length) {
    console.error('Analytics queries failed:', failures);
    throw error(500, 'Failed to load analytics');
  }

  const statusCounts: Record<string, number> = {};
  for (const row of statusResult.data ?? []) statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;

  const completionCounts: Record<string, number> = {};
  for (const row of completionResult.data ?? []) {
    if (!['COMPLETED', 'completed'].includes(row.status)) continue;
    const day = String(row.completed_at).slice(0, 10);
    completionCounts[day] = (completionCounts[day] ?? 0) + 1;
  }
  const completionTrend = Object.entries(completionCounts).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));

  const reworkByStation = new Map<string, number>();
  for (const row of reworkResult.data ?? []) reworkByStation.set(row.station, (reworkByStation.get(row.station) ?? 0) + 1);
  const topRework = [...reworkByStation.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([station, count]) => ({ station, count }));

  const stats = statsResult.data;
  return json({
    timeframe,
    date_from: fromDate,
    date_to: toDate,
    statistics: stats && typeof stats === 'object' ? stats : {},
    orders_at_risk: atRiskResult.data ?? [],
    station_workload: mapAnalyticsWorkload(workloadResult.data ?? [], STATION_WORKFLOW),
    top_rework_stations: topRework,
    orders_by_status: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
    completion_trend: completionTrend
  });
};
