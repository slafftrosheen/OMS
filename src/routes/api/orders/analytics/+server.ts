import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const { supabase } = locals;

  const timeframe = url.searchParams.get('timeframe') || '30d'; // 7d, 30d, 90d, 1y

  try {
    // Calculate date range
    let dateFrom = new Date();
    switch (timeframe) {
      case '7d':
        dateFrom.setDate(dateFrom.getDate() - 7);
        break;
      case '30d':
        dateFrom.setDate(dateFrom.getDate() - 30);
        break;
      case '90d':
        dateFrom.setDate(dateFrom.getDate() - 90);
        break;
      case '1y':
        dateFrom.setFullYear(dateFrom.getFullYear() - 1);
        break;
    }

    // Overall statistics
    const { data: stats } = await supabase
      .rpc('get_order_statistics', {
        p_date_from: dateFrom.toISOString().split('T')[0]
      });

    // Orders at risk
    const { data: atRisk } = await supabase
      .from('orders_at_risk')
      .select('*');

    // Station workload
    const stations = ['CAD', 'CNC', 'SANDING', 'BENDING', 'WELDING', 'PAINT', 'ASSEMBLY', 'QC', 'LOGISTICS'];
    const workloadPromises = stations.map(station =>
      supabase.rpc('get_station_workload', { p_station: station })
    );
    const workloadResults = await Promise.all(workloadPromises);
    const stationWorkload = stations.reduce((acc, station, idx) => {
      acc[station] = workloadResults[idx].data || [];
      return acc;
    }, {} as Record<string, any[]>);

    // Top rework stations
    const { data: topRework } = await supabase
      .from('rework_cycles')
      .select('station, count')
      .gte('created_at', dateFrom.toISOString())
      .order('count', { ascending: false })
      .limit(5);

    // Orders by status
    const { data: byStatus } = await supabase
      .from('orders')
      .select('status, count')
      .gte('created_at', dateFrom.toISOString());

    // Completion trend (orders completed per day)
    const { data: completionTrend } = await supabase
      .from('orders')
      .select('updated_at::date as date, count')
      .eq('status', 'completed')
      .gte('updated_at', dateFrom.toISOString())
      .order('date', { ascending: true });

    return json({
      timeframe,
      date_from: dateFrom.toISOString().split('T')[0],
      date_to: new Date().toISOString().split('T')[0],
      statistics: stats?.[0] || {},
      orders_at_risk: atRisk || [],
      station_workload: stationWorkload,
      top_rework_stations: topRework || [],
      orders_by_status: byStatus || [],
      completion_trend: completionTrend || []
    });
  } catch (err: any) {
    console.error('Analytics error:', err);
    throw error(500, 'Internal server error');
  }
};
