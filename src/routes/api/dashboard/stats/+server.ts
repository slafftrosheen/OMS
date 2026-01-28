// src/routes/api/dashboard/stats/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
  try {
    if (!locals.supabase) {
      return json({
        totalOrders: 0,
        activeOrders: 0,
        completedOrders: 0,
        draftOrders: 0,
        urgentOrders: 0,
        recentActivity: [],
        error: 'Database not available'
      }, { status: 503 });
    }

    // Fetch all stats in parallel
    const [ordersResult, draftsResult, completedResult, recentResult] = await Promise.allSettled([
      locals.supabase.from('draft_orders').select('*', { count: 'exact', head: true }),
      locals.supabase.from('draft_orders').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
      locals.supabase.from('draft_orders').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      locals.supabase.from('draft_orders').select('id, po_number, client, status, updated_at').order('updated_at', { ascending: false }).limit(10)
    ]);

    // Extract counts with fallbacks
    const totalOrders = ordersResult.status === 'fulfilled' ? (ordersResult.value.count || 0) : 0;
    const draftOrders = draftsResult.status === 'fulfilled' ? (draftsResult.value.count || 0) : 0;
    const completedOrders = completedResult.status === 'fulfilled' ? (completedResult.value.count || 0) : 0;
    const activeOrders = totalOrders - draftOrders;

    // Extract recent activity safely
    const recentActivity = recentResult.status === 'fulfilled' && Array.isArray(recentResult.value.data) 
      ? recentResult.value.data 
      : [];

    // Calculate urgent orders (due within 3 days)
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    
    const urgentResult = await locals.supabase
      .from('draft_orders')
      .select('*', { count: 'exact', head: true })
      .lte('due_date', threeDaysFromNow.toISOString())
      .gte('due_date', new Date().toISOString())
      .neq('status', 'completed');

    const urgentOrders = urgentResult.count || 0;

    return json({
      totalOrders,
      activeOrders,
      completedOrders,
      draftOrders,
      urgentOrders,
      recentActivity: recentActivity.map(item => ({
        id: item.id,
        poNumber: item.po_number,
        client: item.client,
        status: item.status,
        updatedAt: item.updated_at
      }))
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    return json({
      totalOrders: 0,
      activeOrders: 0,
      completedOrders: 0,
      draftOrders: 0,
      urgentOrders: 0,
      recentActivity: [],
      error: 'Failed to fetch statistics'
    }, { status: 500 });
  }
};