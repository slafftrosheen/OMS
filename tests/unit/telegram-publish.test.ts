import { describe, it, expect } from 'vitest';
import { publishNotifications, publishNotificationRows } from '../../src/lib/server/notifications/publish';

const notice = { user_id: 'recipient', notification_type: 'order_confirmed', title: 'Order confirmed', message: 'Ready', link: '/orders/one', source_type: 'order', source_id: 'one' };

describe('trusted notification publication', () => {
  it('does not resolve optional settings or touch storage when there are no recipients', async () => {
    const previousFetch = globalThis.fetch;
    const previousUrl = process.env.PUBLIC_SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let requests = 0;
    process.env.PUBLIC_SUPABASE_URL = 'https://db.example.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service-key';
    globalThis.fetch = async () => { requests++; throw new Error('No work to publish'); };
    try {
      const db: any = { from() { throw new Error('No notifications to insert'); } };
      expect((await publishNotifications(db, [])).error).toBe(null);
      expect(requests).toBe(0);
    } finally {
      globalThis.fetch = previousFetch;
      if (previousUrl === undefined) delete process.env.PUBLIC_SUPABASE_URL; else process.env.PUBLIC_SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });

  it('persists ordinary in-app notifications when Telegram is disabled', async () => {
    const saved: any[] = [];
    const db: any = { from: () => ({ insert: async (rows: any[]) => { saved.push(...rows); return { error: null }; } }) };
    const result = await publishNotificationRows(db, [notice]);
    expect(result.error).toBe(null);
    expect(saved.length).toBe(1);
    expect(saved[0].notification_type).toBe('order_confirmed');
    expect(typeof saved[0].id).toBe('string');
  });

  it('publishes the notification and its outbox atomically through a trusted server RPC', async () => {
    const persisted: any[] = [];
    let legacyWrites = 0;
    const db: any = { from: () => ({ insert: async () => { legacyWrites++; return { error: null }; } }) };
    const outbox: any = { rpc: async (name: string, args: any) => {
      if (name !== 'publish_telegram_notifications') throw new Error('Unexpected RPC');
      persisted.push(...args.p_notifications);
      return { data: args.p_notifications.length, error: null };
    } };
    expect((await publishNotificationRows(db, [notice], outbox)).error).toBe(null);
    expect(persisted.length).toBe(1);
    expect(legacyWrites).toBe(0);
  });

  it('keeps the in-app notification when the integration migration is not available', async () => {
    const saved: any[] = [];
    const db: any = { from: () => ({ insert: async (rows: any[]) => { saved.push(...rows); return { error: null }; } }) };
    const outbox: any = { rpc: async () => ({ data: null, error: { code: 'PGRST202' } }) };
    expect((await publishNotificationRows(db, [notice], outbox)).error).toBe(null);
    expect(saved.length).toBe(1);
  });

  it('bounds fanout batches without dropping recipients', async () => {
    const sizes: number[] = [];
    const outbox: any = { rpc: async (_name: string, args: any) => { sizes.push(args.p_notifications.length); return { data: args.p_notifications.length, error: null }; } };
    const result = await publishNotificationRows({} as any, Array.from({ length: 205 }, (_, index) => ({ ...notice, user_id: String(index) })), outbox);
    expect(result.error).toBe(null);
    expect(sizes).toEqual([100, 100, 5]);
  });

  it('does not repeatedly call a missing outbox migration for every fanout batch', async () => {
    let attempts = 0;
    const sizes: number[] = [];
    const outbox: any = { rpc: async () => { attempts++; return { data: null, error: { code: 'PGRST202' } }; } };
    const db: any = { from: () => ({ insert: async (rows: any[]) => { sizes.push(rows.length); return { error: null }; } }) };
    const result = await publishNotificationRows(db, Array.from({ length: 205 }, (_, index) => ({ ...notice, user_id: String(index) })), outbox);
    expect(result.error).toBe(null);
    expect(attempts).toBe(1);
    expect(sizes).toEqual([100, 100, 5]);
  });
});
