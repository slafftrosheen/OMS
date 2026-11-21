import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { openRouterPolicyDatabase } from '$lib/server/ai/provider-policy';
import { canManageOpenRouterKey, parseAiProviderChange } from '$lib/server/ai/provider-settings';

const noStore = { 'Cache-Control': 'private, no-store' };
const reply = (body: object, status = 200) => json(body, { status, headers: noStore });

export function _createAiProviderSettingsHandler(database = openRouterPolicyDatabase): RequestHandler {
  return async ({ locals, request, url }) => {
    if (!locals.user) return reply({ error: 'Unauthorized' }, 401);
    if (!canManageOpenRouterKey(locals.user.role)) return reply({ error: 'Only R&D may manage AI providers' }, 403);
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return reply({ error: 'Cross-origin settings update denied' }, 403);
    const input = parseAiProviderChange(await request.json().catch(() => null));
    if (!input) return reply({ error: 'Enter a valid provider, model IDs and OpenAI API key.' }, 400);

    try {
      const db = database();
      const { error } = await db.rpc('set_oms_ai_provider', {
        p_provider: input.provider, p_text_model: input.textModel, p_vision_model: input.visionModel,
        p_api_key: input.apiKey, p_remove_key: input.removeKey,
      });
      if (error) throw new Error('Provider update failed');
      try {
        const { error: auditError } = await db.from('audit_log').insert({
          user_id: locals.user.id, action: 'oms_ai_provider_updated', entity_type: 'system_setting',
          details: { provider: input.provider, textModel: input.textModel, visionModel: input.visionModel,
            keyChange: input.removeKey ? 'removed' : input.apiKey ? 'rotated' : 'unchanged' },
        });
        if (auditError) console.error('[settings/ai-provider] audit insert failed');
      } catch { console.error('[settings/ai-provider] audit insert failed'); }
      return reply({ ok: true });
    } catch {
      return reply({ error: 'Could not save AI provider settings. Check the provider migration and Vault.' }, 503);
    }
  };
}
export const PUT = _createAiProviderSettingsHandler();
