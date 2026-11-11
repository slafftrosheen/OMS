/** Only persisted form content participates in the new-order leave guard.
 * Expanding profiles, changing preview pages and selecting UI tabs are not edits. */
export function creationFormFingerprint(fields: Record<string, unknown>, profiles: Array<{
  quantity: number; configuration: unknown; profileTemplateId?: string | null; notes?: string;
}>): string {
  return JSON.stringify([fields, profiles.map(p => ({
    quantity: p.quantity, configuration: p.configuration,
    profileTemplateId: p.profileTemplateId ?? null, notes: p.notes ?? ''
  }))]);
}

/** A staged upload may already belong to a draft after a partial save. Wait
 * for the canonical endpoint before removing it locally; failure stays retryable. */
export async function deleteCreationUpload(fileId: string, base = '', fetcher: typeof fetch = fetch): Promise<void> {
  const response = await fetcher(`${base}/api/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const message = typeof detail?.message === 'string' ? detail.message : typeof detail?.error === 'string' ? detail.error : '';
    throw new Error(message.slice(0, 320));
  }
}
