// GET /api/ai/swarm — current state of every AI node (live, in-memory).

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { listNodeStates, refreshSwarmHealth } from '$lib/server/ai/swarm';

export const GET: RequestHandler = async ({ url }) => {
    if (url.searchParams.get('refresh') === '1') {
        await refreshSwarmHealth();
    }
    return json({ nodes: listNodeStates(), now: Date.now() });
};
