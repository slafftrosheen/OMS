import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireToolkitManager } from '$lib/server/toolkit/access';
import { toolkitModelChoices, allowOpenRouterWebSearch } from '$lib/server/toolkit/ai-models';
import { OPENROUTER_VISION_MODEL, OPENROUTER_MODEL } from '$lib/server/config';

export const GET: RequestHandler = ({ locals }) => {
  requireToolkitManager(locals.user);
  return json({
    models: toolkitModelChoices(),
    web: { searxng: true, openrouter: allowOpenRouterWebSearch() },
    media: { visionModel: OPENROUTER_VISION_MODEL, pdfModel: OPENROUTER_MODEL,
      paidOcr: process.env.OPENROUTER_TOOLKIT_PDF_OCR === 'true',
      imageLimitBytes: 8 * 1024 * 1024, pdfLimitBytes: 12 * 1024 * 1024 }
  }, { headers: { 'Cache-Control': 'private, no-store' } });
};
