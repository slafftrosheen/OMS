import { json, type RequestHandler } from '@sveltejs/kit';
import { getTelegramSettings, telegramEnvironment } from '$lib/server/notifications/telegram-runtime';
import { normalizeTelegramSettingsInput, publicTelegramSettings, telegramConfigFromSettings } from '$lib/server/notifications/telegram-settings';
import { TelegramServiceError, dispatchTelegramDeliveries } from '$lib/server/notifications/telegram-service';
import { telegramErrorResponse, telegramPrivateHeaders } from '$lib/server/notifications/telegram-http';
import { telegramApi } from '$lib/server/notifications/telegram';
import { dispatchTelegramBotReplies, telegramCommandMenu } from '$lib/server/notifications/telegram-bot';

async function requireAdmin(locals: App.Locals): Promise<string> {
  if (!locals.user?.id) throw new TelegramServiceError('unauthorized', 401);
  if (locals.user.role !== 'RD') throw new TelegramServiceError('rd_required', 403);
  const { data, error } = await locals.supabase.from('profiles').select('role,is_active').eq('id', locals.user.id).single();
  if (error) throw new TelegramServiceError('account_unavailable');
  if (data?.is_active !== true || data.role !== 'RD') throw new TelegramServiceError('rd_required', 403);
  return locals.user.id;
}
async function readBody(request: Request): Promise<any> {
  if (Number(request.headers.get('content-length')) > 10000) throw new TelegramServiceError('invalid_request', 413);
  const text = await request.text();
  if (text.length > 10000) throw new TelegramServiceError('invalid_request', 413);
  try { return JSON.parse(text); } catch { throw new TelegramServiceError('invalid_request', 400); }
}
async function audit(db: any, userId: string, action: string) {
  try { await db.from('audit_log').insert({ user_id: userId, action, entity_type: 'system_setting', details: { provider: 'telegram' } }); } catch { /* Never log credential-bearing request data. */ }
}

export const GET: RequestHandler = async ({ locals }) => {
  try {
    await requireAdmin(locals);
    const { record, available, db } = await getTelegramSettings();
    const status = publicTelegramSettings(record, available, telegramEnvironment());
    if (available) {
      const counts = await db.rpc('telegram_admin_counts');
      if (!counts.error && counts.data && typeof counts.data === 'object') status.counts = counts.data;
      else status.available = false;
    }
    return json(status, { headers: telegramPrivateHeaders });
  } catch (error) { return telegramErrorResponse(error); }
};

export const PUT: RequestHandler = async ({ locals, request }) => {
  try {
    const userId = await requireAdmin(locals);
    const body = await readBody(request);
    const { record, available, db } = await getTelegramSettings();
    if (!available) throw new TelegramServiceError('settings_unavailable');
    const next = normalizeTelegramSettingsInput(body, record);
    const result = await db.rpc('set_telegram_settings', { p_actor: userId, p_options: next.options,
      p_bot_token: next.botToken, p_webhook_secret: next.webhookSecret, p_delivery_secret: next.deliverySecret,
      p_previous_bot_id: record.botToken.split(':')[0] || null });
    if (result.error) throw new TelegramServiceError('settings_unavailable');
    await audit(db, userId, 'telegram_settings_updated');
    const status = publicTelegramSettings(next, true, telegramEnvironment());
    const counts = await db.rpc('telegram_admin_counts');
    if (!counts.error && counts.data) status.counts = counts.data;
    return json(status, { headers: telegramPrivateHeaders });
  } catch (error) { return telegramErrorResponse(error); }
};

export const DELETE: RequestHandler = async ({ locals }) => {
  try {
    const userId = await requireAdmin(locals);
    const { available, db } = await getTelegramSettings();
    if (!available) throw new TelegramServiceError('settings_unavailable');
    const result = await db.rpc('remove_telegram_credentials', { p_actor: userId });
    if (result.error) throw new TelegramServiceError('settings_unavailable');
    await audit(db, userId, 'telegram_credentials_removed');
    return json({ ok: true }, { headers: telegramPrivateHeaders });
  } catch (error) { return telegramErrorResponse(error); }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    const userId = await requireAdmin(locals);
    const body = await readBody(request);
    if (!body || Object.keys(body).some(key => key !== 'action') || !['probe', 'registerWebhook', 'removeWebhook', 'syncCommands', 'dispatch', 'retryFailures'].includes(body.action)) throw new TelegramServiceError('invalid_request', 400);
    const { record, db } = await getTelegramSettings();
    if (!record.botToken) throw new TelegramServiceError('not_configured');
    const config = telegramConfigFromSettings({ ...record, options: { ...record.options, enabled: true } }, telegramEnvironment());
    const expectedUrl = record.options.appUrl ? `${record.options.appUrl}/api/telegram/webhook` : null;
    if (body.action === 'probe') {
      const bot = await telegramApi(record, 'getMe');
      if (!bot.ok || bot.result?.is_bot !== true || typeof bot.result?.username !== 'string') throw new TelegramServiceError('provider_unavailable');
      const webhook = await telegramApi(record, 'getWebhookInfo');
      return json({ ok: true, botUsername: bot.result.username, botMatches: bot.result.username.toLowerCase() === record.options.botUsername.toLowerCase(),
        webhook: webhook.ok ? { registered: !!webhook.result?.url, matches: webhook.result?.url === expectedUrl,
          pending: Number(webhook.result?.pending_update_count) || 0, hasError: !!webhook.result?.last_error_date,
          lastErrorAt: webhook.result?.last_error_date ? new Date(webhook.result.last_error_date * 1000).toISOString() : null } : null
      }, { headers: telegramPrivateHeaders });
    }
    if (body.action === 'removeWebhook') {
      const result = await telegramApi(record, 'deleteWebhook', { drop_pending_updates: false });
      if (!result.ok) throw new TelegramServiceError('provider_unavailable');
      await audit(db, userId, 'telegram_webhook_removed');
      return json({ ok: true }, { headers: telegramPrivateHeaders });
    }
    if (!config) throw new TelegramServiceError('incomplete_settings', 400);
    if (body.action === 'retryFailures') {
      if (!record.options.enabled) throw new TelegramServiceError('not_configured');
      const retried = await db.rpc('retry_telegram_failures', { p_actor: userId });
      if (retried.error) throw new TelegramServiceError('queue_unavailable');
      await audit(db, userId, 'telegram_failed_deliveries_requeued');
      return json({ ok: true, requeued: Number(retried.data) || 0 }, { headers: telegramPrivateHeaders });
    }
    if (body.action === 'dispatch') {
      if (!record.options.enabled) throw new TelegramServiceError('not_configured');
      const notifications = await dispatchTelegramDeliveries(config, db);
      const replies = await dispatchTelegramBotReplies(config, db);
      await audit(db, userId, 'telegram_delivery_requested');
      return json({ ok: true, notifications, replies }, { headers: telegramPrivateHeaders });
    }
    if (body.action === 'registerWebhook') {
      if (!record.options.enabled || !expectedUrl?.startsWith('https://')) throw new TelegramServiceError('incomplete_settings', 400);
      const bot = await telegramApi(record, 'getMe');
      if (!bot.ok || typeof bot.result?.username !== 'string' || bot.result.username.toLowerCase() !== record.options.botUsername.toLowerCase()) throw new TelegramServiceError('provider_unavailable');
      const result = await telegramApi(record, 'setWebhook', { url: expectedUrl, secret_token: record.webhookSecret,
        allowed_updates: ['message', 'callback_query'], max_connections: 10, drop_pending_updates: false });
      if (!result.ok) throw new TelegramServiceError('provider_unavailable');
      await audit(db, userId, 'telegram_webhook_registered');
    }
    let commandsSynced = true;
    for (const locale of ['', 'en', 'ru', 'lv'] as const) {
      const synced = await telegramApi(config, 'setMyCommands', { commands: telegramCommandMenu(config, locale || 'en'), language_code: locale, scope: { type: 'all_private_chats' } });
      if (!synced.ok) commandsSynced = false;
    }
    return json({ ok: true, commandsSynced }, { headers: telegramPrivateHeaders });
  } catch (error) { return telegramErrorResponse(error); }
};
