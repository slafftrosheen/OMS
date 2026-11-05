import { describe, it, expect } from 'vitest';
import { telegramCallbackQueryId } from '../../src/lib/server/notifications/telegram';
import { readTelegramWebhookBody, TelegramWebhookBodyError } from '../../src/lib/server/notifications/telegram-body';
import { readFileSync } from 'node:fs';

const privateUpdate = (data = 'oms:today') => ({
  update_id: 455, callback_query: {
    id: '440001199223', from: { id: 12345, is_bot: false },
    message: { chat: { type: 'private', id: 12345 } }, data
  }
});
describe('Telegram callback acknowledgement', () => {
  it('recognizes private callbacks even when their command is disabled or unknown', () => {
    expect(telegramCallbackQueryId(privateUpdate())).toBe('440001199223');
    expect(telegramCallbackQueryId(privateUpdate('oms:unknown_action'))).toBe('440001199223');
  });
  it('rejects group chats, inconsistent users and malformed callback IDs', () => {
    const wrong = structuredClone(privateUpdate());
    wrong.callback_query.message.chat.type = 'group';
    expect(telegramCallbackQueryId(wrong)).toBeNull();
    const spoofed = structuredClone(privateUpdate());
    spoofed.callback_query.from.id = 999;
    expect(telegramCallbackQueryId(spoofed)).toBeNull();
    const invalid = structuredClone(privateUpdate());
    invalid.callback_query.id = '\\n';
    expect(telegramCallbackQueryId(invalid)).toBeNull();
  });
  it('acknowledges filtered updates in webhook and durable polling paths', () => {
    const handler = readFileSync('src/lib/server/notifications/telegram-service.ts','utf8');
    const poll = readFileSync('src/lib/server/notifications/telegram-polling.ts','utf8');
    expect(handler).toContain("if (callbackId) await telegramApi(config, 'answerCallbackQuery'");
    expect(poll).toContain("if (callbackId && !signal.aborted)");
    expect(poll).toContain("if (result?.accepted !== true)");
  });
});
describe('Telegram webhook payload streaming bound', () => {
  const request = (text: string, headers?: HeadersInit) => new Request('https://example.test/api/telegram/webhook', {
    method: 'POST', headers, body: text
  });
  it('parses a valid small JSON update', async () => {
    expect(await readTelegramWebhookBody(request('{"update_id":1}'))).toEqual({ update_id: 1 });
  });
  it('accepts a valid numeric content-length header', async () => {
    const body = '{"update_id":123}';
    expect(await readTelegramWebhookBody(request(body, { 'content-length': String(body.length) }))).toEqual({ update_id: 123 });
  });
  it('rejects invalid JSON and invalid UTF8', async () => {
    await expect(readTelegramWebhookBody(request('not-json'))).rejects.toThrow(TelegramWebhookBodyError);
  });
  it('rejects a declared oversize payload without buffering it', async () => {
    await expect(readTelegramWebhookBody(request('{}', { 'content-length': '65537' }))).rejects.toThrow(TelegramWebhookBodyError);
  });
  it('rejects chunked bodies that exceed the cap', async () => {
    await expect(readTelegramWebhookBody(request(' '.repeat(65700)))).rejects.toThrow(TelegramWebhookBodyError);
  });
});
