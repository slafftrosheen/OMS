import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readTelegramReceiverStatus, withTelegramWebhookLease } from '../../src/lib/server/notifications/telegram-receiver-admin';
import type { TelegramConfig } from '../../src/lib/server/notifications/telegram';
const config = { botToken: '123456:abcdefghijklmnopqrstuvwxyz_0123456789', settingsRevision: '2026-10-23T00:00:00Z', options: { connectionMode: 'webhook' } } as TelegramConfig;
describe('Telegram receiver administration', () => {
  it('returns only public health fields and does not expose unexpected RPC data', async () => {
    const status = await readTelegramReceiverStatus({ rpc: async () => ({ error: null, data: { available: true, state: 'polling', botToken: 'secret', chatId: '123', lastPollAt: '2026-10-23T00:00:00Z', lastError: 'provider secret' } }) });
    assert.equal(status.state, 'polling'); assert.equal(status.lastError, null);
    assert.equal('botToken' in status, false); assert.equal('chatId' in status, false);
  });
  it('reports unavailable health on missing migration or database failure', async () => {
    assert.equal((await readTelegramReceiverStatus({ rpc: async () => ({ data: null, error: { code: 'PGRST202' } }) })).available, false);
    assert.equal((await readTelegramReceiverStatus({ rpc: async () => { throw Error('private connection details'); } })).state, 'unavailable');
  });
  it('never calls Telegram when another process owns the receiver', async () => {
    let calls = 0;
    await assert.rejects(() => withTelegramWebhookLease(config, { rpc: async () => ({ data: null, error: null }) }, async () => { calls++; }), /receiver_conflict/);
    assert.equal(calls, 0);
  });
  it('rejects webhook actions in polling mode without acquiring a lease', async () => {
    let calls = 0;
    await assert.rejects(() => withTelegramWebhookLease({ ...config, options: { ...config.options!, connectionMode: 'polling' } }, { rpc: async () => { calls++; return { data: null, error: null }; } }, async () => {}), /runtime_changed/);
    assert.equal(calls, 0);
  });
  it('renews and releases the shared lease even when a provider action fails', async () => {
    const names: string[] = [];
    const db = { rpc: async (name: string, args?: Record<string, unknown>) => {
      names.push(name);
      return { error: null, data: name === 'claim_telegram_receiver' ? { token: args!.p_lease_token, offset: null, prepared: false, failures: 0 } : true };
    } };
    await assert.rejects(() => withTelegramWebhookLease(config, db, async () => { throw Error('provider failure'); }), /provider failure/);
    assert.deepEqual(names, ['claim_telegram_receiver', 'renew_telegram_receiver', 'release_telegram_receiver']);
  });
  it('does not call the provider when configuration changes after claiming', async () => {
    let called = false; let released = false;
    const db = { rpc: async (name: string, args?: Record<string, unknown>) => {
      if (name === 'release_telegram_receiver') released = true;
      return { error: null, data: name === 'claim_telegram_receiver' ? { token: args!.p_lease_token, offset: null, prepared: false, failures: 0 } : false };
    } };
    await assert.rejects(() => withTelegramWebhookLease(config, db, async () => { called = true; }), /runtime_changed/);
    assert.equal(called, false); assert.equal(released, true);
  });
});
