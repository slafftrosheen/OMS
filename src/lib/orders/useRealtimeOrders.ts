// src/lib/orders/useRealtimeOrders.ts
import { writable, derived } from 'svelte/store';
import type { Order } from '$lib/order/types'; // Adapted path

export function useRealtimeOrders(supabase: any) {
    // Create a store to hold the orders
    const orders = writable<Order[]>([]);

    // Subscribe to order changes
    // Using 'draft_orders' as identified in the schema analysis
    const channel = supabase
        .channel('orders-channel')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'draft_orders'
            },
            (payload) => {
                // Handle the update based on the event type
                orders.update(currentOrders => {
                    const newRecord = payload.new;
                    const oldRecord = payload.old;
                    
                    switch (payload.eventType) {
                        case 'INSERT':
                            return [...currentOrders, newRecord];
                        case 'UPDATE':
                            return currentOrders.map(order => 
                                order.id === newRecord.id ? newRecord : order
                            );
                        case 'DELETE':
                            return currentOrders.filter(order => 
                                order.id !== oldRecord.id
                            );
                        default:
                            return currentOrders;
                    }
                });
            }
        )
        .subscribe();

    return {
        orders,
        cleanup: () => {
            supabase.removeChannel(channel);
        }
    };
}