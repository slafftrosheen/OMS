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
