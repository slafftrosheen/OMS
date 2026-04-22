/**
 * Realtime Event Subscription Hooks
 *
 * Generic `useEventSubscription` replaces the previously duplicated
 * `useRealtimeOrders` and `useRealtimeNotifications` hooks.
 * Both were structurally identical — listen for a CustomEvent on `window`,
 * forward the detail to a callback, and clean up on destroy.
 */

import { onMount, onDestroy } from 'svelte';
import type { RealtimeOrderUpdate } from './realtime-service';

/**
 * Generic hook that subscribes to a named CustomEvent on `window`.
 * Automatically binds on mount and unbinds on destroy.
 *
 * @param eventName — The DOM CustomEvent name to listen for.
 * @param callback  — Invoked with the event's `detail` payload.
 */
export function useEventSubscription<T = unknown>(
	eventName: string,
	callback: (detail: T) => void
): void {
	let handler: ((event: Event) => void) | null = null;

	onMount(() => {
		handler = (event: Event) => {
			const customEvent = event as CustomEvent<T>;
			callback(customEvent.detail);
		};

		if (typeof window !== 'undefined') {
			window.addEventListener(eventName, handler);
		}
	});

	onDestroy(() => {
		if (handler && typeof window !== 'undefined') {
			window.removeEventListener(eventName, handler);
		}
	});
}

/**
 * Subscribe to real-time order update events.
 * Convenience wrapper around `useEventSubscription`.
 */
export function useRealtimeOrders(callback: (update: RealtimeOrderUpdate) => void): void {
	useEventSubscription<RealtimeOrderUpdate>('orderUpdate', callback);
}

/**
 * Subscribe to real-time notification events.
 * Convenience wrapper around `useEventSubscription`.
 */
export function useRealtimeNotifications(callback: (notification: any) => void): void {
	useEventSubscription('notification', callback);
}