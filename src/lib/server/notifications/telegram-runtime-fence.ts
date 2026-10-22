import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_TELEGRAM_OPTIONS } from '$lib/notifications/telegram-options';
import type { TelegramConfig } from './telegram';

type Database = SupabaseClient<any, any, any>;
type Settings = { options?: unknown; botToken?: unknown; webhookSecret?: unknown; deliverySecret?: unknown; revision?: unknown };
export type TelegramClaim = { id: string; token: string; queue: 'notification' | 'reply' };

/** Server-only generation: detects settings saves and direct Vault rotation.
 * It never contains a recoverable credential and is never returned to clients. */
export function telegramSettingsGeneration(record: Settings): string {
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return createHash('sha256').update(JSON.stringify(canonical({
    options: { ...DEFAULT_TELEGRAM_OPTIONS, ...(record.options as object) },
    botToken: record.botToken ?? '', webhookSecret: record.webhookSecret ?? '', deliverySecret: record.deliverySecret ?? '',
    revision: typeof record.revision === 'string' ? record.revision : null
  }))).digest('hex');
}

/** Re-read authoritative settings before claiming and immediately before sends.
 * A disabled/changed/unavailable runtime never uses the captured credentials.
 * An already-claimed row is released without consuming a provider retry. */
export async function checkTelegramRuntimeFence(config: TelegramConfig, db: Database, claim?: TelegramClaim): Promise<{
  current: boolean; released?: boolean; errors: number;
}> {
  let errors = 0;
  try {
    const result = await db.rpc('get_telegram_settings');
    const legacy = config.settingsGeneration === undefined || config.settingsGeneration === 'environment';
    if (result.error) {
      // A missing optional settings migration retains the existing legacy
      // environment mode. Outages and previously saved settings fail closed.
      if (legacy && ['PGRST202', '42883', '42P01'].includes(result.error.code)) return { current: true, errors: 0 };
      throw new Error('Telegram settings unavailable');
    }
    if (result.data === null && legacy) return { current: true, errors: 0 };
    const row = result.data as Settings | null;
    if (row && typeof row === 'object' && row.options && typeof row.options === 'object' &&
        (row.options as Record<string, unknown>).enabled === true &&
        typeof row.botToken === 'string' && row.botToken.trim() === config.botToken &&
        telegramSettingsGeneration(row) === config.settingsGeneration) return { current: true, errors: 0 };
  } catch { errors++; }
  if (!claim) return { current: false, errors };
  try {
    const result = await db.rpc('release_telegram_runtime_claim', {
      p_id: claim.id, p_claim_token: claim.token, p_queue: claim.queue
    });
    if (result.error) throw new Error('Telegram claim release unavailable');
    return { current: false, released: result.data === true, errors };
  } catch { return { current: false, released: false, errors: errors + 1 }; }
}
