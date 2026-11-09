import {json, type RequestHandler} from '@sveltejs/kit';
import {openRouterPolicyDatabase} from './provider-policy';
import {readOpenRouterModelCatalog, readOpenRouterModels} from './provider-models';
import {parseModelSelection, validateModelSelection, type ModelSelection} from '$lib/settings/openrouter-models';

const headers = {'Cache-Control': 'private, no-store'};
export function createProviderModelHandlers({database = openRouterPolicyDatabase,
  catalog = readOpenRouterModelCatalog, readModels = readOpenRouterModels} = {}) {
  async function denied(locals: App.Locals): Promise<Response | null> {
    if (!locals.user) return json({error: 'Sign in required'}, {status: 401, headers});
    if (locals.user.role !== 'RD') return json({error: 'Only R&D may change OpenRouter models'}, {status: 403, headers});
    const {data, error} = await locals.supabase.from('profiles').select('role,is_active').eq('id', locals.user.id).single();
    return error || data?.is_active !== true || data.role !== 'RD'
      ? json({error: 'An active R&D account is required'}, {status: 403, headers}) : null;
  }
  const GET: RequestHandler = async ({locals}) => {
    const denial = await denied(locals); if (denial) return denial;
    try {
      const models = await readModels();
      const choices = await catalog();
      return json({...models, choices}, {headers});
    } catch {
      return json({error: 'Model settings or the OpenRouter catalog are unavailable. Retry shortly.'}, {status: 503, headers});
    }
  };
  const PATCH: RequestHandler = async ({locals, request}) => {
    const denial = await denied(locals); if (denial) return denial;
    if (Number(request.headers.get('content-length')) > 1024)
      return json({error: 'Model settings request is too large'}, {status: 413, headers});
    const body = await request.text().catch(() => '');
    if (body.length > 1024) return json({error: 'Model settings request is too large'}, {status: 413, headers});
    let models: ModelSelection;
    try { models = parseModelSelection(JSON.parse(body)); }
    catch { return json({error: 'Choose valid text and vision model IDs'}, {status: 400, headers}); }
    let choices;
    try { choices = await catalog(); }
    catch { return json({error: 'Cannot verify model capabilities. Retry shortly; settings were not changed.'}, {status: 503, headers}); }
    try { validateModelSelection(models, choices); }
    catch (err) { return json({error: (err as Error).message}, {status: 400, headers}); }
    try {
      const db = database();
      const {data, error} = await db.from('openrouter_system_policy').update({
        text_model: models.textModel, vision_model: models.visionModel,
        updated_by: locals.user!.id, updated_at: new Date().toISOString()
      }).eq('singleton', true).select('text_model,vision_model').single();
      if (error || data?.text_model !== models.textModel || data?.vision_model !== models.visionModel)
        throw new Error('model_settings_update_unavailable');
      const {error: auditError} = await db.from('audit_log').insert({
        user_id: locals.user!.id, action: 'openrouter_models_updated', entity_type: 'system_setting', details: models
      });
      if (auditError) console.error('[settings/openrouter/models] audit failed:', auditError.code);
      return json({...models, ok: true}, {headers});
    } catch {
      return json({error: 'Could not save OpenRouter models. Check the model settings migration.'}, {status: 503, headers});
    }
  };
  return {GET, PATCH};
}
