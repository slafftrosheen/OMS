import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { OPENROUTER_MODEL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from '$lib/server/config';
import { resolveOpenRouterApiKey } from '$lib/server/ai/provider-key';
import { canManageOpenRouterKey, maskSecret, normalizeOpenRouterKey, redactCredential } from '$lib/server/ai/provider-settings';

function database() {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Server credential is unavailable');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
function safeError(err: unknown, key = '') {
  const message = err instanceof Error ? err.message : 'Provider settings operation failed';
  return redactCredential(message, key).slice(0, 180);
}
function denied(locals: App.Locals): Response | null {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (!canManageOpenRouterKey(locals.user.role)) return json({ error: 'Only R&D may manage the system OpenRouter key' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  return null;
}

export const GET: RequestHandler = async ({ locals }) => {
  const accessError = denied(locals);
  if (accessError) return accessError;
  try {
    const key = await resolveOpenRouterApiKey();
    return json({ provider: 'openrouter', model: OPENROUTER_MODEL, ...maskSecret(key), source: key ? (process.env.OPENROUTER_API_KEY?.trim() ? 'environment-or-vault' : 'vault') : 'none' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[settings/openrouter] read failed:', safeError(err));
    return json({ error: safeError(err) }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};

export const PUT: RequestHandler = async ({ locals, request }) => {
  const accessError = denied(locals);
  if (accessError) return accessError;
  let apiKey: string;
  try { apiKey = normalizeOpenRouterKey((await request.json().catch(() => null))?.apiKey); }
  catch (err) { return json({ error: safeError(err) }, { status: 400, headers: { 'Cache-Control': 'no-store' } }); }
  try {
    const db = database();
    const { error } = await db.rpc('set_openrouter_api_key', { p_api_key: apiKey });
    if (error) throw new Error('Could not store the encrypted provider key; apply the OpenRouter Vault migration.');
    const { error: auditError } = await db.from('audit_log').insert({
      user_id: locals.user!.id,
      action: 'openrouter_key_rotated',
      entity_type: 'system_setting',
      details: { provider: 'openrouter' }
    });
    if (auditError) console.error('[settings/openrouter] audit insert failed:', auditError.code);
    return json({ ok: true, ...maskSecret(apiKey) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[settings/openrouter] update failed:', safeError(err, apiKey));
    return json({ error: safeError(err, apiKey) }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};

export const DELETE: RequestHandler = async ({ locals }) => {
  const accessError = denied(locals);
  if (accessError) return accessError;
  try {
    const db = database();
    const { error } = await db.rpc('delete_openrouter_api_key');
    if (error) throw new Error('Could not remove the encrypted provider key; apply the OpenRouter Vault migration.');
    const { error: auditError } = await db.from('audit_log').insert({
      user_id: locals.user!.id,
      action: 'openrouter_key_removed',
      entity_type: 'system_setting',
      details: { provider: 'openrouter' }
    });
    if (auditError) console.error('[settings/openrouter] audit insert failed:', auditError.code);
    const envFallback = Boolean(process.env.OPENROUTER_API_KEY?.trim());
    return json({ ok: true, configured: envFallback }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[settings/openrouter] removal failed:', safeError(err));
    return json({ error: safeError(err) }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
