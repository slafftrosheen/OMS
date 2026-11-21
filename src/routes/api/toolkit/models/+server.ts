import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireToolkitManager } from '$lib/server/toolkit/access';
import { toolkitModelChoices, allowOpenRouterWebSearch } from '$lib/server/toolkit/ai-models';
import { readActiveAiModels, readAiRouting } from '$lib/server/ai/active-provider';

export const GET: RequestHandler = async ({ locals }) => {
  requireToolkitManager(locals.user);
  const routing = await readAiRouting();
  const models = await readActiveAiModels(routing);
  return json({
    provider: routing.provider,
    models: toolkitModelChoices(models.textModel, undefined, routing.provider),
    web: { searxng: true, openrouter: allowOpenRouterWebSearch(routing.provider) },
    media: { visionModel: models.visionModel, pdfModel: models.textModel,
      paidOcr: routing.provider === 'openrouter' && process.env.OPENROUTER_TOOLKIT_PDF_OCR === 'true',
      imageLimitBytes: 8 * 1024 * 1024, pdfLimitBytes: 12 * 1024 * 1024 }
  }, { headers: { 'Cache-Control': 'private, no-store' } });
};
