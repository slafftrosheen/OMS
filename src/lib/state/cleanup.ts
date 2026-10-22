import { orderState } from '$lib/order/orderState.svelte';
import { notificationStore } from '$lib/stores/notifications';
import { resetChatState } from '$lib/chat/chat-store';
import { resetUserDirectory } from '$lib/users/user-store';
import { resetPreferencesCache } from '$lib/preferences';
import { loads } from './loads';

/** Clear account-owned data and pending reads when signing out. */
export function resetAllStores() {
  orderState.reset();
  notificationStore.clear();
  resetChatState();
  resetUserDirectory();
  resetPreferencesCache();
  loads.set([]);
}
