import { onMount, onDestroy } from 'svelte';
import { realtimeStore } from './realtime';
import { ordersStore } from './orders';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export function useOrdersRealtime() {
  let unsubscribe: (() => void) | null = null;

  function handleOrderChange(payload: RealtimePostgresChangesPayload<any>) {
    console.log('Order change detected:', payload);

    switch (payload.eventType) {
      case 'INSERT':
        // Reload to get the new order with summary fields
        ordersStore.load();
        break;

      case 'UPDATE':
        // Update the specific order in the store
        ordersStore.update(payload.new.id, payload.new);
        break;

      case 'DELETE':
        // Remove from store
        ordersStore.delete(payload.old.id);
        break;
    }
  }

  onMount(() => {
    unsubscribe = realtimeStore.subscribeToOrders(handleOrderChange);
  });

  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });
}
