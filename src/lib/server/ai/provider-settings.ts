export function canManageOpenRouterKey(role: string | null | undefined): boolean {
  return role === 'RD';
}

export function maskSecret(value: string | null | undefined): { configured: boolean; masked: string } {
  if (!value) return { configured: false, masked: '' };
  return { configured: true, masked: `••••••••${value.length > 4 ? value.slice(-4) : ''}` };
}

export function normalizeOpenRouterKey(value: unknown): string {
  if (typeof value !== 'string') throw new Error('API key must be text');
  const key = value.trim();
  if (!key) throw new Error('API key is required');
  if (key.length > 512 || /\s/.test(key)) throw new Error('Invalid API key format');
  return key;
}

export const OPENROUTER_SECRET_NAME = 'reclame_oms_openrouter_api_key';

export function publicProviderSettings(configured: boolean, model: string) {
  return { provider: 'openrouter' as const, configured, model };
}

export function getVaultCredentialValue(data: unknown): string | null {
  if (typeof data === 'string') return data.trim() || null;
  if (Array.isArray(data) && typeof data[0]?.decrypted_secret === 'string') return data[0].decrypted_secret.trim() || null;
  if (data && typeof data === 'object' && typeof (data as { decrypted_secret?: unknown }).decrypted_secret === 'string') {
    return (data as { decrypted_secret: string }).decrypted_secret.trim() || null;
  }
  return null;
}

export function redactCredential(text: string, credential: string): string {
  return credential ? text.replaceAll(credential, '[redacted]') : text;
}
