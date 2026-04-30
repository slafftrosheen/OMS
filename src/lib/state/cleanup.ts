import { ordersStore } from '$lib/stores/orders';
import { notificationStore } from '$lib/stores/notifications';
import { chatStore } from '$lib/stores/chat';
import { loads } from './loads';
import { uiState } from './appState.svelte';

/**
 * Resets all global stores to their initial state.
 * Called during logout to prevent data leakage between users.
 */
export function resetAllStores() {
    // Svelte 4 / Writable stores
    ordersStore.reset?.();
    notificationStore.clear?.();
    chatStore.clear?.();
    loads.set([]);
    
    // Add other stores as discovered
    // orderDetailStore.clear?.();
    // changeRequestsStore.clear?.();

    // Svelte 5 states
    // Usually we want to keep UI preferences (theme, etc.) unless they are specifically tied to a user.
    // If they ARE tied to a user, they should be reset or reloaded on login.
}
