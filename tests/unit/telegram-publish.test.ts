import { describe, it, expect } from 'vitest';
import { publishNotificationRows } from '../../src/lib/server/notifications/publish';

const notice = { user_id: 'recipient', notification_type: 'order_confirmed', title: 'Order confirmed', message: 'Ready', link: '/orders/one', source_type: 'order', source_id: 'one' };

describe('trusted notification publication', () => {
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
});
