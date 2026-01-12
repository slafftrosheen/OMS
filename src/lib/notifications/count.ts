import { derived } from 'svelte/store';
import { notifications } from '$lib/notifications/store';

export const unseenCount = derived(notifications, ($notifications) =>
  $notifications.filter((item) => !item.seen).length
);
