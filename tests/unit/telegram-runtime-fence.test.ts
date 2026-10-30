import { describe, expect, it } from 'vitest';
import { DEFAULT_TELEGRAM_OPTIONS } from '../../src/lib/notifications/telegram-options';
import { checkTelegramRuntimeFence, telegramSettingsGeneration } from '../../src/lib/server/notifications/telegram-runtime-fence';
import { dispatchTelegramDeliveries } from '../../src/lib/server/notifications/telegram-service';
import { dispatchTelegramBotReplies } from '../../src/lib/server/notifications/telegram-bot';
import type { TelegramConfig } from '../../src/lib/server/notifications/telegram';

const settings = () => ({ options: { ...DEFAULT_TELEGRAM_OPTIONS, enabled: true, aiEnabled: true,
  botUsername: 'OMS_notify_bot', appUrl: 'https://oms.example.test', concurrency: 1 },
  botToken: '123456:abcdefghijklmnopqrstuvwxyz', webhookSecret: 's'.repeat(32), deliverySecret: 'd'.repeat(32),
  revision: '2026-10-22T12:00:00.000001+00:00' });
const runtime = (row: ReturnType<typeof settings>): TelegramConfig => ({
  botToken: row.botToken, botUsername: row.options.botUsername, webhookSecret: row.webhookSecret,
  deliverySecret: row.deliverySecret, appUrl: row.options.appUrl, options: row.options,
  settingsGeneration: telegramSettingsGeneration(row)
});

function database(initial = settings()) {
  const state: any = { settings: structuredClone(initial), status: 'pending', attempts: 4, calls: [],
    payload: { kind: 'ask', locale: 'en', question: 'What is due?', orders: [] }, metadataRead: null };
  const db: any = { rpc: async (name: string, args: any) => {
    state.calls.push(name);
    if (name === 'get_telegram_settings') return { data: state.settings, error: state.settingsError ?? null };
    if (name === 'claim_telegram_deliveries' || name === 'claim_telegram_bot_replies') {
      if (state.status !== 'pending') return { data: [], error: null };
      state.status = 'processing'; state.attempts++;
      return { data: [{ id: 'job', claim_token: 'lease', attempts: state.attempts }], error: null };
    }
    if (name === 'release_telegram_runtime_claim') {
      if (state.status !== 'processing' || args.p_claim_token !== 'lease') return { data: false, error: null };
      state.status = 'pending'; state.attempts--; return { data: true, error: null };
    }
    if (name === 'telegram_delivery_payload') {
      state.metadataRead?.();
      return { data: { chatId: '1234', notification: { title: 'Order ready' } }, error: null };
    }
    if (name === 'telegram_bot_reply_payload') return { data: { chatId: '1234', payload: state.payload }, error: null };
    if (name === 'prepare_telegram_bot_reply') {
      state.payload = { kind: 'ask', locale: 'en', rendered: args.p_text, keyboard: args.p_keyboard };
      return { data: true, error: null };
    }
    if (name === 'finish_telegram_delivery' || name === 'finish_telegram_bot_reply') {
      state.status = args.p_status; return { data: true, error: null };
    }
    throw new Error('Unexpected RPC');
  } };
  return { db, state };
}

describe('Telegram authoritative runtime generations', () => {
  it('checks full secrets and settings revision before either dispatcher claims new work', async () => {
    for (const change of [
      (row: any) => { row.botToken = '987654:abcdefghijklmnopqrstuvwxyz'; },
      (row: any) => { row.botToken = '123456:ZYXWVUTSRQPONMLKJIHGFEDCBA'; },
      (row: any) => { row.revision = '2026-10-22T12:01:00.000001+00:00'; },
      (row: any) => { row.options.enabled = false; }
    ]) {
      const initial = settings(); const config = runtime(initial); const { db, state } = database(initial);
      change(state.settings);
      let sent = 0; const fetcher = async () => { sent++; return Response.json({ ok: true, result: { message_id: 1 } }); };
      expect((await dispatchTelegramDeliveries(config, db, { fetcher })).claimed).toBe(0);
      expect((await dispatchTelegramBotReplies(config, db, { fetcher })).claimed).toBe(0);
      expect(state.calls.some((name: string) => name.startsWith('claim_'))).toBe(false);
      expect(state.attempts).toBe(4); expect(sent).toBe(0);
    }
  });

  it('releases a same-bot token race after payload lookup without spending the final attempt', async () => {
    const initial = settings(); const config = runtime(initial); const { db, state } = database(initial);
    state.metadataRead = () => { state.settings.botToken = '123456:ZYXWVUTSRQPONMLKJIHGFEDCBA'; };
    let sent = 0;
    await dispatchTelegramDeliveries(config, db, { fetcher: async () => { sent++; return Response.json({ ok: true, result: { message_id: 1 } }); } });
    expect(sent).toBe(0); expect(state.status).toBe('pending'); expect(state.attempts).toBe(4);
    expect(state.calls).toContain('release_telegram_runtime_claim');
    expect(state.calls).not.toContain('finish_telegram_delivery');
    state.metadataRead = null;
    await dispatchTelegramDeliveries(runtime(state.settings), db, { fetcher: async () => { sent++; return Response.json({ ok: true, result: { message_id: 1 } }); } });
    expect(sent).toBe(1); expect(state.status).toBe('sent');
  });

  it('fences rotation during slow inference and delivers the prepared answer with the new runtime', async () => {
    const initial = settings(); const config = runtime(initial); const { db, state } = database(initial);
    // Inference requires the account's explicit consent as well as the company switch.
    state.payload.personalAiAllowed = true;
    let inference = 0; const sends: string[] = [];
    const complete: any = async () => { inference++; state.settings.botToken = '123456:ZYXWVUTSRQPONMLKJIHGFEDCBA'; return 'One order is due today.'; };
    const fetcher: typeof fetch = async input => { sends.push(String(input)); return Response.json({ ok: true, result: { message_id: 1 } }); };
    await dispatchTelegramBotReplies(config, db, { complete, fetcher });
    expect(sends).toEqual([]); expect(state.status).toBe('pending'); expect(state.attempts).toBe(4);
    expect(state.payload.question).toBe(undefined); expect(state.payload.rendered).toContain('One order');
    await dispatchTelegramBotReplies(runtime(state.settings), db, { complete, fetcher });
    expect(inference).toBe(1); expect(sends).toHaveLength(1);
    expect(sends[0]).toContain(state.settings.botToken); expect(state.status).toBe('sent');
  });

  it('does not permanently fail either outbox when credentials rotate during a rejected provider request', async () => {
    for (const dispatch of [dispatchTelegramDeliveries, dispatchTelegramBotReplies]) {
      const initial = settings(); const config = runtime(initial); const { db, state } = database(initial);
      state.payload = { kind: 'help', locale: 'en' };
      let sends = 0;
      await dispatch(config, db, { fetcher: async () => {
        sends++; state.settings.botToken = '123456:ZYXWVUTSRQPONMLKJIHGFEDCBA';
        return Response.json({ ok: false, error_code: 401 }, { status: 401 });
      } });
      expect(sends).toBe(1); expect(state.status).toBe('pending'); expect(state.attempts).toBe(4);
      expect(state.calls.some((name: string) => name.startsWith('finish_'))).toBe(false);
      await dispatch(runtime(state.settings), db, { fetcher: async () => {
        sends++; return Response.json({ ok: true, result: { message_id: 1 } });
      } });
      expect(sends).toBe(2); expect(state.status).toBe('sent');
    }
  });

  it('keeps a successful provider acknowledgement when rotation happens during the request', async () => {
    for (const dispatch of [dispatchTelegramDeliveries, dispatchTelegramBotReplies]) {
      const initial = settings(); const config = runtime(initial); const { db, state } = database(initial);
      state.payload = { kind: 'help', locale: 'en' };
      await dispatch(config, db, { fetcher: async () => {
        state.settings.botToken = '123456:ZYXWVUTSRQPONMLKJIHGFEDCBA';
        return Response.json({ ok: true, result: { message_id: 1 } });
      } });
      expect(state.status).toBe('sent'); expect(state.attempts).toBe(5);
      expect(state.calls).not.toContain('release_telegram_runtime_claim');
    }
  });

  it('fails closed on a settings outage and cannot revive a cancelled lease', async () => {
    const initial = settings(); const config = runtime(initial); const { db, state } = database(initial);
    state.settingsError = { code: '08006' }; state.status = 'cancelled';
    const result = await checkTelegramRuntimeFence(config, db, { id: 'job', token: 'lease', queue: 'reply' });
    expect(result.current).toBe(false); expect(result.errors).toBe(1); expect(result.released).toBe(false);
    expect(state.status).toBe('cancelled'); expect(state.attempts).toBe(4);
  });

  it('keeps legacy mode only while there are no authoritative persisted settings', async () => {
    const { db, state } = database(); const legacy = { ...runtime(settings()), settingsGeneration: 'environment' };
    expect((await checkTelegramRuntimeFence(legacy, db)).current).toBe(false);
    state.settings = null;
    expect((await checkTelegramRuntimeFence(legacy, db)).current).toBe(true);
    state.settingsError = { code: 'PGRST202' };
    expect((await checkTelegramRuntimeFence(legacy, db)).current).toBe(true);
    expect((await checkTelegramRuntimeFence(runtime(settings()), db)).current).toBe(false);
    state.settingsError = { code: '08006' };
    expect((await checkTelegramRuntimeFence(legacy, db)).current).toBe(false);
  });
});
