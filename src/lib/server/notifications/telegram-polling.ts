import { createHash, randomUUID } from 'node:crypto';
import {
  hashTelegramLinkToken, readTelegramCommand, readTelegramUpdateIdentity,
  telegramApi, type TelegramConfig
} from './telegram';

/** Compatible with Supabase's thenable RPC builder; no service key crosses this boundary. */
export interface TelegramReceiverDatabase {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: any; error: any }>;
}
export type TelegramReceiverErrorCode = 'cancelled' | 'runtime_changed' | 'database_unavailable' | 'migration_required'
  | 'invalid_credentials' | 'bot_mismatch' | 'receiver_conflict' | 'rate_limited' | 'transport_error' | 'invalid_response';
export class TelegramReceiverError extends Error {
  constructor(public code: TelegramReceiverErrorCode, public retryAfterSeconds?: number) { super(code); }
}
export interface TelegramReceiverLease { token: string; offset: number | null; prepared: boolean; failures: number }
export interface TelegramPolledUpdate { update_id: number; [key: string]: unknown }
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const BATCH_LIMIT = 25;

async function rpc(db: TelegramReceiverDatabase, name: string, args: Record<string, unknown>) {
  try {
    const result = await db.rpc(name, args);
    if (result.error) throw new TelegramReceiverError(
      ['PGRST202', '42883', '42P01'].includes(result.error.code) ? 'migration_required' : 'database_unavailable');
    return result.data;
  } catch (error) {
    if (error instanceof TelegramReceiverError) throw error;
    throw new TelegramReceiverError('database_unavailable');
  }
}

async function boundedJson(response: Response): Promise<any> {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) throw new TelegramReceiverError('invalid_response');
  const reader = response.body?.getReader();
  if (!reader) throw new TelegramReceiverError('invalid_response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new TelegramReceiverError('invalid_response'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new TelegramReceiverError('invalid_response'); }
}

/** The fixed origin and closed method set cannot become a proxy or leak a token in an error. */
async function receiverApi(config: TelegramConfig, method: 'getUpdates' | 'getMe' | 'deleteWebhook', body: Record<string, unknown>,
  options: { fetcher?: typeof fetch; signal?: AbortSignal; timeoutMs: number }): Promise<any> {
  if (options.signal?.aborted) throw new TelegramReceiverError('cancelled');
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  try {
    const response = await (options.fetcher ?? fetch)(`https://api.telegram.org/bot${config.botToken}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal
    });
    const payload = await boundedJson(response);
    if (response.ok && payload?.ok === true) return payload.result;
    const code = Number(payload?.error_code ?? response.status);
    if (code === 429) {
      const retry = Number(payload?.parameters?.retry_after);
      throw new TelegramReceiverError('rate_limited', Number.isFinite(retry) && retry > 0 ? Math.min(86400, Math.ceil(retry)) : 60);
    }
    if (code === 409) throw new TelegramReceiverError('receiver_conflict');
    if (code === 401 || code === 403) throw new TelegramReceiverError('invalid_credentials');
    throw new TelegramReceiverError(code >= 500 ? 'transport_error' : 'invalid_response');
  } catch (error) {
    if (options.signal?.aborted) throw new TelegramReceiverError('cancelled');
    if (error instanceof TelegramReceiverError) throw error;
    throw new TelegramReceiverError('transport_error');
  }
}

export async function getTelegramUpdates(config: TelegramConfig, offset: number | null,
  options: { fetcher?: typeof fetch; signal?: AbortSignal } = {}): Promise<TelegramPolledUpdate[]> {
  const wait = config.options?.pollingTimeoutSeconds ?? 25;
  if (!Number.isInteger(wait) || wait < 10 || wait > 50
    || (offset !== null && (!Number.isSafeInteger(offset) || offset < 0))) throw new TelegramReceiverError('invalid_response');
  const result = await receiverApi(config, 'getUpdates', {
    ...(offset === null ? {} : { offset }), timeout: wait, limit: BATCH_LIMIT, allowed_updates: ['message', 'callback_query']
  }, { ...options, timeoutMs: (wait + 10) * 1000 });
  if (!Array.isArray(result) || result.length > BATCH_LIMIT || result.some(item =>
    !item || !Number.isSafeInteger(item.update_id) || item.update_id < 0 || item.update_id >= Number.MAX_SAFE_INTEGER
      || (offset !== null && item.update_id < offset))) throw new TelegramReceiverError('invalid_response');
  const sorted = [...result].sort((a, b) => a.update_id - b.update_id);
  if (sorted.some((item, i) => i > 0 && item.update_id === sorted[i - 1].update_id)) throw new TelegramReceiverError('invalid_response');
  return sorted;
}

/** Also used by webhook administration, so old polls cannot remove a newly registered webhook. */
export async function claimTelegramReceiver(config: TelegramConfig, db: TelegramReceiverDatabase,
  mode: 'polling' | 'webhook'): Promise<TelegramReceiverLease | null> {
  if (!config.settingsRevision) throw new TelegramReceiverError('migration_required');
  const token = randomUUID();
  const data = await rpc(db, 'claim_telegram_receiver', {
    p_revision: config.settingsRevision, p_token_hash: createHash('sha256').update(config.botToken).digest('hex'),
    p_mode: mode, p_lease_token: token
  });
  if (data === null) return null;
  const offset = data?.offset == null ? null : Number(data.offset);
  if (data?.token !== token || typeof data.prepared !== 'boolean'
    || (offset !== null && (!Number.isSafeInteger(offset) || offset < 0))) throw new TelegramReceiverError('database_unavailable');
  return { token, offset, prepared: data.prepared, failures: Math.max(0, Math.min(12, Number(data.failures) || 0)) };
}

export async function releaseTelegramReceiver(db: TelegramReceiverDatabase, token: string): Promise<void> {
  try { await db.rpc('release_telegram_receiver', { p_lease_token: token }); }
  catch { /* A lost process/database connection is recovered by the bounded database lease. */ }
}

export async function renewTelegramReceiver(db: TelegramReceiverDatabase, token: string): Promise<void> {
  if (await rpc(db, 'renew_telegram_receiver', { p_lease_token: token }) !== true) throw new TelegramReceiverError('runtime_changed');
}

function retrySeconds(error: TelegramReceiverError, failures: number): number {
  if (error.retryAfterSeconds) return error.retryAfterSeconds;
  if (error.code === 'invalid_credentials' || error.code === 'bot_mismatch') return 300;
  if (error.code === 'receiver_conflict' || error.code === 'migration_required') return 60;
  return Math.min(300, 5 * 2 ** Math.min(failures, 6));
}

/** One bounded batch. Effects, reply enqueue and cursor commit share one SQL transaction.
 * No raw updates are retained; unsupported input advances only the transport cursor.
 * Next getUpdates is never called until these commits have completed. */
export async function runTelegramPollingCycle(config: TelegramConfig, db: TelegramReceiverDatabase,
  options: { fetcher?: typeof fetch; signal?: AbortSignal; heartbeatMs?: number } = {}): Promise<number> {
  if (config.options?.connectionMode !== 'polling' || config.options.enabled !== true || !config.settingsRevision || options.signal?.aborted) return 10000;
  let lease: TelegramReceiverLease | null;
  try { lease = await claimTelegramReceiver(config, db, 'polling'); }
  catch { return 10000; } // Status RPC reports a missing migration; never poll without storage.
  if (!lease) return 5000;
  const claim = { p_lease_token: lease.token };
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  let heartbeat: Promise<void> | null = null;
  let heartbeatError: TelegramReceiverError | null = null;
  const renew = async () => {
    try { await renewTelegramReceiver(db, lease.token); }
    catch (error) {
      heartbeatError = error instanceof TelegramReceiverError ? error : new TelegramReceiverError('database_unavailable');
      controller.abort(); throw heartbeatError;
    }
    if (signal.aborted) throw new TelegramReceiverError('cancelled');
  };
  const timer = setInterval(() => {
    if (!heartbeat) heartbeat = renew().catch(() => {}).finally(() => { heartbeat = null; });
  }, options.heartbeatMs ?? 5000);
  timer.unref?.();
  const fetcher: typeof fetch = (input, init: RequestInit = {}) => (options.fetcher ?? fetch)(input, {
    ...init, signal: init.signal ? AbortSignal.any([signal, init.signal]) : signal
  });
  try {
    await renew();
    if (!lease.prepared) {
      const bot = await receiverApi(config, 'getMe', {}, { fetcher, signal, timeoutMs: 8000 });
      if (bot?.is_bot !== true || String(bot.id) !== config.botToken.split(':')[0]
        || typeof bot.username !== 'string' || bot.username.toLowerCase() !== config.botUsername.toLowerCase()) throw new TelegramReceiverError('bot_mismatch');
      await renew();
      if (await receiverApi(config, 'deleteWebhook', { drop_pending_updates: false }, { fetcher, signal, timeoutMs: 8000 }) !== true) throw new TelegramReceiverError('invalid_response');
      if (await rpc(db, 'prepare_telegram_receiver', claim) !== true) throw new TelegramReceiverError('runtime_changed');
    }
    const updates = await getTelegramUpdates(config, lease.offset, { fetcher, signal });
    await renew();
    for (const update of updates) {
      if (signal.aborted) throw new TelegramReceiverError('cancelled');
      const identity = readTelegramUpdateIdentity(update);
      let command = identity ? readTelegramCommand(update, config.botUsername) : null;
      if (command?.kind === 'command' && (!config.options.commandsEnabled || !config.options.commands.includes(command.command)
        || (command.command === 'ask' && !config.options.aiEnabled))) command = null;
      const result = await rpc(db, 'process_telegram_polled_update', {
        ...claim, p_update_id: update.update_id, p_message_at: identity?.messageAt ?? null,
        p_action: command?.kind ?? null, p_command: command?.kind === 'command' ? command.command : null,
        p_chat_id: command?.chatId ?? null, p_telegram_user_id: command?.telegramUserId ?? null,
        p_argument: command?.kind === 'command' ? command.argument : '',
        p_token_hash: command?.kind === 'connect' ? hashTelegramLinkToken(command.token) : null,
        p_username: command?.kind === 'connect' ? command.username : null
      });
      if (result?.accepted !== true) throw new TelegramReceiverError('runtime_changed');
      if (command?.kind === 'command' && command.callbackId && !signal.aborted) {
        // Button acknowledgement is best-effort, after the durable command/cursor commit.
        await telegramApi(config, 'answerCallbackQuery', { callback_query_id: command.callbackId }, fetcher);
      }
    }
    if (await rpc(db, 'record_telegram_receiver_poll', { ...claim, p_error: null, p_retry_seconds: 0 }) !== true) throw new TelegramReceiverError('runtime_changed');
    return 250; // Telegram holds an empty request; also bound accidental immediate empty responses.
  } catch (error) {
    const safe = heartbeatError ?? (error instanceof TelegramReceiverError ? error : new TelegramReceiverError('database_unavailable'));
    if (safe.code === 'cancelled' || safe.code === 'runtime_changed') return 1000;
    const delay = retrySeconds(safe, lease.failures);
    try { await rpc(db, 'record_telegram_receiver_poll', { ...claim, p_error: safe.code, p_retry_seconds: delay }); }
    catch { /* Fail closed. Unacknowledged updates remain at Telegram until retry/retention expiry. */ }
    return delay * 1000;
  } finally {
    clearInterval(timer); controller.abort();
    if (heartbeat) await heartbeat;
    await releaseTelegramReceiver(db, lease.token);
  }
}
