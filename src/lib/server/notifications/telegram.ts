import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export interface TelegramConfig {
  botToken: string;
  botUsername: string;
  webhookSecret: string;
  deliverySecret: string;
  appUrl: string | null;
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
    || !/^[A-Za-z0-9_-]{32,256}$/.test(webhookSecret)
    || !/^[A-Za-z0-9_-]{32,256}$/.test(deliverySecret)
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
} | { kind: 'disconnect'; chatId: string; telegramUserId: string };

export function readTelegramUpdateIdentity(update: unknown): { updateId: number; messageAt: string } | null {
  if (!update || typeof update !== 'object') return null;
  const value = update as any;
  if (!Number.isSafeInteger(value.update_id) || value.update_id < 0
    || !Number.isSafeInteger(value.message?.date) || value.message.date <= 0) return null;
  const date = new Date(value.message.date * 1000);
  return Number.isFinite(date.getTime()) ? { updateId: value.update_id, messageAt: date.toISOString() } : null;
}

/** Never bind accounts from groups, forwarded updates, edited messages or bot senders. */
export function readTelegramCommand(update: unknown, botUsername: string): TelegramCommand | null {
  if (!update || typeof update !== 'object') return null;
  const message = (update as any).message;
  if (!message || typeof message.text !== 'string' || message.text.length > 200
    || message.chat?.type !== 'private' || message.from?.is_bot === true
    || message.forward_origin || message.forward_from || message.sender_chat) return null;
  const chatId = message.chat?.id;
  const senderId = message.from?.id;
  if (!Number.isSafeInteger(chatId) || chatId <= 0 || senderId !== chatId) return null;
  const match = /^\/(start|stop)(?:@([A-Za-z0-9_]+))?(?:\s+([A-Za-z0-9_-]+))?\s*$/.exec(message.text.trim());
  if (!match || (match[2] && match[2].toLowerCase() !== botUsername.toLowerCase())) return null;
  if (match[1] === 'stop' && !match[3]) {
    return { kind: 'disconnect', chatId: String(chatId), telegramUserId: String(senderId) };
  }
  if (match[1] !== 'start' || !/^[A-Za-z0-9_-]{43}$/.test(match[3] ?? '')) return null;
  const username = typeof message.from.username === 'string' && /^[A-Za-z0-9_]{1,32}$/.test(message.from.username)
    ? message.from.username : null;
  return { kind: 'connect', token: match[3], chatId: String(chatId), telegramUserId: String(senderId), username };
}

export interface TelegramNotification {
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
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {}
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
        ...(formatted.url ? { reply_markup: { inline_keyboard: [[{ text: 'Open OMS', url: formatted.url }]] } } : {})
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

export function telegramRetryAt(attempts: number, retryAfterSeconds?: number, now = new Date()): string {
  const delay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds! > 0
    ? Math.min(86400, Math.ceil(retryAfterSeconds!))
    : Math.min(3600, 30 * 2 ** Math.max(0, Math.min(8, attempts - 1)));
  return new Date(now.getTime() + delay * 1000).toISOString();
}
