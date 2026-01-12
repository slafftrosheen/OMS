import { writable } from 'svelte/store';
import type { StationTag } from '$lib/order/stages';
import { createId } from '$lib/utils/id';

export type NotificationUrgency = 'normal' | 'urgent';

export type NotificationItem = {
  id: string;
  text: string;
  ts: string;
  seen: boolean;
  station?: StationTag;
  urgency: NotificationUrgency;
  pinned?: boolean;
};

const MAX_ITEMS = 50;

function timestamp() {
  return new Date().toLocaleTimeString();
}

export const notifications = writable<NotificationItem[]>([]);

export function notify(
  text: string,
  options: { ts?: string; station?: StationTag; urgency?: NotificationUrgency } = {}
) {
  const item: NotificationItem = {
    id: createId('notif'),
    text,
    ts: options.ts ?? timestamp(),
    seen: false,
    station: options.station,
    urgency: options.urgency ?? 'normal'
  };
  notifications.update((items) => [item, ...items].slice(0, MAX_ITEMS));
}

export function clearNotifications() {
  notifications.set([]);
}

export function togglePin(id: string) {
  notifications.update((items) =>
    items.map((item) => (item.id === id ? { ...item, pinned: !item.pinned } : item))
  );
}

export function markSeen(id: string, seen = true) {
  notifications.update((items) =>
    items.map((item) => (item.id === id ? { ...item, seen } : item))
  );
}
