import { describe, it, expect } from 'vitest';
import {
  readTelegramConfig, createTelegramLinkToken, hashTelegramLinkToken,
  readTelegramCommand, matchesTelegramSecret, formatTelegramMessage,
  sendTelegramMessage, telegramRetryAt
} from '../../src/lib/server/notifications/telegram';

const readyEnv = {
  TELEGRAM_ENABLED: 'true',
  TELEGRAM_BOT_TOKEN: '123456789:abcdefghijklmnopqrstuvwxyz_0123456789',
  TELEGRAM_BOT_USERNAME: 'OMS_notifications_bot',
  TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(32),
  TELEGRAM_DELIVERY_SECRET: 'b'.repeat(32),
  PUBLIC_SUPABASE_URL: 'https://supabase.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key',
  PUBLIC_APP_URL: 'https://oms.example.test/oms'
};

describe('Telegram integration boundaries', () => {
  it('stays disabled until explicitly enabled with every server credential', () => {
    expect(readTelegramConfig({ ...readyEnv, TELEGRAM_ENABLED: 'false' })).toBe(null);
    expect(readTelegramConfig({ ...readyEnv, TELEGRAM_BOT_TOKEN: '' })).toBe(null);
    expect(readTelegramConfig({ ...readyEnv, TELEGRAM_WEBHOOK_SECRET: 'weak' })).toBe(null);
    expect(readTelegramConfig({ ...readyEnv, TELEGRAM_DELIVERY_SECRET: readyEnv.TELEGRAM_WEBHOOK_SECRET })).toBe(null);
    expect(readTelegramConfig(readyEnv)?.botUsername).toBe('OMS_notifications_bot');
  });

  it('creates URL-safe one-time tokens and stores only a one-way digest', () => {
    const first = createTelegramLinkToken();
    const second = createTelegramLinkToken();
    expect(/^[A-Za-z0-9_-]{43}$/.test(first)).toBe(true);
    expect(first === second).toBe(false);
    expect(hashTelegramLinkToken(first).length).toBe(64);
    expect(hashTelegramLinkToken(first)).toBe(hashTelegramLinkToken(first));
    expect(hashTelegramLinkToken(first) === first).toBe(false);
  });

  it('requires the private Telegram sender to own the destination chat', () => {
    const token = 'a'.repeat(43);
    const message = { text: `/start ${token}`, chat: { id: 1234, type: 'private' }, from: { id: 1234, is_bot: false, username: 'alice' } };
    expect(readTelegramCommand({ update_id: 1, message }, 'OMS_notifications_bot')).toEqual({
      kind: 'connect', token, chatId: '1234', telegramUserId: '1234', username: 'alice'
    });
    expect(readTelegramCommand({ message: { ...message, chat: { id: -1234, type: 'group' } } }, 'OMS_notifications_bot')).toBe(null);
    expect(readTelegramCommand({ message: { ...message, from: { id: 5678 } } }, 'OMS_notifications_bot')).toBe(null);
    expect(readTelegramCommand({ message: { ...message, from: { id: 1234, is_bot: true } } }, 'OMS_notifications_bot')).toBe(null);
    expect(readTelegramCommand({ message: { ...message, text: '/start short' } }, 'OMS_notifications_bot')).toBe(null);
    expect(readTelegramCommand({ message: { ...message, text: `/start@other_bot ${token}` } }, 'OMS_notifications_bot')).toBe(null);
    expect(readTelegramCommand({ message: { ...message, text: '/stop' } }, 'OMS_notifications_bot')?.kind).toBe('disconnect');
  });

  it('fails closed on missing or unequal secrets', () => {
    expect(matchesTelegramSecret('', '')).toBe(false);
    expect(matchesTelegramSecret('secret', 'different')).toBe(false);
    expect(matchesTelegramSecret('secret', 'secret')).toBe(true);
  });

  it('formats plain text within Telegram limits and keeps links on the configured application', () => {
    const message = formatTelegramMessage({ title: '<New order>', message: '😀'.repeat(5000), link: '/orders/one' }, 'https://oms.example.test/oms');
    expect(Array.from(message.text).length <= 4096).toBe(true);
    expect(message.text.length <= 4000).toBe(true);
    expect(Array.from(message.text).some(character => character.length === 1 && /[\uD800-\uDFFF]/.test(character))).toBe(false);
    expect(message.text.startsWith('<New order>')).toBe(true);
    expect(message.url).toBe('https://oms.example.test/oms/orders/one');
    expect(formatTelegramMessage({ title: 'Test', message: 'Body', link: '//attacker.example' }, 'https://oms.example.test').url).toBe(null);
    expect(formatTelegramMessage({ title: 'Test', message: 'Body', link: '/\\attacker.example' }, 'https://oms.example.test').url).toBe(null);
    expect(formatTelegramMessage({ title: 'Test', message: 'Body', link: 'https://attacker.example' }, 'https://oms.example.test').url).toBe(null);
  });
});

describe('Telegram delivery transport', () => {
  it('posts only to Telegram and sends plain text without exposing the token in result errors', async () => {
    let request: any;
    const config = readTelegramConfig(readyEnv)!;
    const result = await sendTelegramMessage(config, '1234', { title: 'Order confirmed', message: 'PO-12 ready', link: '/orders/12' }, {
      fetcher: async (url, init) => {
        request = { url: String(url), method: init?.method, body: JSON.parse(String(init?.body)) };
        return Response.json({ ok: true, result: { message_id: 52 } });
      }
    });
    expect(request.url).toBe(`https://api.telegram.org/bot${config.botToken}/sendMessage`);
    expect(request.method).toBe('POST');
    expect(request.body.chat_id).toBe('1234');
    expect(request.body.parse_mode).toBe(undefined);
    expect(request.body.reply_markup.inline_keyboard[0][0].url).toBe('https://oms.example.test/oms/orders/12');
    expect(result).toEqual({ status: 'sent', messageId: '52' });
  });

  it('honors Telegram rate limits and bounds retry delays', async () => {
    const result = await sendTelegramMessage(readTelegramConfig(readyEnv)!, '1234', { title: 'Update' }, {
      fetcher: async () => Response.json({ ok: false, error_code: 429, parameters: { retry_after: 125 } }, { status: 429 })
    });
    expect(result).toEqual({ status: 'retry', code: 'rate_limited', retryAfterSeconds: 125 });
    expect(telegramRetryAt(1, 125, new Date('2026-10-22T12:00:00Z'))).toBe('2026-10-22T12:02:05.000Z');
    expect(telegramRetryAt(99, Infinity, new Date('2026-10-22T12:00:00Z'))).toBe('2026-10-22T13:00:00.000Z');
  });

  it('stops blocked chats and retries provider outages without logging response bodies', async () => {
    const config = readTelegramConfig(readyEnv)!;
    expect(await sendTelegramMessage(config, '1234', { title: 'Update' }, {
      fetcher: async () => Response.json({ ok: false, error_code: 403, description: config.botToken }, { status: 403 })
    })).toEqual({ status: 'failed', code: 'blocked' });
    expect(await sendTelegramMessage(config, '1234', { title: 'Update' }, {
      fetcher: async () => new Response('gateway failed', { status: 502 })
    })).toEqual({ status: 'retry', code: 'unavailable' });
  });

  it('bounds stalled Telegram requests', async () => {
    const result = await sendTelegramMessage(readTelegramConfig(readyEnv)!, '1234', { title: 'Update' }, {
      timeoutMs: 5,
      fetcher: (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('timed out')), { once: true });
      })
    });
    expect(result).toEqual({ status: 'retry', code: 'transport_error' });
  });
});
