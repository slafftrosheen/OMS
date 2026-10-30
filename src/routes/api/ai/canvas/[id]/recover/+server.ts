import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { recoverToolkitCanvas } from '$lib/server/toolkit/recovery';
import { requireToolkitManager } from '$lib/server/toolkit/access';

export const POST: RequestHandler = async ({ locals, params, request }) => {
  requireToolkitManager(locals.user);
  const result = await recoverToolkitCanvas(locals, params.id, await request.json().catch(() => null));
  return json(result, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
};
