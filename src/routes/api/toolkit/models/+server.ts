import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireToolkitManager } from '$lib/server/toolkit/access';
import { toolkitModelChoices, allowOpenRouterWebSearch } from '$lib/server/toolkit/ai-models';
import { readOpenRouterModels } from '$lib/server/ai/provider-models';

export const GET: RequestHandler = async ({ locals }) => {
  requireToolkitManager(locals.user);
  const models = await readOpenRouterModels();
  return json({
    models: toolkitModelChoices(models.textModel),
    web: { searxng: true, openrouter: allowOpenRouterWebSearch() },
    media: { visionModel: models.visionModel, pdfModel: models.textModel,
      paidOcr: process.env.OPENROUTER_TOOLKIT_PDF_OCR === 'true',
      imageLimitBytes: 8 * 1024 * 1024, pdfLimitBytes: 12 * 1024 * 1024 }
  }, { headers: { 'Cache-Control': 'private, no-store' } });
};
