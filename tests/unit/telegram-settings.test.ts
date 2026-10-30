import { describe, it, expect } from 'vitest';
import { DEFAULT_TELEGRAM_OPTIONS } from '../../src/lib/notifications/telegram-options';
import { environmentTelegramSettings, normalizeTelegramSettingsInput, publicTelegramSettings, resolveTelegramSettings, telegramConfigFromSettings } from '../../src/lib/server/notifications/telegram-settings';
import { GET, PUT, POST, DELETE } from '../../src/routes/api/settings/telegram/+server';
import { GET as personalStatus, POST as personalConnect } from '../../src/routes/api/notifications/telegram/+server';
import { checkTelegramRuntimeFence, telegramSettingsGeneration } from '../../src/lib/server/notifications/telegram-runtime-fence';

const env = { TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: '123456:abcdefghijklmnopqrstuvwxyz_0123456789', TELEGRAM_BOT_USERNAME: 'OMS_notify_bot',
  TELEGRAM_WEBHOOK_SECRET: 's'.repeat(32), TELEGRAM_DELIVERY_SECRET: 'd'.repeat(32), PUBLIC_APP_URL: 'https://oms.example.test',
  PUBLIC_SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'server-only-fixture-key' };
const record = () => environmentTelegramSettings(env);
const actor = '12345678-0000-0000-0000-000000000001';
function locals(role = 'RD', active = true, actualRole = role): any {
  const query: any = { select: () => query, eq: () => query, single: async () => ({ data: { is_active: active, role: actualRole }, error: null }) };
  return { user: { id: actor, role }, supabase: { from: () => query } };
}
const request = (method: string, body?: unknown) => new Request('https://oms.example.test/api/settings/telegram', { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
async function runtime(run: (calls: Array<{url:string;body:any}>, setRecord: (value: any) => void) => Promise<void>) {
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]])); const oldFetch = globalThis.fetch;
  Object.assign(process.env, env); const calls: Array<{url:string;body:any}> = []; let saved: any = null;
  globalThis.fetch = async (input, init) => {
    const url = String(input); const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body });
    if (url.endsWith('/rpc/get_telegram_settings')) return Response.json(saved);
    if (url.endsWith('/rpc/telegram_admin_counts')) return Response.json({ connected: 3, pending: 2, failed: 1 });
    if (url.endsWith('/rpc/telegram_receiver_status')) return Response.json({ available: true, state: 'webhook' });
    if (url.endsWith('/rpc/claim_telegram_receiver')) return Response.json({ token: body.p_lease_token, offset: null, prepared: false, failures: 0 });
    if (url.endsWith('/rpc/renew_telegram_receiver') || url.endsWith('/rpc/release_telegram_receiver')) return Response.json(true);
    if (url.endsWith('/rpc/set_telegram_settings')) { saved = { options: body.p_options, botToken: body.p_bot_token, webhookSecret: body.p_webhook_secret, deliverySecret: body.p_delivery_secret }; return Response.json(null); }
    if (url.endsWith('/rpc/remove_telegram_credentials')) return Response.json(null);
    if (url.includes('/audit_log')) return Response.json(null);
    if (url.endsWith('/getMe')) return Response.json({ ok: true, result: { id: 123456, is_bot: true, username: 'OMS_notify_bot' } });
    if (url.endsWith('/getWebhookInfo')) return Response.json({ ok: true, result: { url: 'https://oms.example.test/api/telegram/webhook', pending_update_count: 0, last_error_message: env.TELEGRAM_BOT_TOKEN } });
    if (url.endsWith('/setWebhook') || url.endsWith('/setMyCommands') || url.endsWith('/deleteWebhook')) return Response.json({ ok: true, result: true });
    throw new Error('Unexpected test request');
  };
  try { await run(calls, value => { saved = value; }); } finally {
    globalThis.fetch = oldFetch;
    for (const [key,value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}

describe('Telegram R&D option contracts', () => {
  it('retains the authoritative revision in the server runtime without exposing its fingerprint in settings responses', async () => {
    const raw = { ...record(), revision: '2026-10-22T12:00:00.000001+00:00' };
    const resolved = resolveTelegramSettings(raw, env);
    const config = telegramConfigFromSettings(resolved, env)!;
    expect(config.settingsGeneration).toBe(telegramSettingsGeneration(raw));
    expect((await checkTelegramRuntimeFence(config, { rpc: async () => ({ data: raw, error: null }) } as any)).current).toBe(true);
    expect(JSON.stringify(publicTelegramSettings(resolved, true, env)).includes(config.settingsGeneration!)).toBe(false);
  });
  it('makes saved disable authoritative over an enabled legacy environment', () => {
    const current = record();
    const resolved = resolveTelegramSettings({ ...current, options: { ...current.options, enabled: false } }, env);
    expect(resolved.source).toBe('settings');
    expect(telegramConfigFromSettings(resolved, env)).toBe(null);
  });
  it('keeps existing write-only secrets when replacement fields are empty', () => {
    const current = record();
    const next = normalizeTelegramSettingsInput({ options: { ...current.options, batchSize: 3 }, botToken: '', webhookSecret: '', deliverySecret: '' }, current);
    expect(next.botToken).toBe(current.botToken);
    expect(next.webhookSecret).toBe(current.webhookSecret);
    expect(next.options.batchSize).toBe(3);
  });
  it('rejects incomplete enabled configuration, duplicate secrets and untrusted options', () => {
    const current = record();
    expect(() => normalizeTelegramSettingsInput({ options: { ...current.options, appUrl: 'http://127.0.0.1' } }, current)).toThrow();
    expect(() => normalizeTelegramSettingsInput({ options: current.options, deliverySecret: current.webhookSecret }, current)).toThrow();
    expect(() => normalizeTelegramSettingsInput({ options: { ...current.options, concurrency: 3 } }, current)).toThrow();
    expect(() => normalizeTelegramSettingsInput({ options: { ...current.options, timezone: 'not/a/timezone' } }, current)).toThrow();
    expect(() => normalizeTelegramSettingsInput({ options: current.options, arbitraryKey: 'bad' }, current)).toThrow();
    expect(() => normalizeTelegramSettingsInput({ options: { ...current.options, enabled: true } }, { ...current, botToken: '' })).toThrow();
  });
  it('never includes credentials or private connection identities in the administrator response', () => {
    const current = record(); const response = publicTelegramSettings(current, true, env);
    for (const secret of [current.botToken,current.webhookSecret,current.deliverySecret]) expect(JSON.stringify(response).includes(secret)).toBe(false);
    expect(response.credentials.botToken.configured).toBe(true);
    expect(response.webhookUrl).toBe('https://oms.example.test/api/telegram/webhook');
  });
});

describe('Telegram R&D settings HTTP authorization and provider actions', () => {
  it('rejects unsigned, non-RD, inactive and stale-RD sessions before reading secrets', async () => {
    await runtime(async calls => {
      expect((await GET({ locals: { user: null } } as any)).status).toBe(401);
      expect((await GET({ locals: locals('Boss') } as any)).status).toBe(403);
      expect((await PUT({ locals: locals('RD', false), request: request('PUT', {}) } as any)).status).toBe(403);
      expect((await DELETE({ locals: locals('RD', true, 'Operator') } as any)).status).toBe(403);
      expect(calls.length).toBe(0);
    });
  });
  it('reports masked credentials and queue counts without provider network calls', async () => {
    await runtime(async calls => {
      const response = await GET({ locals: locals() } as any); const body = await response.json();
      expect(response.status).toBe(200); expect(body.counts.connected).toBe(3);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(JSON.stringify(body).includes(env.TELEGRAM_BOT_TOKEN)).toBe(false);
      expect(calls.some(call => call.url.includes('api.telegram.org'))).toBe(false);
    });
  });
  it('imports environment credentials into Vault using the authenticated RD actor and prior bot identity', async () => {
    await runtime(async calls => {
      const response = await PUT({ locals: locals(), request: request('PUT', { options: { ...record().options, batchSize: 4 } }) } as any);
      expect(response.status).toBe(200);
      const saved = calls.find(call => call.url.endsWith('/rpc/set_telegram_settings'))!.body;
      expect(saved.p_actor).toBe(actor); expect(saved.p_previous_bot_id).toBe('123456');
      expect(saved.p_bot_token).toBe(env.TELEGRAM_BOT_TOKEN); expect(saved.p_options.botToken).toBe(undefined);
      expect(JSON.stringify(await response.json()).includes(env.TELEGRAM_BOT_TOKEN)).toBe(false);
    });
  });
  it('uses persisted disabled settings even while legacy environment remains enabled', async () => {
    await runtime(async (_calls,setRecord) => {
      const current=record(); setRecord({ ...current, options: { ...current.options, enabled: false } });
      const response=await personalStatus({ locals: locals('Operator') } as any);
      expect(response.status).toBe(200); expect((await response.json()).configured).toBe(false);
    });
  });
  it('reports an unavailable personal account and blocks connections during a settings outage', async () => {
    await runtime(async () => {
      globalThis.fetch=async()=>Response.json({ code:'08006', message:'Database unavailable' },{status:503});
      const response=await personalStatus({locals:locals('Operator')} as any);
      // Reading preferences remains a safe status response when Vault is down.
      // It must never resurrect the legacy enabled bot or fabricate account state.
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ configured:false, available:false, connected:false, enabled:false, botUsername:null });
      const connection=await personalConnect({locals:locals('Operator'),request:request('POST',{action:'connect'})} as any);
      expect(connection.status).toBe(503); expect((await connection.json()).code).toBe('settings_unavailable');
    });
  });
  it('registers only the saved application endpoint with its webhook secret and private command scopes', async () => {
    await runtime(async (calls,setRecord) => {
      const revision='2026-10-23T00:00:00.000001+00:00';
      setRecord({...record(),revision});
      const response=await POST({locals:locals(),request:request('POST',{action:'registerWebhook'})} as any);
      expect(response.status).toBe(200);
      const webhook=calls.find(call=>call.url.endsWith('/setWebhook'))!.body;
      expect(webhook.url).toBe('https://oms.example.test/api/telegram/webhook');
      expect(webhook.secret_token).toBe(env.TELEGRAM_WEBHOOK_SECRET);
      expect(webhook.allowed_updates).toEqual(['message','callback_query']);
      expect(webhook.drop_pending_updates).toBe(false);
      const transport=calls.filter(call=>/\/(?:claim_telegram_receiver|renew_telegram_receiver|release_telegram_receiver|setWebhook)$/.test(call.url));
      expect(transport.map(call=>call.url.split('/').pop())).toEqual(['claim_telegram_receiver','renew_telegram_receiver','setWebhook','release_telegram_receiver']);
      expect(transport[0].body.p_revision).toBe(revision);
      const menus=calls.filter(call=>call.url.endsWith('/setMyCommands'));
      expect(menus.length).toBe(4); expect(menus.every(call=>call.body.scope.type==='all_private_chats')).toBe(true);
      expect(menus[0].body.commands.some((command:any)=>command.command==='ask')).toBe(false);
    });
  });
  it('rejects untrusted action parameters and never returns raw provider errors', async () => {
    await runtime(async calls => {
      expect((await POST({locals:locals(),request:request('POST',{action:'registerWebhook',url:'https://other.test'})} as any)).status).toBe(400);
      expect(calls.length).toBe(0);
      const response=await POST({locals:locals(),request:request('POST',{action:'probe'})} as any);
      const body=await response.json(); expect(body.botMatches).toBe(true); expect(body.webhook.matches).toBe(true);
      expect(JSON.stringify(body).includes(env.TELEGRAM_BOT_TOKEN)).toBe(false);
    });
  });
});
