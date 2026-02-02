import { writable, derived, get } from 'svelte/store';
import type { Writable } from 'svelte/store';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Robust fallback for build environments
const supabaseUrl = PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ASSIGNMENT' | 'REWORK' | 'STAGE_CHANGE';
  reference_id?: string;
  reference_type?: string;
  read: boolean;
  created_at: string;
}

interface NotificationState {
  items: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
}

function createNotificationStore() {
  const initialState: NotificationState = {
    items: [],
    unreadCount: 0,
    loading: false,
    error: null
  };

  const store: Writable<NotificationState> = writable(initialState);
  const { subscribe, update, set } = store;

  let realtimeChannel: any = null;

  return {
    subscribe,

    // Load notifications
    async load(userId: string) {
      update(state => ({ ...state, loading: true, error: null }));

      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;

        const unreadCount = data?.filter(n => !n.read).length || 0;

        update(state => ({
          ...state,
          items: data || [],
          unreadCount,
          loading: false
        }));
      } catch (err: any) {
        update(state => ({
          ...state,
          loading: false,
          error: err.message
        }));
      }
    },

    // Subscribe to real-time notifications
    subscribe_realtime(userId: string) {
      realtimeChannel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`
          },
          (payload) => {
            update(state => ({
              ...state,
              items: [payload.new as Notification, ...state.items],
              unreadCount: state.unreadCount + 1
            }));

            // Show browser notification
            this.showBrowserNotification(payload.new as Notification);
          }
        )
        .subscribe();

      return () => {
        if (realtimeChannel) {
          realtimeChannel.unsubscribe();
        }
      };
    },

    // Mark as read
    async markAsRead(notificationId: string) {
      try {
        const { error } = await supabase
          .from('notifications')
          .update({ read: true })
          .eq('id', notificationId);

        if (error) throw error;

        update(state => ({
          ...state,
          items: state.items.map(n =>
            n.id === notificationId ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, state.unreadCount - 1)
        }));
      } catch (err: any) {
        console.error('Failed to mark notification as read:', err);
      }
    },

    // Mark all as read
    async markAllAsRead(userId: string) {
      try {
        const { error } = await supabase
          .from('notifications')
          .update({ read: true })
          .eq('user_id', userId)
          .eq('read', false);

        if (error) throw error;

        update(state => ({
          ...state,
          items: state.items.map(n => ({ ...n, read: true })),
          unreadCount: 0
        }));
      } catch (err: any) {
        console.error('Failed to mark all as read:', err);
      }
    },

    // Delete notification
    async delete(notificationId: string) {
      try {
        const notification = get(store).items.find(n => n.id === notificationId);

        const { error } = await supabase
          .from('notifications')
          .delete()
          .eq('id', notificationId);

        if (error) throw error;

        update(state => ({
          ...state,
          items: state.items.filter(n => n.id !== notificationId),
          unreadCount: notification && !notification.read
            ? Math.max(0, state.unreadCount - 1)
            : state.unreadCount
        }));
      } catch (err: any) {
        console.error('Failed to delete notification:', err);
      }
    },

    // Show browser notification
    showBrowserNotification(notification: Notification) {
      if (!('Notification' in window)) return;

      if (Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/favicon.png',
          tag: notification.id
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification(notification.title, {
              body: notification.message,
              icon: '/favicon.png',
              tag: notification.id
            });
          }
        });
      }
    },

    // Request notification permission
    async requestPermission() {
      if (!('Notification' in window)) {
        console.log('This browser does not support notifications');
        return false;
      }

      const permission = await Notification.requestPermission();
      return permission === 'granted';
    },

    // Clear all
    clear() {
      set(initialState);
      if (realtimeChannel) {
        realtimeChannel.unsubscribe();
      }
    }
  };
}

export const notificationStore = createNotificationStore();

// Derived store for unread notifications
export const unreadNotifications = derived(
  notificationStore,
  $store => $store.items.filter(n => !n.read)
);
