import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { getTelegramUpdates, runTelegramPollingCycle } from '../../src/lib/server/notifications/telegram-polling';
import { DEFAULT_TELEGRAM_OPTIONS } from '../../src/lib/notifications/telegram-options';
import type { TelegramConfig } from '../../src/lib/server/notifications/telegram';

const config: TelegramConfig = {
  botToken: '123456:' + 'x'.repeat(30), botUsername: 'oms_test_bot', webhookSecret: '', deliverySecret: '', appUrl: null,
  settingsRevision: '2026-10-23T08:00:00.000Z',
  options: { ...DEFAULT_TELEGRAM_OPTIONS, enabled: true, connectionMode: 'polling', pollingTimeoutSeconds: 25 }
};
const update = (id: number, text = '/today') => ({ update_id: id, message: {
  date: Math.floor(Date.now() / 1000), text, chat: { id: 42, type: 'private' }, from: { id: 42, is_bot: false }
} });
const ok = (result: unknown) => new Response(JSON.stringify({ ok: true, result }), { status: 200 });
const provider = (fn: (url: string, init: RequestInit) => Response | Promise<Response>): typeof fetch =>
  ((url: unknown, init: RequestInit) => Promise.resolve(fn(String(url), init))) as typeof fetch;
function database(overrides: Record<string, (args: any) => any> = {}) {
  const calls: { name: string; args: any }[] = [];
  const db = { async rpc(name: string, args?: any) {
    calls.push({ name, args });
    if (overrides[name]) return overrides[name](args);
    if (name === 'claim_telegram_receiver') return { data: { token: args.p_lease_token, offset: 101, prepared: true, failures: 0 }, error: null };
    if (name === 'process_telegram_polled_update') return { data: { accepted: true, nextOffset: args.p_update_id + 1 }, error: null };
    return { data: true, error: null };
  } };
  return { db, calls };
}

describe('Telegram long-poll transport', () => {
  it('uses a positive wait, durable offset and only message/callback updates', async () => {
    let body: any;
    const result = await getTelegramUpdates(config, 101, {
      fetcher: provider((url, init) => { assert.ok(url.endsWith('/getUpdates')); body = JSON.parse(String(init.body)); return ok([update(101)]); })
    });
    assert.equal(result.length, 1);
    assert.deepEqual(body, { offset: 101, timeout: 25, limit: 25, allowed_updates: ['message', 'callback_query'] });
  });
  it('omits the offset for a new receiver or an idle-week reset', async () => {
    await getTelegramUpdates(config, null, { fetcher: provider((_url, init) => {
      assert.equal('offset' in JSON.parse(String(init.body)), false); return ok([]);
    }) });
  });
  it('rejects invalid batches before any checkpoint can skip an update', async () => {
    for (const items of [[update(-1)], [update(Number.MAX_SAFE_INTEGER)], [update(101), update(101)], {}, [update(100)]]) {
      await assert.rejects(getTelegramUpdates(config, 101, { fetcher: provider(() => ok(items)) }), /invalid_response/);
    }
  });
  it('orders a valid batch before processing', async () => {
    const result = await getTelegramUpdates(config, 101, { fetcher: provider(() => ok([update(103), update(101), update(102)])) });
    assert.deepEqual(result.map(item => item.update_id), [101, 102, 103]);
  });
  it('honors retry_after and never exposes provider descriptions', async () => {
    await assert.rejects(getTelegramUpdates(config, 101, { fetcher: provider(() => new Response(JSON.stringify({
      ok: false, error_code: 429, description: config.botToken, parameters: { retry_after: 75 }
    }), { status: 429 })) }), (error: any) => {
      assert.equal(error.code, 'rate_limited'); assert.equal(error.retryAfterSeconds, 75);
      assert.ok(!String(error).includes(config.botToken)); return true;
    });
  });
  it('reports conflicts without treating them as an empty successful poll', async () => {
    await assert.rejects(getTelegramUpdates(config, 101, { fetcher: provider(() => new Response('{"ok":false,"error_code":409}', { status: 409 })) }), /receiver_conflict/);
  });
  it('does not contact Telegram when already cancelled', async () => {
    const controller = new AbortController(); controller.abort(); let calls = 0;
    await assert.rejects(getTelegramUpdates(config, null, { signal: controller.signal, fetcher: provider(() => { calls++; return ok([]); }) }), /cancelled/);
    assert.equal(calls, 0);
  });
});

describe('fenced Telegram polling cycle', () => {
  it('does not poll if another receiver owns the lease', async () => {
    const { db, calls } = database({ claim_telegram_receiver: () => ({ data: null, error: null }) }); let requests = 0;
    await runTelegramPollingCycle(config, db, { fetcher: provider(() => { requests++; return ok([]); }) });
    assert.equal(requests, 0); assert.equal(calls.length, 1);
  });
  it('fails closed when the lease store is unavailable', async () => {
    const { db } = database({ claim_telegram_receiver: () => ({ data: null, error: { code: 'PGRST202' } }) }); let requests = 0;
    await runTelegramPollingCycle(config, db, { fetcher: provider(() => { requests++; return ok([]); }) });
    assert.equal(requests, 0);
  });
  it('removes a webhook without dropping updates before the first poll', async () => {
    const { db, calls } = database({ claim_telegram_receiver: args => ({ data: { token: args.p_lease_token, offset: null, prepared: false, failures: 0 }, error: null }) });
    const methods: string[] = [];
    await runTelegramPollingCycle(config, db, { fetcher: provider((url, init) => {
      const method = url.split('/').pop()!; methods.push(method);
      if (method === 'getMe') return ok({ id: 123456, is_bot: true, username: 'oms_test_bot' });
      if (method === 'deleteWebhook') { assert.deepEqual(JSON.parse(String(init.body)), { drop_pending_updates: false }); return ok(true); }
      return ok([]);
    }) });
    assert.deepEqual(methods, ['getMe', 'deleteWebhook', 'getUpdates']);
    assert.ok(calls.some(call => call.name === 'prepare_telegram_receiver'));
    assert.equal(calls.at(-1)?.name, 'release_telegram_receiver');
  });
  it('commits updates sequentially and stops on the first persistence failure', async () => {
    const { db, calls } = database({ process_telegram_polled_update: args => args.p_update_id === 102
      ? { data: null, error: { code: '08006' } } : { data: { accepted: true, nextOffset: 102 }, error: null } });
    await runTelegramPollingCycle(config, db, { fetcher: provider(() => ok([update(101), update(102), update(103)])) });
    const processed = calls.filter(call => call.name === 'process_telegram_polled_update');
    assert.deepEqual(processed.map(call => call.args.p_update_id), [101, 102]);
    assert.ok(calls.some(call => call.name === 'record_telegram_receiver_poll' && call.args.p_error === 'database_unavailable'));
    assert.equal(calls.at(-1)?.name, 'release_telegram_receiver');
  });
  it('ignores unsupported or untrusted updates without leaving them at the head of the queue', async () => {
    const { db, calls } = database(); const forwarded = update(102); (forwarded.message as any).forward_origin = { type: 'user' };
    await runTelegramPollingCycle(config, db, { fetcher: provider(() => ok([{ update_id: 101, edited_message: {} }, forwarded])) });
    const processed = calls.filter(call => call.name === 'process_telegram_polled_update');
    assert.equal(processed.length, 2); assert.ok(processed.every(call => call.args.p_action === null));
  });
  it('uses the existing linked-account parser and hashes connection tokens before persistence', async () => {
    const { db, calls } = database(); const token = 'a'.repeat(43);
    await runTelegramPollingCycle(config, db, { fetcher: provider(() => ok([update(101, '/start ' + token)])) });
    const args = calls.find(call => call.name === 'process_telegram_polled_update')?.args;
    assert.equal(args?.p_action, 'connect'); assert.match(args.p_token_hash, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(calls).includes(token)); assert.ok(!JSON.stringify(calls).includes(config.botToken));
  });
  it('does not delete webhooks repeatedly after a transport conflict', async () => {
    const { db, calls } = database(); const methods: string[] = [];
    await runTelegramPollingCycle(config, db, { fetcher: provider(url => {
      methods.push(url.split('/').pop()!); return new Response('{"ok":false,"error_code":409}', { status: 409 });
    }) });
    assert.deepEqual(methods, ['getUpdates']);
    assert.ok(calls.some(call => call.name === 'record_telegram_receiver_poll' && call.args.p_error === 'receiver_conflict' && call.args.p_retry_seconds >= 60));
  });
  it('never applies a batch after configuration changes during the request', async () => {
    let active = true; const { db, calls } = database({ renew_telegram_receiver: () => ({ data: active, error: null }) });
    await runTelegramPollingCycle(config, db, { fetcher: provider(() => { active = false; return ok([update(101)]); }) });
    assert.equal(calls.filter(call => call.name === 'process_telegram_polled_update').length, 0);
  });
  it('does not start in webhook mode or without persisted R&D settings', async () => {
    for (const input of [{ ...config, options: { ...config.options!, connectionMode: 'webhook' as const } }, { ...config, settingsRevision: undefined }]) {
      const { db, calls } = database();
      await runTelegramPollingCycle(input, db, { fetcher: provider(() => { throw new Error('must not call'); }) });
      assert.equal(calls.length, 0);
    }
  });
  it('aborts a pending long poll when a heartbeat loses the lease', async () => {
    let renewals = 0;
    const { db, calls } = database({ renew_telegram_receiver: () => ({ data: ++renewals < 2, error: null }) });
    let aborted = false;
    const fetcher = provider((_url, init) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
    }));
    const keepAlive = setTimeout(() => {}, 1000);
    try { await runTelegramPollingCycle(config, db, { fetcher, heartbeatMs: 5 }); }
    finally { clearTimeout(keepAlive); }
    assert.equal(aborted, true); assert.equal(calls.at(-1)?.name, 'release_telegram_receiver');
  });
});


describe('polling preparation and privacy regressions', () => {
  it('does not delete a webhook or poll when the bot identity is wrong', async () => {
    const { db, calls } = database({ claim_telegram_receiver: args => ({ data: { token: args.p_lease_token, offset: null, prepared: false, failures: 0 }, error: null }) });
    const methods: string[] = [];
    await runTelegramPollingCycle(config, db, { fetcher: provider(url => { methods.push(url.split('/').pop()!); return ok({ id: 999, is_bot: true, username: 'other_bot' }); }) });
    assert.deepEqual(methods, ['getMe']);
    assert.ok(calls.some(x => x.name === 'record_telegram_receiver_poll' && x.args.p_error === 'bot_mismatch'));
  });
  it('does not poll or mark setup complete when webhook removal fails', async () => {
    const { db, calls } = database({ claim_telegram_receiver: args => ({ data: { token: args.p_lease_token, offset: null, prepared: false, failures: 0 }, error: null }) });
    const methods: string[] = [];
    await runTelegramPollingCycle(config, db, { fetcher: provider(url => {
      const method = url.split('/').pop()!; methods.push(method);
      return method === 'getMe' ? ok({ id: 123456, is_bot: true, username: 'oms_test_bot' }) : new Response('{"ok":false,"error_code":500}', { status: 500 });
    }) });
    assert.deepEqual(methods, ['getMe', 'deleteWebhook']);
    assert.equal(calls.some(x => x.name === 'prepare_telegram_receiver'), false);
  });
  it('treats an empty poll as healthy without manufacturing an update checkpoint', async () => {
    const { db, calls } = database();
    await runTelegramPollingCycle(config, db, { fetcher: provider(() => ok([])) });
    assert.equal(calls.some(x => x.name === 'process_telegram_polled_update'), false);
    assert.ok(calls.some(x => x.name === 'record_telegram_receiver_poll' && x.args.p_error === null));
  });
  it('preserves linking while ordinary commands are disabled', async () => {
    const { db, calls } = database();
    await runTelegramPollingCycle({ ...config, options: { ...config.options!, commandsEnabled: false } }, db, {
      fetcher: provider(() => ok([update(101, '/today'), update(102, '/start ' + 'a'.repeat(43)), update(103, '/stop')]))
    });
    assert.deepEqual(calls.filter(x => x.name === 'process_telegram_polled_update').map(x => x.args.p_action), [null, 'connect', 'disconnect']);
  });
  it('rejects excessive provider payloads', async () => {
    await assert.rejects(getTelegramUpdates(config, null, { fetcher: provider(() => new Response('{}', { headers: { 'content-length': '5000000' } })) }), /invalid_response/);
  });
  it('does not copy token-bearing network exceptions into errors or diagnostics', async () => {
    await assert.rejects(getTelegramUpdates(config, null, { fetcher: provider(() => { throw new Error('failed URL bot' + config.botToken); }) }), (error: any) => {
      assert.equal(error.code, 'transport_error'); assert.equal(String(error).includes(config.botToken), false); return true;
    });
  });
});
