import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from '$lib/server/config';

/** Company-wide permission. Missing migration, credentials, or DB outage
 * must deny provider transmission, never silently use an environment fallback. */
export interface OpenRouterPolicy {
  enabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}
export function validPolicyRow(row: unknown): row is { enabled: boolean; updated_at?: string | null; updated_by?: string | null } {
  return row !== null && typeof row === 'object' && !Array.isArray(row)
    && typeof (row as Record<string, unknown>).enabled === 'boolean';
}
export function parseOpenRouterPolicyChange(input: unknown): boolean | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const object = input as Record<string, unknown>;
  return Object.keys(object).length === 1 && typeof object.enabled === 'boolean' ? object.enabled : null;
}

export function openRouterPolicyDatabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('OpenRouter policy database is not configured');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function readOpenRouterPolicy(): Promise<OpenRouterPolicy> {
  const { data, error } = await openRouterPolicyDatabase().from('openrouter_system_policy')
    .select('enabled,updated_at,updated_by').eq('singleton', true).single();
  if (error || !validPolicyRow(data)) throw new Error('OpenRouter company policy unavailable; check the migration and database');
  return {
    enabled: data.enabled,
    updatedAt: typeof data.updated_at === 'string' ? data.updated_at : null,
    updatedBy: typeof data.updated_by === 'string' ? data.updated_by : null
  };
}

export async function assertOpenRouterPolicyEnabled(): Promise<void> {
  // Fail closed on any read error, including missing migration and transient outage.
  let policy: OpenRouterPolicy;
  try { policy = await readOpenRouterPolicy(); }
  catch { throw new Error('OpenRouter is blocked: R&D data-sharing policy is unavailable'); }
  if (!policy.enabled) throw new Error('OpenRouter data sharing is disabled by R&D in Settings');
}
