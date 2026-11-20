export function activeAiProvider(): 'openrouter' | 'openai' {
  const provider = process.env.OMS_AI_PROVIDER?.trim() || 'openrouter';
  if (provider === 'openrouter' || provider === 'openai') return provider;
  throw new Error('Invalid OMS_AI_PROVIDER configuration');
}

export function openAiModels() {
  const textModel = process.env.OPENAI_MODEL?.trim() || 'gpt-6.1-terra';
  const visionModel = process.env.OPENAI_VISION_MODEL?.trim() || textModel;
  if (![textModel, visionModel].every(model => /^[a-z0-9][a-z0-9._-]{2,149}$/i.test(model)))
    throw new Error('OpenAI model settings unavailable');
  return { textModel, visionModel };
}

export async function readActiveAiModels() {
  if (activeAiProvider() === 'openai') return openAiModels();
  const { readOpenRouterModels } = await import('./provider-models');
  return readOpenRouterModels();
}

export async function isActiveAiConfigured() {
  if (activeAiProvider() === 'openai') return !!process.env.OPENAI_API_KEY?.trim();
  const { resolveOpenRouterApiKey } = await import('./provider-key');
  return !!(await resolveOpenRouterApiKey()).trim();
}
