import {OPENROUTER_MODEL, OPENROUTER_VISION_MODEL} from '$lib/server/config';
import {openRouterPolicyDatabase} from './provider-policy';
import {normalizeModelCatalog, parseModelSelection, type ModelChoice, type ModelSelection} from '$lib/settings/openrouter-models';

export const environmentModelDefaults: ModelSelection = {textModel: OPENROUTER_MODEL, visionModel: OPENROUTER_VISION_MODEL};

export async function readOpenRouterModels(db = openRouterPolicyDatabase()): Promise<ModelSelection> {
  const {data, error} = await db.from('openrouter_system_policy').select('text_model,vision_model').eq('singleton', true).single();
  if (error || !data) throw new Error('OpenRouter model settings unavailable; apply the model settings migration');
  return parseModelSelection({textModel: data.text_model ?? OPENROUTER_MODEL, visionModel: data.vision_model ?? OPENROUTER_VISION_MODEL});
}

let catalogCache: {models: ModelChoice[]; expires: number} | null = null;
export async function readOpenRouterModelCatalog(): Promise<ModelChoice[]> {
  if (catalogCache && catalogCache.expires > Date.now()) return catalogCache.models;
  // Public metadata only; no credential, prompt or customer document is sent.
  const response = await fetch('https://openrouter.ai/api/v1/models', {signal: AbortSignal.timeout(10_000)});
  if (!response.ok) throw new Error('OpenRouter model catalog is unavailable; retry shortly');
  const models = normalizeModelCatalog(await response.json());
  if (!models.length) throw new Error('OpenRouter returned an empty model catalog');
  catalogCache = {models, expires: Date.now() + 60_000};
  return models;
}
