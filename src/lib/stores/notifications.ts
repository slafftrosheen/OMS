import { writable, get } from 'svelte/store';
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
type Subscription = { channel: RealtimeChannel; consumers: number };

const emptyState = (): NotificationState => ({ items: [], unreadCount: 0, loading: false, error: null });
const countUnread = (items: Notification[]) => items.filter(item => !item.read).length;
const sortItems = (items: Notification[]) => items.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)).slice(0, 50);

export function createNotificationStore(client: NotificationClient = supabase) {
  const store = writable<NotificationState>(emptyState());
  let userId: string | null = null;
  let sessionVersion = 0;
  let loadVersion = 0;
  let loadController: AbortController | null = null;
  let activeLoad: Promise<void> | null = null;
  let subscription: Subscription | null = null;
  const mutations = new Map<string, Promise<void>>();
  const mutationControllers = new Set<AbortController>();
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
    activeLoad = null;
    for (const controller of mutationControllers) controller.abort();
    mutationControllers.clear();
    mutations.clear();
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

  function mutate(key: string, query: (signal: AbortSignal) => PromiseLike<{ error: unknown }>,
    apply: () => void, errorMessage: string): Promise<void> {
    const pending = mutations.get(key);
    if (pending) return pending;
    const session = sessionVersion;
    const controller = new AbortController();
    mutationControllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 10000);
    const task = (async () => {
      try {
        const { error } = await query(controller.signal);
        if (session !== sessionVersion) return;
        if (error) throw error;
        apply();
      } catch {
        if (session === sessionVersion) store.update(state => ({ ...state, error: errorMessage }));
      } finally {
        clearTimeout(timer);
        mutationControllers.delete(controller);
      }
    })();
    mutations.set(key, task);
    void task.then(() => { if (mutations.get(key) === task) mutations.delete(key); });
    return task;
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

  const api = {
    subscribe: store.subscribe,

    load(nextUserId: string): Promise<void> {
      if (!nextUserId) { reset(null); return Promise.resolve(); }
      useUser(nextUserId);
      if (activeLoad) return activeLoad;
      const controller = new AbortController();
      loadController = controller;
      const version = ++loadVersion;
      const session = sessionVersion;
      pendingChanges = new Map();
      store.update(state => ({ ...state, loading: true, error: null }));
      const timer = setTimeout(() => controller.abort(), 10000);

      const task = (async () => {
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
        } catch {
          if (session !== sessionVersion || version !== loadVersion) return;
          store.update(state => ({ ...state, loading: false,
            error: controller.signal.aborted ? 'Notifications took too long to load. Please retry.' : 'Could not load notifications. Please retry.' }));
        } finally {
          clearTimeout(timer);
          if (version === loadVersion) { loadController = null; pendingChanges.clear(); }
        }
      })();
      activeLoad = task;
      void task.then(() => { if (activeLoad === task) activeLoad = null; });
      return task;
    },

    /** Bell and page share one initial refresh and realtime channel. */
    connect(nextUserId: string) {
      if (!nextUserId) return () => {};
      useUser(nextUserId);
      const firstConsumer = !subscription;
      if (!subscription) {
        const current: Subscription = { channel: client.channel(`notifications:${nextUserId}`), consumers: 0 };
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
      if (firstConsumer) void api.load(nextUserId);
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
      return mutate(`read:${notificationId}`, signal => client.from('notifications')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('id', notificationId).eq('user_id', owner).abortSignal(signal), () => {
        const latest = get(store).items.find(item => item.id === notificationId);
        if (latest) applyItem(notificationId, { ...latest, read: true });
      }, 'Could not mark notification as read. Please retry.');
    },

    async markAllAsRead(owner: string) {
      if (!userId || owner !== userId) return;
      const targetIds = new Set(get(store).items.filter(item => !item.read).map(item => item.id));
      if (!targetIds.size) return;
      return mutate('read-all', signal => client.from('notifications')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('user_id', owner).eq('is_read', false).abortSignal(signal), () => {
        for (const item of get(store).items) {
          if (targetIds.has(item.id)) applyItem(item.id, { ...item, read: true });
        }
      }, 'Could not mark notifications as read. Please retry.');
    },

    async dismiss(notificationId: string) {
      if (!userId || !get(store).items.some(item => item.id === notificationId)) return;
      const owner = userId;
      return mutate(`dismiss:${notificationId}`, signal => client.from('notifications').update({ is_dismissed: true })
        .eq('id', notificationId).eq('user_id', owner).abortSignal(signal), () => applyItem(notificationId, null),
        'Could not dismiss notification. Please retry.');
    },

    async dismissRead() {
      if (!userId) return;
      const owner = userId;
      const ids = get(store).items.filter(item => item.read).map(item => item.id);
      if (!ids.length) return;
      return mutate('dismiss-read', signal => client.from('notifications').update({ is_dismissed: true })
        .eq('user_id', owner).eq('is_read', true).in('id', ids).abortSignal(signal), () => {
          for (const id of ids) applyItem(id, null);
        }, 'Could not dismiss notifications. Please retry.');
    },

    clear() { reset(null); }
  };
  return api;
}

export const notificationStore = createNotificationStore();
