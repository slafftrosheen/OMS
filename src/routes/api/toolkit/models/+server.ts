import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireToolkitManager } from '$lib/server/toolkit/access';
import { toolkitModelChoices, allowOpenRouterWebSearch } from '$lib/server/toolkit/ai-models';

export const GET: RequestHandler = ({ locals }) => {
  requireToolkitManager(locals.user);
  return json({
    models: toolkitModelChoices(),
    web: { searxng: true, openrouter: allowOpenRouterWebSearch() }
  }, { headers: { 'Cache-Control': 'private, no-store' } });
};
