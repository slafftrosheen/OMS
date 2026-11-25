// Safe, canonical account failures. Raw upstream messages may contain prompts
// or credentials and must never leave the provider boundary.
export const BILLING_ERROR_TYPES = [
  'credit_balance_exhausted', 'insufficient_quota', 'project_spend_limit_exceeded',
  'organization_spend_limit_exceeded', 'organization_usage_limit_exceeded'
] as const;

/** Bound failure reads before parsing; some providers echo whole documents. */
export async function readProviderFailure(response: Response): Promise<any> {
  if (!response.body) return null;
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let text = '', bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 65_536) { await reader.cancel().catch(() => {}); return null; }
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch { return null; }
  finally { reader.releaseLock(); }
}
