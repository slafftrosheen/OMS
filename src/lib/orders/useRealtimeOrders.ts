// src/lib/orders/useRealtimeOrders.ts
import { writable, derived } from 'svelte/store';
import { realtimeManager, type RealtimeMessage } from '$lib/stores/realtime';
import type { Order } from '$lib/order/types'; // Adapted path

export function useRealtimeOrders(supabase: any) {
    // Initialize realtime manager
    realtimeManager.initialize(supabase);

    // Subscribe to order changes
    // Using 'draft_orders' as identified in the schema analysis
    const orderUpdates = realtimeManager.subscribe<Order>({
        channel: 'orders-channel',
        schema: 'public',
        table: 'draft_orders',
        event: '*' // Listen to all events (INSERT, UPDATE, DELETE)
    });

    // Transform updates into actionable data
    const processedOrders = derived(orderUpdates, $updates => {
        const latest: Record<string, Order> = {};

        $updates.forEach(update => {
            const orderId = update.new?.id || update.old?.id;
            if (!orderId) return;

            switch (update.type) {
                case 'INSERT':
                case 'UPDATE':
                    latest[orderId] = update.new;
                    break;
                case 'DELETE':
                    delete latest[orderId];
                    break;
            }
        });

        return Object.values(latest);
    });

    return {
        orders: processedOrders,
        cleanup: () => orderUpdates.unsubscribe()
    };
}