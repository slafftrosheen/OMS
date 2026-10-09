// Readiness: core OMS dependencies are required; OpenRouter is optional.
import { json, type RequestHandler } from '@sveltejs/kit';
import { isOpenRouterConfigured } from '$lib/server/ai/openrouter';
import { evaluateHealth, type ProbeStatus } from '$lib/server/health-policy';

async function probe(fn: () => Promise<void>): Promise<ProbeStatus> {
    const start = Date.now();
    try {
        await fn();
        return { status: 'ok', latency: Date.now() - start };
    } catch {
        // Public endpoint: never echo underlying database or provider errors.
        return { status: 'error', latency: Date.now() - start };
    }
}

export const GET: RequestHandler = async ({ locals }) => {
    const startTime = Date.now();
    const checks = {
        database: await probe(async () => {
            const { error } = await locals.supabase.from('profiles').select('id').limit(1);
            if (error) throw error;
        }),
        auth: await probe(async () => {
            const { error } = await locals.supabase.auth.getSession();
            if (error) throw error;
        }),
        openrouter: await probe(async () => {
            if (!(await isOpenRouterConfigured())) throw new Error('Provider not configured');
        })
    };
    const result = evaluateHealth(checks);
    return json({
        status: result.status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks,
        latency: Date.now() - startTime
    }, { status: result.httpStatus, headers: { 'Cache-Control': 'no-store' } });
};
