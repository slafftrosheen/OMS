import { describe, it, expect } from 'vitest';
import { readTelegramStatus, connectTelegram, handleTelegramUpdate, dispatchTelegramDeliveries } from '../../src/lib/server/notifications/telegram-service';
import type { TelegramConfig } from '../../src/lib/server/notifications/telegram';

const config: TelegramConfig = { botToken: '123:abcdefghijklmnopqrstuvwx', botUsername: 'OMS_notify_bot', webhookSecret: 's'.repeat(32), deliverySecret: 'd'.repeat(32), appUrl: 'https://oms.example.test' };

function fakeDatabase() {
  const state: any = { connection: null, pending: null, savedTokenHash: null, linked: false, disconnected: false, rows: [], errors: false };
  const db: any = {
    from(table: string) {
      const query: any = {
        select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: table === 'telegram_connections' ? state.connection : state.pending, error: state.errors ? { code: '42P01' } : null })
      };
      return query;
    },
    async rpc(name: string, args: any) {
      if (state.errors) return { data: null, error: { code: '42P01' } };
      if (name === 'get_telegram_settings') return { data: null, error: null };
      if (name === 'prepare_telegram_link') {
        state.savedTokenHash = args.p_token_hash;
        return { data: '2099-01-01T00:00:00Z', error: null };
      }
      if (name === 'process_telegram_update') {
        if (args.p_command === 'connect') state.linked = true;
        if (args.p_command === 'disconnect') state.disconnected = true;
        return { data: true, error: null };
      }
      if (name === 'claim_telegram_deliveries') {
        const rows = state.rows.filter((row: any) => row.status === 'pending').slice(0, args.p_limit);
        rows.forEach((row: any) => { row.status = 'processing'; row.attempts++; row.claim_token = `lease-${row.id}`; });
        return { data: rows.map((row: any) => ({ ...row })), error: null };
      }
      const row = state.rows.find((row: any) => row.id === args.p_id && row.claim_token === args.p_claim_token);
      if (name === 'telegram_delivery_payload') return { data: row?.optedIn ? row.payload : null, error: null };
      if (name === 'finish_telegram_delivery' && row) {
        Object.assign(row, { status: args.p_status, next_attempt_at: args.p_retry_at, last_error: args.p_error, messageId: args.p_message_id });
        return { data: true, error: null };
      }
      return { data: false, error: null };
    }
  };
  return { state, db };
}

describe('Telegram settings and linking', () => {
  it('returns no private chat IDs or token digests in the status payload', async () => {
    const { db, state } = fakeDatabase();
    state.connection = { chat_id: '1234', enabled: true, username: 'alice', linked_at: '2026-10-22T12:00:00Z' };
    state.pending = { token_hash: 'secret-hash', expires_at: '2099-01-01T00:00:00Z' };
    const status = await readTelegramStatus(config, db, 'user-1');
    expect(status).toEqual({ configured: true, available: true, connected: true, enabled: true, username: 'alice', linkedAt: '2026-10-22T12:00:00Z', pendingUntil: '2099-01-01T00:00:00Z', botUsername: 'OMS_notify_bot' });
    expect(JSON.stringify(status).includes('1234')).toBe(false);
    expect(JSON.stringify(status).includes('secret-hash')).toBe(false);
  });

  it('keeps settings usable when the migration has not been applied', async () => {
    const { db, state } = fakeDatabase();
    state.errors = true;
    const status = await readTelegramStatus(config, db, 'user-1');
    expect(status.configured).toBe(true);
    expect(status.available).toBe(false);
    expect(status.connected).toBe(false);
  });

  it('stores a token digest and returns only the expiring bot link to its authenticated owner', async () => {
    const { db, state } = fakeDatabase();
    const result = await connectTelegram(config, db, 'user-1');
    const url = new URL(result.url);
    expect(url.origin).toBe('https://t.me');
    expect(url.pathname).toBe('/OMS_notify_bot');
    expect(url.searchParams.get('start')?.length).toBe(43);
    expect(state.savedTokenHash.length).toBe(64);
    expect(state.savedTokenHash === url.searchParams.get('start')).toBe(false);
    expect(result.expiresAt).toBe('2099-01-01T00:00:00Z');
  });

  it('ignores group messages and supports disconnecting in the private bot chat', async () => {
    const { db, state } = fakeDatabase();
    await handleTelegramUpdate(config, db, { message: { text: `/start ${'a'.repeat(43)}`, chat: { id: 1234, type: 'group' }, from: { id: 1234 } } });
    expect(state.linked).toBe(false);
    await handleTelegramUpdate(config, db, { update_id: 2, message: { date: 1792660000, text: '/stop', chat: { id: 1234, type: 'private' }, from: { id: 1234 } } });
    expect(state.disconnected).toBe(true);
  });

  it('requires Telegram replay identity before applying account commands', async () => {
    const { db, state } = fakeDatabase();
    await handleTelegramUpdate(config, db, { message: { text: '/stop', chat: { id: 1234, type: 'private' }, from: { id: 1234 } } });
    expect(state.disconnected).toBe(false);
    await handleTelegramUpdate(config, db, { update_id: -1, message: { date: 1792660000, text: '/stop', chat: { id: 1234, type: 'private' }, from: { id: 1234 } } });
    expect(state.disconnected).toBe(false);
  });
});

describe('Telegram persisted delivery worker', () => {
  it('rechecks opt-in after claiming and never sends to disconnected recipients', async () => {
    const { db, state } = fakeDatabase();
    state.rows = [{ id: 'one', status: 'pending', attempts: 0, optedIn: false }];
    let sent = 0;
    const result = await dispatchTelegramDeliveries(config, db, { fetcher: async () => { sent++; return Response.json({ ok: true, result: { message_id: 1 } }); } });
    expect(sent).toBe(0);
    expect(state.rows[0].status).toBe('cancelled');
    expect(result.cancelled).toBe(1);
  });

  it('persists Telegram acknowledgements and schedules rate-limited messages for later', async () => {
    const { db, state } = fakeDatabase();
    state.rows = [
      { id: 'one', status: 'pending', attempts: 0, optedIn: true, payload: { chatId: '1234', notification: { title: 'One' } } },
      { id: 'two', status: 'pending', attempts: 0, optedIn: true, payload: { chatId: '5678', notification: { title: 'Two' } } }
    ];
    const result = await dispatchTelegramDeliveries(config, db, {
      now: () => new Date('2026-10-22T12:00:00Z'),
      fetcher: async (_url, init) => JSON.parse(String(init?.body)).chat_id === '1234'
        ? Response.json({ ok: true, result: { message_id: 44 } })
        : Response.json({ ok: false, error_code: 429, parameters: { retry_after: 180 } }, { status: 429 })
    });
    expect(state.rows[0].status).toBe('sent');
    expect(state.rows[0].messageId).toBe('44');
    expect(state.rows[1].status).toBe('pending');
    expect(state.rows[1].next_attempt_at).toBe('2026-10-22T12:03:00.000Z');
    expect(result.sent).toBe(1);
    expect(result.retried).toBe(1);
  });
});
