import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { createNotificationStore } from '../../src/lib/stores/notifications';
import { normalizeNotification } from '../../src/lib/notifications/notification-model';

function row(id: string, fields: Record<string, unknown> = {}) {
  return {
    id, user_id: 'user-a', notification_type: 'order_confirmed',
    title: 'Order confirmed', message: 'Ready for production',
    source_type: 'order', source_id: 'order-a', link: '/orders/order-a',
    is_read: false, is_dismissed: false, created_at: '2026-10-22T10:00:00Z', ...fields
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fakeClient() {
  const replies: any[] = [];
  const calls: Array<{ table: string; operation: string; values?: unknown; filters: any[] }> = [];
  const channels: any[] = [];
  const removed: any[] = [];
  const client = {
    from(table: string) {
      const call = { table, operation: '', filters: [] as any[], values: undefined as unknown };
      calls.push(call);
      const reply = replies.shift() ?? { data: [], error: null };
      const query: any = {
        select() { call.operation = 'select'; return query; },
        update(values: unknown) { call.operation = 'update'; call.values = values; return query; },
        delete() { call.operation = 'delete'; return query; },
        eq(...filter: unknown[]) { call.filters.push(filter); return query; },
        order() { return query; },
        limit() { return query; },
        abortSignal() { return query; },
        then(resolve: any, reject: any) { return Promise.resolve(reply).then(resolve, reject); }
      };
      return query;
    },
    channel(name: string) {
      const channel: any = {
        name,
        callback: null,
        on(_type: string, _filters: any, callback: any) { channel.callback = callback; return channel; },
        subscribe() { return channel; },
        emit(eventType: string, value: any) {
          channel.callback({ eventType, new: eventType === 'DELETE' ? {} : value, old: eventType === 'DELETE' ? value : {} });
        }
      };
      channels.push(channel);
      return channel;
    },
    async removeChannel(channel: unknown) { removed.push(channel); }
  };
  return { client: client as any, replies, calls, channels, removed };
}

describe('notification row normalization', () => {
  it('maps canonical database fields without losing the actual event type or order link', () => {
    const result = normalizeNotification(row('n1', { is_read: true }));
    expect(result).toMatchObject({ id: 'n1', read: true, type: 'ORDER_CONFIRMED', category: 'ORDER',
      notification_type: 'order_confirmed', reference_id: 'order-a', link: '/orders/order-a' });
  });

  it('excludes dismissed or malformed rows and unsafe navigation targets', () => {
    expect(normalizeNotification(row('n1', { is_dismissed: true }))).toBeNull();
    expect(normalizeNotification({ title: 'missing identity' })).toBeNull();
    for (const link of ['https://elsewhere.test/', '//elsewhere.test/', '/\\elsewhere.test/', 'javascript:alert(1)']) {
      expect(normalizeNotification(row('n1', { link }))?.link).toBeNull();
    }
    expect(normalizeNotification(row('n2', { notification_type: 'low_stock', source_type: 'inventory' }))?.category).toBe('INVENTORY');
  });
});

describe('notification store persistence and subscriptions', () => {
  it('loads canonical unread state, filters dismissed rows and writes is_read/read_at only once', async () => {
    const fake = fakeClient();
    fake.replies.push({ data: [row('n1'), row('n2', { is_read: true }), row('n3', { is_dismissed: true })], error: null });
    const store = createNotificationStore(fake.client);
    await store.load('user-a');
    expect(get(store).items).toHaveLength(2);
    expect(get(store).unreadCount).toBe(1);
    expect(fake.calls[0].filters.some(filter => filter[0] === 'is_dismissed' && filter[1] === false)).toBe(true);
    await store.markAsRead('n1');
    await store.markAsRead('n1');
    expect(get(store).unreadCount).toBe(0);
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1].values).toMatchObject({ is_read: true, read_at: expect.any(String) });
    expect(fake.calls[1].values).not.toHaveProperty('read');
    expect(fake.calls[1].filters).toEqual([['id', 'n1'], ['user_id', 'user-a']]);
  });

  it('deduplicates realtime insertions and reflects update, dismissal and deletion', async () => {
    const fake = fakeClient();
    const store = createNotificationStore(fake.client);
    const stop = store.subscribe_realtime('user-a');
    const channel = fake.channels[0];
    channel.emit('INSERT', row('n1'));
    channel.emit('INSERT', row('n1'));
    channel.emit('INSERT', row('other', { user_id: 'user-b' }));
    expect(get(store).items).toHaveLength(1);
    expect(get(store).unreadCount).toBe(1);
    channel.emit('UPDATE', row('n1', { is_read: true }));
    expect(get(store).unreadCount).toBe(0);
    channel.emit('UPDATE', row('n1', { is_dismissed: true }));
    expect(get(store).items).toHaveLength(0);
    channel.emit('INSERT', row('n2'));
    channel.emit('DELETE', { id: 'n2' });
    expect(get(store).unreadCount).toBe(0);
    stop();
  });

  it('shares one channel between bell and page and scopes cleanup to the subscribing generation', () => {
    const fake = fakeClient();
    const store = createNotificationStore(fake.client);
    const stopBell = store.subscribe_realtime('user-a');
    const stopPage = store.subscribe_realtime('user-a');
    expect(fake.channels).toHaveLength(1);
    stopBell();
    expect(fake.removed).toHaveLength(0);
    const stopNextUser = store.subscribe_realtime('user-b');
    expect(fake.removed).toHaveLength(1);
    stopPage();
    expect(fake.removed).toHaveLength(1);
    fake.channels[0].emit('INSERT', row('late-old-user'));
    expect(get(store).items).toHaveLength(0);
    stopNextUser();
    expect(fake.removed).toHaveLength(2);
  });

  it('keeps realtime changes arriving during a refresh and ignores stale loads after logout', async () => {
    const fake = fakeClient();
    const pending = deferred<any>();
    fake.replies.push(pending.promise);
    const store = createNotificationStore(fake.client);
    const load = store.load('user-a');
    store.subscribe_realtime('user-a');
    fake.channels[0].emit('INSERT', row('n2', { created_at: '2026-10-22T11:00:00Z' }));
    fake.channels[0].emit('UPDATE', row('n1', { is_read: true }));
    pending.resolve({ data: [row('n1')], error: null });
    await load;
    expect(get(store).items.map(item => item.id)).toEqual(['n2', 'n1']);
    expect(get(store).unreadCount).toBe(1);

    const stale = deferred<any>();
    fake.replies.push(stale.promise);
    const lateLoad = store.load('user-a');
    store.clear();
    stale.resolve({ data: [row('old')], error: null });
    await lateLoad;
    expect(get(store).items).toHaveLength(0);
    expect(get(store).loading).toBe(false);
  });

  it('does not apply an old account mutation to a new account and dismisses using canonical fields', async () => {
    const fake = fakeClient();
    fake.replies.push({ data: [row('n1')], error: null });
    const store = createNotificationStore(fake.client);
    await store.load('user-a');
    const mutation = deferred<any>();
    fake.replies.push(mutation.promise);
    const dismiss = store.delete('n1');
    fake.replies.push({ data: [row('n1', { user_id: 'user-b' })], error: null });
    await store.load('user-b');
    mutation.resolve({ error: null });
    await dismiss;
    expect(get(store).items[0].user_id).toBe('user-b');
    expect(fake.calls[1].values).toEqual({ is_dismissed: true });
    expect(fake.calls[1].filters).toEqual([['id', 'n1'], ['user_id', 'user-a']]);
  });

  it('does not mark a notification that arrives after mark-all started as already read', async () => {
    const fake = fakeClient();
    fake.replies.push({ data: [row('n1')], error: null });
    const store = createNotificationStore(fake.client);
    await store.load('user-a');
    store.subscribe_realtime('user-a');
    const update = deferred<any>();
    fake.replies.push(update.promise);
    const markAll = store.markAllAsRead('user-a');
    fake.channels[0].emit('INSERT', row('n2', { created_at: '2026-10-22T11:00:00Z' }));
    update.resolve({ error: null });
    await markAll;
    expect(get(store).unreadCount).toBe(1);
    expect(get(store).items.find(item => item.id === 'n2')?.read).toBe(false);
    expect(fake.calls[1].values).toHaveProperty('is_read', true);
    expect(fake.calls[1].filters).toEqual([['user_id', 'user-a'], ['is_read', false]]);
    store.clear();
  });

  it('keeps the last successful data and unread state when a refresh or write fails', async () => {
    const fake = fakeClient();
    fake.replies.push({ data: [row('n1')], error: null });
    const store = createNotificationStore(fake.client);
    await store.load('user-a');
    fake.replies.push({ data: null, error: { message: 'network unavailable' } });
    await store.load('user-a');
    expect(get(store).items).toHaveLength(1);
    expect(get(store).loading).toBe(false);
    expect(get(store).error).toBeTruthy();
    fake.replies.push({ error: { message: 'permission denied' } });
    await store.markAsRead('n1');
    expect(get(store).unreadCount).toBe(1);
    expect(get(store).items[0].read).toBe(false);
    expect(get(store).error).toBeTruthy();
  });

  it('never asks browser notification permission from an incoming event', () => {
    const oldWindow = globalThis.window;
    const oldNotification = globalThis.Notification;
    let prompts = 0;
    let shown = 0;
    class BrowserNotification {
      static permission = 'default';
      static async requestPermission() { prompts += 1; return 'granted'; }
      constructor() { shown += 1; }
    }
    try {
      (globalThis as any).window = { Notification: BrowserNotification };
      (globalThis as any).Notification = BrowserNotification;
      const fake = fakeClient();
      const store = createNotificationStore(fake.client);
      store.subscribe_realtime('user-a');
      fake.channels[0].emit('INSERT', row('n1'));
      expect(prompts).toBe(0);
      expect(shown).toBe(0);
      BrowserNotification.permission = 'granted';
      fake.channels[0].emit('INSERT', row('n2'));
      fake.channels[0].emit('INSERT', row('n2'));
      expect(shown).toBe(1);
      store.clear();
    } finally {
      (globalThis as any).window = oldWindow;
      (globalThis as any).Notification = oldNotification;
    }
  });
});
