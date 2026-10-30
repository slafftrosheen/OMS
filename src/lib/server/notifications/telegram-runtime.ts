import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { TelegramConfig } from './telegram';
import { resolveTelegramSettings, telegramConfigFromSettings, type TelegramSettingsRecord } from './telegram-settings';
import { TelegramServiceError } from './telegram-service';

let cached: { url: string; key: string; client: SupabaseClient<any, any, any> } | null = null;

export function telegramEnvironment(): Record<string, string | undefined> {
  return { ...process.env, ...publicEnv, ...privateEnv };
}

/** Lazy initialization lets installations without Telegram start and build normally. */
export function getTelegramDatabase(): SupabaseClient<any, any, any> | null {
  const variables = telegramEnvironment();
  const url = variables.PUBLIC_SUPABASE_URL?.trim();
  const key = variables.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  if (!cached || cached.url !== url || cached.key !== key) {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init: RequestInit = {}) => fetch(input, {
          ...init,
          signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000)
        })
      }
    });
    cached = { url, key, client };
  }
  return cached.client;
}

export async function getTelegramSettings(): Promise<{ record: TelegramSettingsRecord; available: boolean; db: SupabaseClient<any, any, any> }> {
  const db = getTelegramDatabase();
  if (!db) throw new TelegramServiceError('settings_unavailable');
  const result = await db.rpc('get_telegram_settings');
  if (result.error) {
    // Only a missing migration can use legacy environment configuration. A DB
    // outage must not accidentally re-enable a bot disabled in R&D settings.
    if (['PGRST202', '42883', '42P01'].includes(result.error.code)) {
      return { record: resolveTelegramSettings(null, telegramEnvironment()), available: false, db };
    }
    throw new TelegramServiceError('settings_unavailable');
  }
  return { record: resolveTelegramSettings(result.data, telegramEnvironment()), available: true, db };
}

export async function getTelegramRuntime(): Promise<{ config: TelegramConfig; db: SupabaseClient<any, any, any> } | null> {
  if (!getTelegramDatabase()) return null;
  const { record, db } = await getTelegramSettings();
  const config = telegramConfigFromSettings(record, telegramEnvironment());
  return config ? { config, db } : null;
}
