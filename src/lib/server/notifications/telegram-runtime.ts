import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { readTelegramConfig, type TelegramConfig } from './telegram';

let cached: { url: string; key: string; client: SupabaseClient<any, any, any> } | null = null;

/** Lazy initialization lets installations without Telegram start and build normally. */
export function getTelegramRuntime(): { config: TelegramConfig; db: SupabaseClient<any, any, any> } | null {
  const variables: Record<string, string | undefined> = { ...process.env, ...publicEnv, ...privateEnv };
  const config = readTelegramConfig(variables);
  if (!config) return null;
  const url = variables.PUBLIC_SUPABASE_URL!.trim();
  const key = variables.SUPABASE_SERVICE_ROLE_KEY!.trim();
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
  return { config, db: cached.client };
}
