/**
 * Analytics API
 * Real-time metrics and KPIs
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseClient } from '$lib/server/supabase';

// GET /api/analytics - Get analytics data
export const GET: RequestHandler = async (event) => {
  const { url, locals } = event;
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const type = url.searchParams.get('type') || 'kpis';
  const period = url.searchParams.get('period') || '30'; // days
  const station = url.searchParams.get('station');

  try {
    let data: any = {};

    switch (type) {
      case 'kpis':
        data = await fetchKPIs(event);
        break;

      case 'trends':
        data = await fetchTrends(event, parseInt(period));
        break;

      case 'stations':
        data = await fetchStationMetrics(event, station);
        break;

      case 'loading':
        data = await fetchLoadingMetrics(event, parseInt(period));
        break;

      case 'clients':
        data = await fetchClientMetrics(event, parseInt(period));
        break;

      default:
        throw new Error('Invalid analytics type');
    }

    return json({ data });

  } catch (err) {
    console.error('[Analytics API] Error:', err);
    throw error(500, err instanceof Error ? err.message : 'Failed to fetch analytics');
  }
};

// Fetch real-time KPIs
async function fetchKPIs(event: any): Promise<any> {
  const supabase = createSupabaseClient(event);

  const { data, error: dbError } = await supabase
    .from('realtime_kpis')
    .select('*')
    .single();

  if (dbError) throw dbError;

  // Calculate derived metrics
  const kpis = data || {};

  return {
    orders: {
      total: kpis.total_orders || 0,
      active: kpis.active_orders || 0,
      today: kpis.orders_today || 0,
      thisWeek: kpis.orders_this_week || 0,
      thisMonth: kpis.orders_this_month || 0,
      completedToday: kpis.completed_today || 0,
      avgCompletionHours: kpis.avg_completion_hours_week || 0
    },
    stations: {
      activitiesToday: kpis.station_activities_today || 0,
      openIssues: kpis.open_issues || 0,
      qualityScore: kpis.avg_quality_score_week || 0
    },
    loading: {
      upcomingDays: kpis.upcoming_loading_days || 0,
      capacityUsed: kpis.upcoming_capacity_used || 0,
      capacityTotal: kpis.upcoming_capacity_total || 0,
      capacityPercentage: kpis.upcoming_capacity_total > 0
        ? Math.round((kpis.upcoming_capacity_used / kpis.upcoming_capacity_total) * 100)
        : 0
    },
    clients: {
      uniqueThisMonth: kpis.unique_clients_month || 0
    },
    activity: {
      photosToday: kpis.photos_uploaded_today || 0,
      activeUsersToday: kpis.active_users_today || 0
    }
  };
}

// Fetch order trends
async function fetchTrends(event: any, days: number): Promise<any> {
  const supabase = createSupabaseClient(event);
  const safeDays = Number.isFinite(days) ? Math.max(1, Math.min(84, Math.floor(days))) : 30;
  // The deployed order_trends view exposes week_start/status/order_count,
  // not date/total_orders/completed_orders. Aggregate status rows by week.
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - safeDays);
  const { data, error: dbError } = await supabase
    .from('order_trends')
    .select('week_start,status,order_count')
    .gte('week_start', since.toISOString().slice(0, 10))
    .order('week_start', { ascending: true })
    .limit(1000);
  if (dbError) throw dbError;
  const weeks = new Map<string, { total: number; completed: number; inProgress: number; draft: number; onHold: number }>();
  for (const row of data ?? []) {
    const key = String(row.week_start);
    const current = weeks.get(key) ?? { total: 0, completed: 0, inProgress: 0, draft: 0, onHold: 0 };
    const count = Number(row.order_count) || 0;
    current.total += count;
    if (row.status === 'completed') current.completed += count;
    else if (row.status === 'in-progress' || row.status === 'in_progress' || row.status === 'production') current.inProgress += count;
    else if (row.status === 'draft') current.draft += count;
    else if (row.status === 'on-hold' || row.status === 'on_hold') current.onHold += count;
    weeks.set(key, current);
  }
  const dates = [...weeks.keys()].sort();
  let previous = 0;
  return {
    dates,
    total: dates.map(d => weeks.get(d)!.total),
    completed: dates.map(d => weeks.get(d)!.completed),
    inProgress: dates.map(d => weeks.get(d)!.inProgress),
    draft: dates.map(d => weeks.get(d)!.draft),
    onHold: dates.map(d => weeks.get(d)!.onHold),
    dailyChange: dates.map(d => {
      const current = weeks.get(d)!.total;
      const change = current - previous;
      previous = current;
      return change;
    })
  };
}

// Fetch station metrics
async function fetchStationMetrics(event: any, station?: string | null): Promise<any> {
  const supabase = createSupabaseClient(event);

  let query = supabase
    .from('station_performance')
    .select('*')
    .order('total_orders_processed', { ascending: false });

  if (station) {
    query = query.eq('station', station);
  }

  const { data, error: dbError } = await query;

  if (dbError) throw dbError;

  return data || [];
}

// Fetch loading metrics
async function fetchLoadingMetrics(event: any, days: number): Promise<any> {
  const supabase = createSupabaseClient(event);

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);

  const { data, error: dbError } = await supabase
    .from('loading_capacity_overview')
    .select('*')
    .gte('date', startDate.toISOString().split('T')[0])
    .lte('date', endDate.toISOString().split('T')[0])
    .order('date', { ascending: true });

  if (dbError) throw dbError;

  return {
    dates: data?.map(d => d.date) || [],
    capacity: data?.map(d => d.current_capacity) || [],
    maxCapacity: data?.map(d => d.max_capacity) || [],
    orderCount: data?.map(d => d.order_count) || [],
    status: data?.map(d => d.capacity_status) || []
  };
}

// Fetch client metrics
async function fetchClientMetrics(event: any, days: number): Promise<any> {
  const supabase = createSupabaseClient(event);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error: dbError } = await supabase
    .from('draft_orders')
    .select('client, status, created_at')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false });

  if (dbError) throw dbError;

  // Group by client
  const clientGroups: Record<string, any> = {};

  data?.forEach(order => {
    if (!order.client) return;

    if (!clientGroups[order.client]) {
      clientGroups[order.client] = {
        name: order.client,
        totalOrders: 0,
        completed: 0,
        inProgress: 0,
        draft: 0
      };
    }

    clientGroups[order.client].totalOrders++;

    if (order.status === 'completed') clientGroups[order.client].completed++;
    else if (order.status === 'in-progress') clientGroups[order.client].inProgress++;
    else if (order.status === 'draft') clientGroups[order.client].draft++;
  });

  return Object.values(clientGroups)
    .sort((a, b) => b.totalOrders - a.totalOrders)
    .slice(0, 10); // Top 10 clients
}