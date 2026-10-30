import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createTelegramLinkToken, hashTelegramLinkToken, readTelegramCommand, readTelegramUpdateIdentity,
  sendTelegramMessage, telegramApi, telegramRetryAt, type TelegramConfig
} from './telegram';
import { dispatchTelegramBotReplies } from './telegram-bot';
import { checkTelegramRuntimeFence } from './telegram-runtime-fence';

type Database = SupabaseClient<any, any, any>;

export class TelegramServiceError extends Error {
  constructor(public code: string, public status = 503) {
    super('Telegram is temporarily unavailable. Please try again.');
  }
}

export interface TelegramStatus {
  configured: boolean;
  available: boolean;
  connected: boolean;
  enabled: boolean;
  username: string | null;
  linkedAt: string | null;
  pendingUntil: string | null;
  botUsername: string | null;
}

export function unavailableTelegramStatus(config: TelegramConfig | null): TelegramStatus {
  return { configured: !!config, available: false, connected: false, enabled: false, username: null, linkedAt: null, pendingUntil: null, botUsername: config?.botUsername ?? null };
}

export async function readTelegramStatus(config: TelegramConfig, db: Database, userId: string): Promise<TelegramStatus> {
  try {
    const [connection, pending] = await Promise.all([
      db.from('telegram_connections').select('username,enabled,linked_at').eq('user_id', userId).maybeSingle(),
      db.from('telegram_link_tokens').select('expires_at').eq('user_id', userId).maybeSingle()
    ]);
    if (connection.error || pending.error) return unavailableTelegramStatus(config);
    return {
      configured: true, available: true, connected: !!connection.data, enabled: connection.data?.enabled === true,
      username: connection.data?.username ?? null, linkedAt: connection.data?.linked_at ?? null,
      pendingUntil: pending.data?.expires_at && Date.parse(pending.data.expires_at) > Date.now() ? pending.data.expires_at : null,
      botUsername: config.botUsername
    };
  } catch { return unavailableTelegramStatus(config); }
}

export async function connectTelegram(config: TelegramConfig, db: Database, userId: string): Promise<{ url: string; expiresAt: string }> {
  const token = createTelegramLinkToken();
  const result = await db.rpc('prepare_telegram_link', { p_user_id: userId, p_token_hash: hashTelegramLinkToken(token) });
  if (result.error) {
    if (result.error.code === 'P0001' && result.error.message?.includes('link_rate_limited')) throw new TelegramServiceError('link_rate_limited', 429);
    throw new TelegramServiceError('connection_unavailable');
  }
  if (typeof result.data !== 'string' || !Number.isFinite(Date.parse(result.data))) throw new TelegramServiceError('connection_unavailable');
  return { url: `https://t.me/${config.botUsername}?start=${token}`, expiresAt: result.data };
}

/** The caller must authenticate Telegram's webhook secret before parsing updates. */
export async function handleTelegramUpdate(config: TelegramConfig, db: Database, update: unknown): Promise<void> {
  const command = readTelegramCommand(update, config.botUsername);
  const identity = readTelegramUpdateIdentity(update);
  if (!command || !identity) return;
  if (command.kind === 'command') {
    const options = config.options;
    if (options && (!options.commandsEnabled || !options.commands.includes(command.command) || (command.command === 'ask' && !options.aiEnabled))) return;
    const result = await db.rpc('process_telegram_bot_command', {
      p_update_id: identity.updateId, p_message_at: identity.messageAt, p_command: command.command,
      p_chat_id: command.chatId, p_telegram_user_id: command.telegramUserId, p_argument: command.argument
    });
    if (result.error) throw new TelegramServiceError('webhook_unavailable');
    if (command.callbackId) await telegramApi(config, 'answerCallbackQuery', { callback_query_id: command.callbackId });
    if (typeof result.data === 'string') await dispatchTelegramBotReplies(config, db, { id: result.data });
    return;
  }
  const result = await db.rpc('process_telegram_update', {
    p_update_id: identity.updateId, p_message_at: identity.messageAt, p_command: command.kind,
    p_chat_id: command.chatId, p_telegram_user_id: command.telegramUserId,
    p_token_hash: command.kind === 'connect' ? hashTelegramLinkToken(command.token) : null,
    p_username: command.kind === 'connect' ? command.username : null
  });
  if (result.error) throw new TelegramServiceError('webhook_unavailable');
  // Invalid/expired/replayed links are acknowledged without disclosing account data.
}

export async function dispatchTelegramDeliveries(
  config: TelegramConfig, db: Database,
  options: { fetcher?: typeof fetch; now?: () => Date } = {}
): Promise<{ claimed: number; sent: number; retried: number; failed: number; cancelled: number; errors: number }> {
  const ready = await checkTelegramRuntimeFence(config, db);
  if (!ready.current) return { claimed: 0, sent: 0, retried: 0, failed: 0, cancelled: 0, errors: ready.errors };
  const { data, error } = await db.rpc('claim_telegram_deliveries', { p_limit: config.options?.batchSize ?? 10 });
  if (error || !Array.isArray(data)) throw new TelegramServiceError('queue_unavailable');
  const summary = { claimed: data.length, sent: 0, retried: 0, failed: 0, cancelled: 0, errors: 0 };
  let next = 0;
  const workers = Array.from({ length: Math.min(config.options?.concurrency ?? 2, data.length) }, async () => {
    while (next < data.length) {
      const delivery = data[next++];
      const claim = { p_id: delivery.id, p_claim_token: delivery.claim_token };
      const currentRuntime = async () => {
        const fence = await checkTelegramRuntimeFence(config, db, { id: delivery.id, token: delivery.claim_token, queue: 'notification' });
        summary.errors += fence.errors;
        if (!fence.current) summary[fence.released ? 'retried' : 'cancelled']++;
        return fence.current;
      };
      let outcome: 'sent' | 'retried' | 'failed' | 'cancelled' = 'retried';
      let finish: Record<string, unknown>;
      try {
        if (!await currentRuntime()) continue;
        const payload = await db.rpc('telegram_delivery_payload', claim);
        if (payload.error) throw new TelegramServiceError('recipient_unavailable');
        if (!payload.data) {
          outcome = 'cancelled';
          finish = { ...claim, p_status: 'cancelled' };
        } else {
          if (!await currentRuntime()) continue;
          const result = await sendTelegramMessage(config, payload.data.chatId, payload.data.notification, { fetcher: options.fetcher });
          // Rotation can occur after the last fence while the HTTP request is
          // in flight. Preserve a successful acknowledgement; a failed stale
          // credential must not exhaust the current runtime's retry budget.
          if (result.status !== 'sent' && !await currentRuntime()) continue;
          if (result.status === 'sent') {
            outcome = 'sent';
            finish = { ...claim, p_status: 'sent', p_message_id: result.messageId };
          } else if (result.status === 'retry') {
            outcome = delivery.attempts >= (config.options?.maxAttempts ?? 5) ? 'failed' : 'retried';
            finish = { ...claim, p_status: outcome === 'failed' ? 'failed' : 'pending', p_error: result.code, p_retry_at: telegramRetryAt(delivery.attempts, result.retryAfterSeconds, options.now?.(), config.options?.retryBaseSeconds) };
          } else {
            outcome = 'failed';
            finish = { ...claim, p_status: 'failed', p_error: result.code };
          }
        }
      } catch {
        summary.errors++;
        outcome = delivery.attempts >= (config.options?.maxAttempts ?? 5) ? 'failed' : 'retried';
        finish = { ...claim, p_status: outcome === 'failed' ? 'failed' : 'pending', p_error: 'database_unavailable', p_retry_at: telegramRetryAt(delivery.attempts, undefined, options.now?.(), config.options?.retryBaseSeconds) };
      }
      try {
        const completed = await db.rpc('finish_telegram_delivery', finish);
        if (completed.error) summary.errors++;
        else if (completed.data === true) summary[outcome]++;
        else summary.cancelled++;
      } catch { summary.errors++; }
      // A failed completion retains its lease. A later scheduler invocation
      // recovers it; Telegram has no idempotency key, so crash recovery can duplicate.
    }
  });
  await Promise.all(workers);
  return summary;
}
