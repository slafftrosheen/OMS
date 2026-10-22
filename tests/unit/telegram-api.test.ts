import { describe, it, expect } from 'vitest';
import { GET as status, POST as connect } from '../../src/routes/api/notifications/telegram/+server';
import { POST as webhook } from '../../src/routes/api/telegram/webhook/+server';
import { POST as dispatch } from '../../src/routes/api/telegram/dispatch/+server';

const environment = {
  TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: '123456:abcdefghijklmnopqrstuvwxyz_0123456789', TELEGRAM_BOT_USERNAME: 'OMS_notify_bot',
  TELEGRAM_WEBHOOK_SECRET: 's'.repeat(32), TELEGRAM_DELIVERY_SECRET: 'd'.repeat(32),
  PUBLIC_SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'server-only-fixture-key'
};

async function withRuntime(run: () => Promise<void>) {
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  Object.assign(process.env, environment);
  globalThis.fetch = async () => { throw new Error('Unexpected external request in Telegram API test'); };
  try { await run(); } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

function locals(active = true): any {
  const query: any = { select: () => query, eq: () => query, single: async () => ({ data: { is_active: active }, error: null }) };
  return { user: { id: '12345678-0000-0000-0000-000000000001' }, supabase: { from: () => query } };
}

describe('Telegram HTTP authorization boundaries', () => {
  it('rejects unsigned and inactive account access before exposing connection status', async () => {
    const unsigned = await status({ locals: { user: null } } as any);
    expect(unsigned.status).toBe(401);
    const inactive = await status({ locals: locals(false) } as any);
    expect(inactive.status).toBe(403);
    expect(inactive.headers.get('cache-control')).toBe('private, no-store');
  });

  it('returns a safe disabled state when no bot is configured', async () => {
    await withRuntime(async () => {
      process.env.TELEGRAM_ENABLED = 'false';
      const response = await status({ locals: locals() } as any);
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.configured).toBe(false);
      expect(body.available).toBe(false);
      expect(body.botUsername).toBe(null);
    });
  });

  it('binds a connection request to the authenticated user even if the body names another user', async () => {
    await withRuntime(async () => {
      let owner: string | null = null;
      globalThis.fetch = async (url, init) => {
        if (!String(url).endsWith('/rpc/prepare_telegram_link')) throw new Error('Unexpected database request');
        owner = JSON.parse(String(init?.body)).p_user_id;
        return Response.json('2099-01-01T00:00:00Z');
      };
      const response = await connect({ locals: locals(), request: new Request('https://oms.example.test/api/notifications/telegram', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'connect', userId: 'someone-else' })
      }) } as any);
      expect(response.status).toBe(200);
      expect(owner).toBe('12345678-0000-0000-0000-000000000001');
      const body = await response.json();
      expect(body.url.startsWith('https://t.me/OMS_notify_bot?start=')).toBe(true);
      expect(body.token_hash).toBe(undefined);
    });
  });

  it('requires the distinct webhook and scheduler secrets without making database or Telegram requests', async () => {
    await withRuntime(async () => {
      let requests = 0;
      globalThis.fetch = async () => { requests++; throw new Error('Must not fetch'); };
      const webhookResponse = await webhook({ request: new Request('https://oms.example.test/api/telegram/webhook', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': environment.TELEGRAM_DELIVERY_SECRET }, body: '{}'
      }) } as any);
      const dispatchResponse = await dispatch({ request: new Request('https://oms.example.test/api/telegram/dispatch', {
        method: 'POST', headers: { Authorization: `Bearer ${environment.TELEGRAM_WEBHOOK_SECRET}` }
      }) } as any);
      expect(webhookResponse.status).toBe(401);
      expect(dispatchResponse.status).toBe(401);
      expect(requests).toBe(0);
    });
  });

  it('passes only a token digest and validated Telegram identity to the atomic webhook processor', async () => {
    await withRuntime(async () => {
      let stored: any;
      globalThis.fetch = async (url, init) => {
        if (!String(url).endsWith('/rpc/process_telegram_update')) throw new Error('Unexpected database request');
        stored = JSON.parse(String(init?.body));
        return Response.json(true);
      };
      const response = await webhook({ request: new Request('https://oms.example.test/api/telegram/webhook', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': environment.TELEGRAM_WEBHOOK_SECRET },
        body: JSON.stringify({ update_id: 123, message: { date: 1792660000, text: `/start ${'a'.repeat(43)}`, chat: { type: 'private', id: 1234 }, from: { id: 1234, username: 'alice' } } })
      }) } as any);
      expect(response.status).toBe(200);
      expect(stored.p_chat_id).toBe('1234');
      expect(stored.p_telegram_user_id).toBe('1234');
      expect(stored.p_update_id).toBe(123);
      expect(stored.p_token_hash.length).toBe(64);
      expect(JSON.stringify(stored).includes('a'.repeat(43))).toBe(false);
    });
  });
});
