import { isOpenAiModelId, type AiProvider } from './provider-settings';

export function activeAiProvider(): AiProvider {
  const provider = process.env.OMS_AI_PROVIDER?.trim() || 'openrouter';
  if (provider === 'openrouter' || provider === 'openai') return provider;
  throw new Error('Invalid OMS_AI_PROVIDER configuration');
}

export function openAiModels() {
  const textModel = process.env.OPENAI_MODEL?.trim() || 'gpt-6.1-terra';
  const visionModel = process.env.OPENAI_VISION_MODEL?.trim() || textModel;
  if (![textModel, visionModel].every(isOpenAiModelId)) throw new Error('OpenAI model settings unavailable');
  return { textModel, visionModel };
}
export interface AiRouting {
  provider: AiProvider;
  openAI: { textModel: string; visionModel: string };
  managed: boolean;
}

export function aiRoutingFromRow(row: Record<string, unknown>, managed = true): AiRouting {
  const provider = row.active_provider ?? activeAiProvider();
  const textModel = row.openai_text_model ?? openAiModels().textModel;
  const visionModel = row.openai_vision_model ?? row.openai_text_model ?? openAiModels().visionModel;
  if ((provider !== 'openrouter' && provider !== 'openai') ||
      !isOpenAiModelId(textModel) || !isOpenAiModelId(visionModel)) throw new Error('AI provider settings unavailable');
  return { provider, openAI: { textModel, visionModel }, managed };
}

export async function readAiRouting(): Promise<AiRouting> {
  const { openRouterPolicyDatabase } = await import('./provider-policy');
  const { data, error } = await openRouterPolicyDatabase().from('openrouter_system_policy')
    .select('active_provider,openai_text_model,openai_vision_model').eq('singleton', true).single();
  // Old deployments keep their explicit environment selection until the migration runs.
  if (error?.code === '42703' || error?.code === 'PGRST204') return aiRoutingFromRow({}, false);
  if (error || !data) throw new Error('AI provider settings unavailable');
  return aiRoutingFromRow(data);
}

export async function readActiveAiModels(routing?: AiRouting) {
  const selection = routing ?? await readAiRouting();
  if (selection.provider === 'openai') return selection.openAI;
  const { readOpenRouterModels } = await import('./provider-models');
  return readOpenRouterModels();
}

export async function isActiveAiConfigured(routing?: AiRouting) {
  const selection = routing ?? await readAiRouting();
  const { resolveOpenAiApiKey, resolveOpenRouterApiKey } = await import('./provider-key');
  return !!(await (selection.provider === 'openai' ? resolveOpenAiApiKey() : resolveOpenRouterApiKey())).trim();
}
