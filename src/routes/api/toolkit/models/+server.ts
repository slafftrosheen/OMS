import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireToolkitManager } from '$lib/server/toolkit/access';
import { toolkitModelChoices, allowOpenRouterWebSearch } from '$lib/server/toolkit/ai-models';
import { readActiveAiModels, activeAiProvider } from '$lib/server/ai/active-provider';

export const GET: RequestHandler = async ({ locals }) => {
  requireToolkitManager(locals.user);
  const models = await readActiveAiModels();
  return json({
    models: toolkitModelChoices(models.textModel),
    web: { searxng: true, openrouter: allowOpenRouterWebSearch() },
    media: { visionModel: models.visionModel, pdfModel: models.textModel,
      paidOcr: activeAiProvider() === 'openrouter' && process.env.OPENROUTER_TOOLKIT_PDF_OCR === 'true',
      imageLimitBytes: 8 * 1024 * 1024, pdfLimitBytes: 12 * 1024 * 1024 }
  }, { headers: { 'Cache-Control': 'private, no-store' } });
};
