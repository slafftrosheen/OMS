/**
 * Realtime Orders Hook
 * Provides a reactive way to listen for order updates in components
 */

import { onMount, onDestroy } from 'svelte';
import { realtimeOrders, type RealtimeOrderUpdate } from './realtime-service';
import { get } from 'svelte/store';

export function useRealtimeOrders(callback: (update: RealtimeOrderUpdate) => void) {
  let handler: ((event: Event) => void) | null = null;

  onMount(() => {
    handler = (event: Event) => {
      const customEvent = event as CustomEvent<RealtimeOrderUpdate>;
      callback(customEvent.detail);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('orderUpdate', handler);
    }
  });

  onDestroy(() => {
    if (handler && typeof window !== 'undefined') {
      window.removeEventListener('orderUpdate', handler);
    }
  });
}

export function useRealtimeNotifications(callback: (notification: any) => void) {
  let handler: ((event: Event) => void) | null = null;

  onMount(() => {
    handler = (event: Event) => {
      const customEvent = event as CustomEvent;
      callback(customEvent.detail);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('notification', handler);
    }
  });

  onDestroy(() => {
    if (handler && typeof window !== 'undefined') {
      window.removeEventListener('notification', handler);
    }
  });
}