import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

let cached: { url: string; key: string; db: SupabaseClient } | null = null;

/** Private Storage access and lease RPCs never use a browser-provided credential. */
export function getChatVoiceDatabase(): SupabaseClient | null {
  const variables: Record<string, string | undefined> = { ...process.env, ...publicEnv, ...privateEnv };
  const url = variables.PUBLIC_SUPABASE_URL?.trim();
  const key = variables.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) { cached = null; return null; }
  if (!cached || cached.url !== url || cached.key !== key) cached = { url, key, db: createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init: RequestInit = {}) => fetch(input, {
      ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000)
    }) }
  }) };
  return cached.db;
}
