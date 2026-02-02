import { writable, get } from 'svelte/store';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

// Robust fallback for build environments
const supabaseUrl = env.PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface RealtimeState {
  connected: boolean;
  channels: Map<string, RealtimeChannel>;
  subscriptions: Map<string, any>;
}

function createRealtimeStore() {
  const initialState: RealtimeState = {
    connected: false,
    channels: new Map(),
    subscriptions: new Map()
  };

  const store = writable(initialState);
  const { subscribe, update } = store;

  return {
    subscribe,

    // Subscribe to order changes
    subscribeToOrders(callback: (payload: RealtimePostgresChangesPayload<any>) => void) {
      const channel = supabase
        .channel('orders-channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          callback
        )
        .subscribe((status) => {
          console.log('Orders subscription status:', status);
          update(state => ({
            ...state,
            connected: status === 'SUBSCRIBED'
          }));
        });

      update(state => {
        state.channels.set('orders', channel);
        return state;
      });

      return () => {
        channel.unsubscribe();
        update(state => {
          state.channels.delete('orders');
          return state;
        });
      };
    },

    // Subscribe to specific order
    subscribeToOrder(orderId: string, callback: (payload: RealtimePostgresChangesPayload<any>) => void) {
      const channelName = `order-${orderId}`;

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `id=eq.${orderId}`
          },
          callback
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'order_stages',
            filter: `order_id=eq.${orderId}`
          },
          callback
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'rework_cycles',
            filter: `order_id=eq.${orderId}`
          },
          callback
        )
        .subscribe();

      update(state => {
        state.channels.set(channelName, channel);
        return state;
      });

      return () => {
        channel.unsubscribe();
        update(state => {
          state.channels.delete(channelName);
          return state;
        });
      };
    },

    // Subscribe to station updates
    subscribeToStation(station: string, callback: (payload: RealtimePostgresChangesPayload<any>) => void) {
      const channelName = `station-${station}`;

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'order_stages',
            filter: `station=eq.${station}`
          },
          callback
        )
        .subscribe();

      update(state => {
        state.channels.set(channelName, channel);
        return state;
      });

      return () => {
        channel.unsubscribe();
        update(state => {
          state.channels.delete(channelName);
          return state;
        });
      };
    },

    // Unsubscribe from all channels
    unsubscribeAll() {
      const state = get(store);
      state.channels.forEach(channel => channel.unsubscribe());
      update(state => ({
        ...state,
        channels: new Map(),
        connected: false
      }));
    }
  };
}

export const realtimeStore = createRealtimeStore();
