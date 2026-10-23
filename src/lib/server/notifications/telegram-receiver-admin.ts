import type { TelegramReceiverStatus } from '$lib/notifications/telegram-options';
import type { TelegramConfig } from './telegram';
import { claimTelegramReceiver, releaseTelegramReceiver, renewTelegramReceiver, TelegramReceiverError, type TelegramReceiverDatabase } from './telegram-polling';

const states = ['disabled', 'webhook', 'waiting', 'polling', 'backoff', 'unavailable'] as const;
const errors = new Set(['database_unavailable', 'migration_required', 'invalid_credentials', 'bot_mismatch',
  'receiver_conflict', 'rate_limited', 'transport_error', 'invalid_response']);
const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;

/** Never forward raw RPC/provider data to a browser. */
export async function readTelegramReceiverStatus(db: TelegramReceiverDatabase): Promise<TelegramReceiverStatus> {
  const unavailable: TelegramReceiverStatus = { available: false, state: 'unavailable', lastPollAt: null, lastUpdateAt: null, lastError: null, retryAt: null };
  try {
    const { data, error } = await db.rpc('telegram_receiver_status');
    if (error || !data || data.available !== true || !states.includes(data.state)) return unavailable;
    return { available: true, state: data.state, lastPollAt: timestamp(data.lastPollAt), lastUpdateAt: timestamp(data.lastUpdateAt),
      lastError: typeof data.lastError === 'string' && errors.has(data.lastError) ? data.lastError : null, retryAt: timestamp(data.retryAt) };
  } catch { return unavailable; }
}

/** Serialize webhook provider writes with polling, including mode-change races. */
export async function withTelegramWebhookLease<T>(config: TelegramConfig, db: TelegramReceiverDatabase, action: () => Promise<T>): Promise<T> {
  if (config.options?.connectionMode === 'polling') throw new TelegramReceiverError('runtime_changed');
  const lease = await claimTelegramReceiver(config, db, 'webhook');
  if (!lease) throw new TelegramReceiverError('receiver_conflict');
  try {
    await renewTelegramReceiver(db, lease.token);
    return await action();
  } finally { await releaseTelegramReceiver(db, lease.token); }
}
