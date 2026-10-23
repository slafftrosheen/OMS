import { describe, it, expect } from 'vitest';
import { GET as status, POST as connect, PATCH as setEnabled } from '../../src/routes/api/notifications/telegram/+server';
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
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/rpc/get_telegram_settings')) return Response.json(null);
    throw new Error('Unexpected external request in Telegram API test');
  };
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
  it('rejects absent or malformed machine credentials without opening settings or queue connections', async () => {
    await withRuntime(async () => {
      let calls = 0;
      globalThis.fetch = async () => { calls++; throw new Error('Must not contact settings or providers'); };
      for (const secret of ['', 'short', 's'.repeat(257)]) {
        const webhookResponse = await webhook({ request: new Request('https://oms.example.test/api/telegram/webhook', {
          method: 'POST', headers: secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}, body: '{}'
        }) } as any);
        const dispatchResponse = await dispatch({ request: new Request('https://oms.example.test/api/telegram/dispatch', {
          method: 'POST', headers: secret ? { Authorization: `Bearer ${secret}` } : {}
        }) } as any);
        expect(webhookResponse.status).toBe(401);
        expect(dispatchResponse.status).toBe(401);
      }
      expect(calls).toBe(0);
    });
  });

  it('returns fresh personal connection status with a successful pause without requiring another request', async () => {
    await withRuntime(async () => {
      let owner: string | undefined;
      let enabled = true;
      const calls: string[] = [];
      globalThis.fetch = async (url, init) => {
        const path = new URL(String(url)).pathname; calls.push(path);
        if (path.endsWith('/rpc/get_telegram_settings')) return Response.json(null);
        if (path.endsWith('/rpc/set_telegram_enabled')) {
          const body = JSON.parse(String(init?.body)); owner = body.p_user_id; enabled = body.p_enabled;
          return Response.json(true);
        }
        if (path.endsWith('/telegram_connections')) return Response.json({ username: 'my_phone', enabled, linked_at: '2026-10-22T12:00:00Z' });
        if (path.endsWith('/telegram_link_tokens')) return Response.json(null);
        throw new Error('Unexpected database request');
      };
      const response = await setEnabled({ locals: locals(), request: new Request('https://oms.example.test/api/notifications/telegram', {
        method: 'PATCH', body: JSON.stringify({ enabled: false })
      }) } as any);
      expect(response.status).toBe(200);
      expect(owner).toBe(locals().user.id);
      expect(await response.json()).toMatchObject({ success: true, status: { available: true, connected: true, enabled: false, username: 'my_phone' } });
      expect(calls.filter(path => path.endsWith('/rpc/get_telegram_settings'))).toHaveLength(1);
    });
  });

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
        if (String(url).endsWith('/rpc/get_telegram_settings')) return Response.json(null);
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

  it('requires distinct persisted webhook and scheduler secrets before reading accounts or calling Telegram', async () => {
    await withRuntime(async () => {
      let requests = 0;
      globalThis.fetch = async (url) => {
        if (String(url).endsWith('/rpc/get_telegram_settings')) return Response.json(null);
        requests++; throw new Error('Must not fetch account data or Telegram');
      };
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
        if (String(url).endsWith('/rpc/get_telegram_settings')) return Response.json(null);
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
