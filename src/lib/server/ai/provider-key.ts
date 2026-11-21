import { OPENROUTER_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from '$lib/server/config';
import { getVaultCredentialValue } from './provider-settings';
import { createClient } from '@supabase/supabase-js';

export interface VaultRpcClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}
export type VaultKeyReader = () => Promise<string | null>;

export async function readVaultProviderKey(client: VaultRpcClient, provider: 'openrouter' | 'openai' = 'openrouter'): Promise<string | null> {
  const { data, error } = await client.rpc(provider === 'openai' ? 'get_oms_openai_api_key' : 'get_openrouter_api_key');
  if (error) throw new Error('Vault provider settings are unavailable');
  return getVaultCredentialValue(data);
}

async function serverVaultReader(provider: 'openrouter' | 'openai' = 'openrouter'): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return readVaultProviderKey(client, provider);
}

export async function getProviderApiKey(vaultReader: VaultKeyReader, environmentKey: string): Promise<string> {
  try {
    const vaultKey = await vaultReader();
    if (vaultKey?.trim()) return vaultKey.trim();
  } catch {
    // Keep an explicitly configured service-environment key available during a DB/Vault outage.
  }
  return environmentKey.trim();
}

export async function resolveOpenRouterApiKey(): Promise<string> {
  return getProviderApiKey(serverVaultReader, OPENROUTER_API_KEY);
}

export async function storedOpenAiApiKey(): Promise<string | null> {
  return serverVaultReader('openai');
}

export async function resolveOpenAiApiKey(): Promise<string> {
  return getProviderApiKey(storedOpenAiApiKey, process.env.OPENAI_API_KEY ?? '');
}

export function noKeyReturnedToClient(): true { return true; }
