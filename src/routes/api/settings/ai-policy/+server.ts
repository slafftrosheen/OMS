import { json, type RequestHandler } from '@sveltejs/kit';
import { openRouterPolicyDatabase, parseOpenRouterPolicyChange, readOpenRouterPolicy } from '$lib/server/ai/provider-policy';

const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };

async function verifyUser(locals: App.Locals, write = false): Promise<Response | null> {
  if (!locals.user?.id) return json({ error: 'Sign in required' }, { status: 401, headers });
  const { data, error } = await locals.supabase.from('profiles')
    .select('role,is_active').eq('id', locals.user.id).single();
  if (error || data?.is_active !== true) return json({ error: 'Active OMS account required' }, { status: 403, headers });
  if (write && (data.role !== 'RD' || locals.user.role !== 'RD'))
    return json({ error: 'Only R&D can change the OpenRouter company policy' }, { status: 403, headers });
  return null;
}

export const GET: RequestHandler = async ({ locals }) => {
  const denial = await verifyUser(locals);
  if (denial) return denial;
  try { return json(await readOpenRouterPolicy(), { headers }); }
  catch { return json({ error: 'OpenRouter policy is unavailable. Apply the migration first.' }, { status: 503, headers }); }
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
  const denial = await verifyUser(locals, true);
  if (denial) return denial;
  // Avoid accepting arbitrary setting fields, unbounded JSON, or a missing boolean.
  if (Number(request.headers.get('content-length')) > 1024)
    return json({ error: 'Invalid settings request' }, { status: 413, headers });
  const body = await request.text().catch(() => '');
  if (body.length > 1024) return json({ error: 'Invalid settings request' }, { status: 413, headers });
  let enabled: boolean | null = null;
  try { enabled = parseOpenRouterPolicyChange(JSON.parse(body)); } catch { /* reject invalid JSON */ }
  if (enabled === null) return json({ error: 'Expected an enabled boolean' }, { status: 400, headers });
  try {
    const db = openRouterPolicyDatabase();
    const { data, error } = await db.from('openrouter_system_policy')
      .update({ enabled, updated_by: locals.user!.id, updated_at: new Date().toISOString() })
      .eq('singleton', true).select('enabled,updated_at,updated_by').single();
    if (error || data?.enabled !== enabled) throw new Error('policy_update_unavailable');
    const { error: auditError } = await db.from('audit_log').insert({
      user_id: locals.user!.id, action: enabled ? 'openrouter_global_sharing_enabled' : 'openrouter_global_sharing_disabled',
      entity_type: 'system_setting', details: { provider: 'openrouter', enabled }
    });
    if (auditError) console.error('[settings/ai-policy] audit failed:', auditError.code);
    return json({ enabled, updatedAt: data.updated_at, updatedBy: data.updated_by }, { headers });
  } catch {
    return json({ error: 'Could not update OpenRouter data-sharing policy' }, { status: 503, headers });
  }
};
