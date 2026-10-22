import { writable, derived, get } from 'svelte/store';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '$lib/supabase-client';
import { normalizeNotification, type Notification } from '$lib/notifications/notification-model';

export type { Notification } from '$lib/notifications/notification-model';

interface NotificationState {
  items: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
}

type NotificationClient = Pick<SupabaseClient, 'from' | 'channel' | 'removeChannel'>;
type Subscription = { channel: RealtimeChannel; userId: string; consumers: number };

const emptyState = (): NotificationState => ({ items: [], unreadCount: 0, loading: false, error: null });
const countUnread = (items: Notification[]) => items.filter(item => !item.read).length;
const sortItems = (items: Notification[]) => items.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)).slice(0, 50);

export function createNotificationStore(client: NotificationClient = supabase) {
  const store = writable<NotificationState>(emptyState());
  let userId: string | null = null;
  let sessionVersion = 0;
  let loadVersion = 0;
  let loadController: AbortController | null = null;
  let subscription: Subscription | null = null;
  // A refresh must not overwrite an event or successful write that arrived while it was loading.
  let pendingChanges = new Map<string, Notification | null>();
  const seenInsertions = new Set<string>();

  function stopSubscription() {
    const current = subscription;
    subscription = null;
    if (current) void Promise.resolve(client.removeChannel(current.channel)).catch(() => {});
  }

  function reset(nextUserId: string | null) {
    sessionVersion += 1;
    loadVersion += 1;
    loadController?.abort();
    loadController = null;
    stopSubscription();
    userId = nextUserId;
    pendingChanges = new Map();
    seenInsertions.clear();
    store.set(emptyState());
  }

  function useUser(nextUserId: string) {
    if (nextUserId !== userId) reset(nextUserId);
  }

  function remember(id: string) {
    seenInsertions.add(id);
    if (seenInsertions.size > 1000) seenInsertions.delete(seenInsertions.values().next().value!);
  }

  function applyItem(id: string, item: Notification | null) {
    store.update(state => {
      if (state.loading) pendingChanges.set(id, item);
      const items = sortItems([...state.items.filter(value => value.id !== id), ...(item ? [item] : [])]);
      return { ...state, items, unreadCount: countUnread(items) };
    });
  }

  function setError(error: unknown, fallback: string) {
    store.update(state => ({ ...state, error: error instanceof Error ? error.message : fallback }));
  }

  function showBrowserNotification(notification: Notification) {
    if (typeof window === 'undefined' || !('Notification' in window) || window.Notification.permission !== 'granted') return;
    // Permission requests belong to an explicit user action; incoming messages never prompt.
    try {
      new window.Notification(notification.title, { body: notification.message, tag: notification.id });
    } catch {
      // Some mobile browsers expose Notification but require a service worker to display it.
    }
  }

  return {
    subscribe: store.subscribe,

    async load(nextUserId: string) {
      if (!nextUserId) { reset(null); return; }
      useUser(nextUserId);
      loadController?.abort();
      const controller = new AbortController();
      loadController = controller;
      const version = ++loadVersion;
      const session = sessionVersion;
      pendingChanges = new Map();
      store.update(state => ({ ...state, loading: true, error: null }));
      const timer = setTimeout(() => controller.abort(), 10000);

      try {
        const { data, error } = await client.from('notifications')
          .select('*').eq('user_id', nextUserId).eq('is_dismissed', false)
          .order('created_at', { ascending: false }).limit(50).abortSignal(controller.signal);
        if (session !== sessionVersion || version !== loadVersion) return;
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error('Could not load notifications');
        const byId = new Map<string, Notification>();
        for (const row of data) {
          const item = normalizeNotification(row);
          if (item?.user_id === nextUserId) { byId.set(item.id, item); remember(item.id); }
        }
        for (const [id, item] of pendingChanges) {
          if (item) byId.set(id, item);
          else byId.delete(id);
        }
        const items = sortItems([...byId.values()]);
        store.set({ items, unreadCount: countUnread(items), loading: false, error: null });
      } catch (error) {
        if (session !== sessionVersion || version !== loadVersion) return;
        store.update(state => ({ ...state, loading: false,
          error: controller.signal.aborted ? 'Notifications took too long to load. Please retry.' : 'Could not load notifications. Please retry.' }));
      } finally {
        clearTimeout(timer);
        if (version === loadVersion) { loadController = null; pendingChanges.clear(); }
      }
    },

    subscribe_realtime(nextUserId: string) {
      if (!nextUserId) return () => {};
      useUser(nextUserId);
      if (!subscription) {
        const current: Subscription = { channel: client.channel(`notifications:${nextUserId}`), userId: nextUserId, consumers: 0 };
        subscription = current;
        current.channel.on('postgres_changes', {
          event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${nextUserId}`
        }, payload => {
          if (subscription !== current || userId !== nextUserId) return;
          const raw = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Record<string, unknown>;
          if (typeof raw.id !== 'string' || (raw.user_id && raw.user_id !== nextUserId)) return;
          if (payload.eventType === 'DELETE') {
            // DELETE payloads can contain only the primary key under RLS.
            if (get(store).items.some(item => item.id === raw.id) || get(store).loading) applyItem(raw.id, null);
            return;
          }
          if (raw.user_id !== nextUserId) return;
          const item = normalizeNotification(raw);
          const show = payload.eventType === 'INSERT' && item && !item.read && !seenInsertions.has(item.id);
          remember(raw.id);
          applyItem(raw.id, item);
          if (show && item) showBrowserNotification(item);
        }).subscribe();
      }
      const current = subscription;
      current.consumers += 1;
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        if (subscription !== current) return;
        current.consumers -= 1;
        if (current.consumers === 0) stopSubscription();
      };
    },

    async markAsRead(notificationId: string) {
      const current = get(store).items.find(item => item.id === notificationId);
      if (!userId || !current || current.read) return;
      const owner = userId;
      const session = sessionVersion;
      try {
        const { error } = await client.from('notifications')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('id', notificationId).eq('user_id', owner);
        if (session !== sessionVersion) return;
        if (error) throw error;
        const latest = get(store).items.find(item => item.id === notificationId);
        if (latest) applyItem(notificationId, { ...latest, read: true });
      } catch (error) {
        if (session === sessionVersion) setError(error, 'Could not mark notification as read. Please retry.');
      }
    },

    async markAllAsRead(owner: string) {
      if (!userId || owner !== userId) return;
      const session = sessionVersion;
      const targetIds = new Set(get(store).items.filter(item => !item.read).map(item => item.id));
      try {
        const { error } = await client.from('notifications')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('user_id', owner).eq('is_read', false);
        if (session !== sessionVersion) return;
        if (error) throw error;
        for (const item of get(store).items) {
          if (targetIds.has(item.id)) applyItem(item.id, { ...item, read: true });
        }
      } catch (error) {
        if (session === sessionVersion) setError(error, 'Could not mark notifications as read. Please retry.');
      }
    },

    async delete(notificationId: string) {
      if (!userId || !get(store).items.some(item => item.id === notificationId)) return;
      const owner = userId;
      const session = sessionVersion;
      try {
        const { error } = await client.from('notifications').update({ is_dismissed: true })
          .eq('id', notificationId).eq('user_id', owner);
        if (session !== sessionVersion) return;
        if (error) throw error;
        applyItem(notificationId, null);
      } catch (error) {
        if (session === sessionVersion) setError(error, 'Could not dismiss notification. Please retry.');
      }
    },

    showBrowserNotification,

    async requestPermission() {
      if (typeof window === 'undefined' || !('Notification' in window)) return false;
      try { return await window.Notification.requestPermission() === 'granted'; }
      catch { return false; }
    },

    clear() { reset(null); }
  };
}

export const notificationStore = createNotificationStore();
export const unreadNotifications = derived(notificationStore, state => state.items.filter(item => !item.read));
