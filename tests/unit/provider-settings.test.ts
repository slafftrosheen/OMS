import { describe, expect, it } from 'vitest';
import {
  canManageOpenRouterKey,
  getVaultCredentialValue,
  maskSecret,
  normalizeOpenRouterKey,
  redactCredential
} from '../../src/lib/server/ai/provider-settings';
import { getProviderApiKey, readVaultProviderKey } from '../../src/lib/server/ai/provider-key';

function throws(fn: () => unknown, contains: string) {
  let message = '';
  try { fn(); } catch (error) { message = error instanceof Error ? error.message : String(error); }
  expect(message.includes(contains)).toBe(true);
}

describe('OpenRouter settings authorization and secret masking', () => {
  it('allows only R&D role to manage the system provider key', () => {
    expect(canManageOpenRouterKey('RD')).toBe(true);
    expect(canManageOpenRouterKey('Boss')).toBe(false);
    expect(canManageOpenRouterKey('HeadOfProduction')).toBe(false);
    expect(canManageOpenRouterKey('Operator')).toBe(false);
    expect(canManageOpenRouterKey(null)).toBe(false);
  });

  it('never returns a stored key and reveals only its configured state and mask', () => {
    expect(maskSecret('sk-or-v1-0123456789abcdef')).toEqual({ configured: true, masked: '••••••••cdef' });
    expect(maskSecret('short')).toEqual({ configured: true, masked: '••••••••hort' });
    expect(maskSecret('')).toEqual({ configured: false, masked: '' });
    expect(maskSecret('real-secret-value').masked).not.toContain('real-secret-value');
  });

  it('reads the decrypted credential shape from Vault and redacts it from errors', () => {
    expect(getVaultCredentialValue([{ decrypted_secret: 'sk-test' }])).toBe('sk-test');
    expect(getVaultCredentialValue({ decrypted_secret: ' ' })).toBeNull();
    expect(redactCredential('request failed sk-test', 'sk-test')).toBe('request failed [redacted]');
  });

  it('validates replacement credentials', () => {
    throws(() => normalizeOpenRouterKey(''), 'API key is required');
    throws(() => normalizeOpenRouterKey('key with spaces'), 'Invalid API key format');
    throws(() => normalizeOpenRouterKey('x'.repeat(513)), 'Invalid API key format');
    expect(normalizeOpenRouterKey('  valid-key  ')).toBe('valid-key');
  });

  it('prefers shared Vault key, falls back to service environment, and reports missing config', async () => {
    const vault = async () => 'vault-key';
    expect(await getProviderApiKey(vault, 'env-key')).toBe('vault-key');
    expect(await getProviderApiKey(async () => null, 'env-key')).toBe('env-key');
    expect(await getProviderApiKey(async () => null, '')).toBe('');
  });

  it('reads the server credential through the restricted settings RPC, not Vault tables', async () => {
    const calls: string[] = [];
    const mockClient = { rpc: async (name: string) => { calls.push(name); return { data: 'vault-key', error: null }; } } as any;
    expect(await readVaultProviderKey(mockClient)).toBe('vault-key');
    expect(calls).toEqual(['get_openrouter_api_key']);
  });
});
