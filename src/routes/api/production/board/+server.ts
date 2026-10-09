import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ALL_STATIONS } from '$lib/order/workflow';
import { ACTIVE_ORDER_STATUSES } from '$lib/server/contracts/oms-r01';

export const GET: RequestHandler = async ({ locals }) => {
    const session = await locals.getSession();
    if (!session) throw error(401, 'Unauthorized');

    try {
        const { data: orders, error: fetchError } = await locals.supabase
            .from('ordersummary')
            .select('*')
            .in('status', [...ACTIVE_ORDER_STATUSES])
            .order('priority', { ascending: false })
            .order('due_date', { ascending: true });

        if (fetchError) {
            console.error('Error fetching production board data:', fetchError);
            throw error(500, 'Failed to fetch production data');
        }

        // Fetch the actual station-stage state; ordersummary.status is an
        // order lifecycle state, never a selectable station-stage state.
        const orderIds = (orders ?? []).map(o => o.id);
        const { data: stageRows, error: stagesError } = orderIds.length
            ? await locals.supabase.from('order_stages')
                .select('draft_order_id,station,state')
                .in('draft_order_id', orderIds)
            : { data: [], error: null };
        if (stagesError) {
            console.error('[Production Board] Stage lookup failed', stagesError);
            throw error(500, 'Failed to load station states');
        }
        const stageStateByKey = new Map((stageRows ?? []).map(s => [s.draft_order_id + ':' + s.station, s.state]));

        const STATIONS = ALL_STATIONS;

        // Group orders by station
        const stations: Record<string, any[]> = {};
        STATIONS.forEach(s => stations[s] = []);

        if (orders) {
            orders.forEach(order => {
                const station = order.current_station;
                if (station && STATIONS.includes(station)) {
                    stations[station].push({
                        id: order.id,
                        poNumber: order.po_number,
                        client: order.client,
                        title: order.title,
                        dueDate: order.due_date,
                        priority: (order.priority || 'normal').toLowerCase(),
                        status: order.status,
                        stageState: stageStateByKey.get(order.id + ':' + station) ?? 'NOT_STARTED',
                        progress: order.progress_percentage
                    });
                }
            });
        }

        return json({
            success: true,
            stations
        });
    } catch (err: any) {
        if (err.status) throw err;
        console.error('Unexpected error in production board API:', err);
        throw error(500, 'Internal Server Error');
    }
};
