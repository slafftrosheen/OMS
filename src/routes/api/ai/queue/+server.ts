// GET /api/ai/queue — current per-(node, capability) request queue depth.
// Used by the AI Lab dashboard "swarm" tile to expose backpressure.

import type { RequestHandler } from '@sveltejs/kit';
import { json, error as svelteError } from '@sveltejs/kit';
import { stats } from '$lib/server/ai/queue';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.supabase || !locals.user) throw svelteError(401, 'Unauthorized');
    return json({ queues: stats(), now: Date.now() });
};
