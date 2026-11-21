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

export type AiProvider = 'openrouter' | 'openai';

export function isOpenAiModelId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{2,149}$/i.test(value);
}

export function parseAiProviderChange(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !['provider', 'textModel', 'visionModel', 'apiKey', 'removeKey'].includes(key))) return null;
  const provider = value.provider;
  if (provider !== 'openrouter' && provider !== 'openai') return null;
  const textModel = typeof value.textModel === 'string' ? value.textModel.trim() : null;
  const visionModel = typeof value.visionModel === 'string' ? value.visionModel.trim() : null;
  if (!isOpenAiModelId(textModel) || !isOpenAiModelId(visionModel)) return null;
  if (value.removeKey !== undefined && typeof value.removeKey !== 'boolean') return null;
  if (value.apiKey !== undefined && value.removeKey === true) return null;
  let apiKey: string | null = null;
  if (value.apiKey !== undefined) {
    try { apiKey = normalizeOpenRouterKey(value.apiKey); } catch { return null; }
    if (!/^sk-[A-Za-z0-9_-]+$/.test(apiKey)) return null;
  }
  return { provider, textModel, visionModel, apiKey, removeKey: value.removeKey === true };
}
