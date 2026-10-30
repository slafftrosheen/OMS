import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readTelegramConfig } from '../../src/lib/server/notifications/telegram';

const env = {
  TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: '123456:' + 'x'.repeat(30), TELEGRAM_BOT_USERNAME: 'oms_test_bot',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only', PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8000'
};

describe('private Telegram configuration', () => {
  it('accepts polling without public OMS address or webhook/scheduler secrets', () => {
    const config = readTelegramConfig(env, 'polling');
    assert.ok(config);
    assert.equal(config.appUrl, null);
    assert.equal(config.webhookSecret, '');
    assert.equal(config.deliverySecret, '');
  });
  it('retains a private Tailscale address in phone links', () => {
    const config = readTelegramConfig({ ...env, PUBLIC_APP_URL: 'http://100.101.102.103:3000/oms' }, 'polling');
    assert.equal(config?.appUrl, 'http://100.101.102.103:3000/oms');
  });
  it('keeps webhook authentication mandatory in the legacy mode', () => {
    assert.equal(readTelegramConfig(env), null);
    assert.ok(readTelegramConfig({ ...env, TELEGRAM_WEBHOOK_SECRET: 'w'.repeat(32), TELEGRAM_DELIVERY_SECRET: 'd'.repeat(32) }));
  });
  it('rejects malformed optional secrets and identical nonempty secrets', () => {
    assert.equal(readTelegramConfig({ ...env, TELEGRAM_WEBHOOK_SECRET: 'bad' }, 'polling'), null);
    assert.equal(readTelegramConfig({ ...env, TELEGRAM_DELIVERY_SECRET: 'bad' }, 'polling'), null);
    assert.equal(readTelegramConfig({ ...env, TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(32), TELEGRAM_DELIVERY_SECRET: 'a'.repeat(32) }, 'polling'), null);
  });
  it('never enables a disabled bot or accepts a missing database credential', () => {
    assert.equal(readTelegramConfig({ ...env, TELEGRAM_ENABLED: 'false' }, 'polling'), null);
    assert.equal(readTelegramConfig({ ...env, SUPABASE_SERVICE_ROLE_KEY: '' }, 'polling'), null);
    assert.equal(readTelegramConfig({ ...env, TELEGRAM_BOT_TOKEN: 'invalid' }, 'polling'), null);
  });
});
