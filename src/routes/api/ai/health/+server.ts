import { json, type RequestHandler } from '@sveltejs/kit';
import { refreshSwarmHealth, listNodeStates } from '$lib/server/ai/swarm';

export const GET: RequestHandler = async () => {
    const start = Date.now();

    try {
        // Trigger a fresh health check of all nodes
        await refreshSwarmHealth();
        const nodes = await listNodeStates();

        const allUp = nodes.every(n => n.lastStatus === 'up');
        const anyUp = nodes.some(n => n.lastStatus === 'up');

        return json({
            status: allUp ? 'ok' : (anyUp ? 'degraded' : 'error'),
            service: 'swarm',
            nodes,
            latency: Date.now() - start,
            timestamp: new Date().toISOString()
        }, { status: anyUp ? 200 : 503 });
    } catch (err) {
        return json({
            status: 'error',
            service: 'swarm',
            error: err instanceof Error ? err.message : String(err),
            latency: Date.now() - start
        }, { status: 503 });
    }
};
