import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { TELEGRAM_COMMANDS, type TelegramCommandName, type TelegramOptions } from '$lib/notifications/telegram-options';

export interface TelegramConfig {
  botToken: string;
  botUsername: string;
  webhookSecret: string;
  deliverySecret: string;
  appUrl: string | null;
  options?: TelegramOptions;
  /** Server-only fingerprint of the settings/credential generation. */
  settingsGeneration?: string;
}

export function isTelegramSecret(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,256}$/.test(value);
}

/** All credentials remain in server modules. Partial configuration is disabled. */
export function readTelegramConfig(env: Record<string, string | undefined>): TelegramConfig | null {
  if (env.TELEGRAM_ENABLED?.trim().toLowerCase() !== 'true') return null;
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
  const botUsername = (env.TELEGRAM_BOT_USERNAME?.trim() ?? '').replace(/^@/, '');
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
  const deliverySecret = env.TELEGRAM_DELIVERY_SECRET?.trim() ?? '';
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(botToken)
    || !/^[A-Za-z0-9_]{5,32}$/.test(botUsername) || !/bot$/i.test(botUsername)
    || !isTelegramSecret(webhookSecret)
    || !isTelegramSecret(deliverySecret)
    || webhookSecret === deliverySecret
    || !env.SUPABASE_SERVICE_ROLE_KEY?.trim() || !env.PUBLIC_SUPABASE_URL?.trim()) return null;
  try {
    if (!['https:', 'http:'].includes(new URL(env.PUBLIC_SUPABASE_URL.trim()).protocol)) return null;
  } catch { return null; }
  let appUrl: string | null = null;
  try {
    const url = new URL(env.PUBLIC_APP_URL || env.PUBLIC_BASE_URL || '');
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
      url.search = '';
      url.hash = '';
      appUrl = url.toString().replace(/\/$/, '');
    }
  } catch { /* Opening OMS is optional; delivery itself still works. */ }
  return { botToken, botUsername, webhookSecret, deliverySecret, appUrl };
}

export function createTelegramLinkToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashTelegramLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function matchesTelegramSecret(actual: string | null | undefined, expected: string): boolean {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type TelegramCommand = {
  kind: 'connect'; token: string; chatId: string; telegramUserId: string; username: string | null;
} | { kind: 'disconnect'; chatId: string; telegramUserId: string }
  | { kind: 'command'; command: TelegramCommandName; argument: string; chatId: string; telegramUserId: string; callbackId?: string };

export function readTelegramUpdateIdentity(update: unknown): { updateId: number; messageAt: string } | null {
  if (!update || typeof update !== 'object') return null;
  const value = update as any;
  if (!Number.isSafeInteger(value.update_id) || value.update_id < 0
    || (!value.callback_query && (!Number.isSafeInteger(value.message?.date) || value.message.date <= 0))) return null;
  // A callback refers to an older bot message; the authenticated webhook's
  // receipt time is used, while update_id remains the duplicate/replay fence.
  const date = value.callback_query ? new Date() : new Date(value.message.date * 1000);
  return Number.isFinite(date.getTime()) ? { updateId: value.update_id, messageAt: date.toISOString() } : null;
}

/** Never bind accounts from groups, forwarded updates, edited messages or bot senders. */
export function readTelegramCommand(update: unknown, botUsername: string): TelegramCommand | null {
  if (!update || typeof update !== 'object') return null;
  const callback = (update as any).callback_query;
  if (callback) {
    const message = callback.message;
    if (!message || message.chat?.type !== 'private' || callback.from?.is_bot === true || !Number.isSafeInteger(message.chat.id)
      || message.chat.id <= 0 || callback.from?.id !== message.chat.id || typeof callback.id !== 'string' || callback.id.length > 128) return null;
    const match = /^oms:(read):([0-9a-f-]{36})$|^oms:(today|notifications|pause|resume)$/.exec(String(callback.data ?? ''));
    if (!match) return null;
    return { kind: 'command', command: (match[1] || match[3]) as TelegramCommandName, argument: match[2] ?? '',
      chatId: String(message.chat.id), telegramUserId: String(callback.from.id), callbackId: callback.id };
  }
  const message = (update as any).message;
  if (!message || typeof message.text !== 'string' || message.text.length > 1200
    || message.chat?.type !== 'private' || message.from?.is_bot === true
    || message.forward_origin || message.forward_from || message.sender_chat) return null;
  const chatId = message.chat?.id;
  const senderId = message.from?.id;
  if (!Number.isSafeInteger(chatId) || chatId <= 0 || senderId !== chatId) return null;
  const match = /^\/([a-z]+)(?:@([A-Za-z0-9_]+))?(?:\s+([^\r\n]+))?\s*$/.exec(message.text.trim());
  if (!match || (match[2] && match[2].toLowerCase() !== botUsername.toLowerCase())) return null;
  if (match[1] === 'stop' && !match[3]) {
    return { kind: 'disconnect', chatId: String(chatId), telegramUserId: String(senderId) };
  }
  if (match[1] === 'start' && !match[3]) return { kind: 'command', command: 'help', argument: '', chatId: String(chatId), telegramUserId: String(senderId) };
  if (([...TELEGRAM_COMMANDS, 'ask'] as string[]).includes(match[1])) {
    const argument = (match[3] ?? '').trim();
    if (argument.length > 1000 || (['order', 'read', 'ask'].includes(match[1]) && !argument)
      || (!['orders', 'order', 'read', 'ask'].includes(match[1]) && argument)) return null;
    return { kind: 'command', command: match[1] as TelegramCommandName, argument, chatId: String(chatId), telegramUserId: String(senderId) };
  }
  if (match[1] !== 'start' || !/^[A-Za-z0-9_-]{43}$/.test(match[3] ?? '')) return null;
  const username = typeof message.from.username === 'string' && /^[A-Za-z0-9_]{1,32}$/.test(message.from.username)
    ? message.from.username : null;
  return { kind: 'connect', token: match[3], chatId: String(chatId), telegramUserId: String(senderId), username };
}

export interface TelegramNotification {
  id?: string;
  title: string;
  message?: string | null;
  link?: string | null;
}

export function formatTelegramMessage(notification: TelegramNotification, appUrl: string | null): { text: string; url: string | null } {
  const fullText = [notification.title, notification.message].filter(Boolean).join('\n\n');
  // Bound both code points and UTF-16 units without cutting an emoji in half.
  let text = fullText;
  if (text.length > 4000) {
    text = text.slice(0, 3999);
    if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
    text += '…';
  }
  let url: string | null = null;
  const link = notification.link;
  if (appUrl && link?.startsWith('/') && !link.startsWith('//') && !/[\\\u0000-\u001f]/.test(link)) {
    try {
      const base = new URL(appUrl);
      const destination = new URL(`${appUrl.replace(/\/$/, '')}${link}`);
      if (destination.origin === base.origin && ['http:', 'https:'].includes(destination.protocol)) url = destination.toString();
    } catch { /* A bad application link must never prevent a notification. */ }
  }
  return { text, url };
}

export type TelegramDeliveryResult =
  | { status: 'sent'; messageId: string }
  | { status: 'retry'; code: 'rate_limited' | 'unavailable' | 'transport_error'; retryAfterSeconds?: number }
  | { status: 'failed'; code: 'blocked' | 'invalid_credentials' | 'invalid_request' | 'invalid_response' };

/** Does not log provider bodies or errors: fetch errors can include the token-bearing URL. */
export async function sendTelegramMessage(
  config: TelegramConfig, chatId: string, notification: TelegramNotification,
  options: { fetcher?: typeof fetch; timeoutMs?: number; keyboard?: TelegramInlineButton[][] } = {}
): Promise<TelegramDeliveryResult> {
  const formatted = formatTelegramMessage(notification, config.appUrl);
  if (!/^[1-9]\d{0,15}$/.test(chatId) || !formatted.text) return { status: 'failed', code: 'invalid_request' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  try {
    const response = await (options.fetcher ?? fetch)(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId, text: formatted.text,
        link_preview_options: { is_disabled: true },
        ...((options.keyboard?.length || formatted.url || (notification.id && config.options?.commandsEnabled !== false && config.options?.commands.includes('read'))) ? { reply_markup: { inline_keyboard: options.keyboard ?? [
          ...(formatted.url ? [[{ text: 'Open OMS', url: formatted.url }]] : []),
          ...(notification.id && /^[0-9a-f-]{36}$/i.test(notification.id) && config.options?.commandsEnabled !== false && config.options?.commands.includes('read')
            ? [[{ text: '✓ Read', callback_data: `oms:read:${notification.id}` }]] : [])
        ] } } : {})
      })
    });
    const body = await response.json().catch(() => null);
    if (response.ok && body?.ok === true && Number.isSafeInteger(body.result?.message_id)) {
      return { status: 'sent', messageId: String(body.result.message_id) };
    }
    const code = Number(body?.error_code ?? response.status);
    if (code === 429) {
      const delay = Number(body?.parameters?.retry_after);
      return { status: 'retry', code: 'rate_limited', retryAfterSeconds: Number.isFinite(delay) ? Math.max(1, Math.min(86400, Math.ceil(delay))) : 60 };
    }
    if (code >= 500) return { status: 'retry', code: 'unavailable' };
    if (code === 403) return { status: 'failed', code: 'blocked' };
    if (code === 401) return { status: 'failed', code: 'invalid_credentials' };
    return { status: 'failed', code: response.ok ? 'invalid_response' : 'invalid_request' };
  } catch {
    return { status: 'retry', code: 'transport_error' };
  } finally {
    clearTimeout(timer);
  }
}

export function telegramRetryAt(attempts: number, retryAfterSeconds?: number, now = new Date(), baseSeconds = 30): string {
  const delay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds! > 0
    ? Math.min(86400, Math.ceil(retryAfterSeconds!))
    : Math.min(3600, baseSeconds * 2 ** Math.max(0, Math.min(8, attempts - 1)));
  return new Date(now.getTime() + delay * 1000).toISOString();
}

export interface TelegramInlineButton { text: string; url?: string; callback_data?: string }

/** Fixed Telegram origin and method allowlist; never returns token-bearing errors. */
export async function telegramApi(config: Pick<TelegramConfig, 'botToken'>,
  method: 'getMe' | 'getWebhookInfo' | 'setWebhook' | 'deleteWebhook' | 'setMyCommands' | 'answerCallbackQuery',
  body: Record<string, unknown> = {}, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; result?: any; code?: number }> {
  try {
    const response = await fetcher(`https://api.telegram.org/bot${config.botToken}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000)
    });
    const payload = await response.json().catch(() => null);
    return response.ok && payload?.ok === true ? { ok: true, result: payload.result }
      : { ok: false, code: Number(payload?.error_code ?? response.status) };
  } catch { return { ok: false, code: 503 }; }
}
