// src/routes/api/health/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { OLLAMA_URL, OLLAMA_PROBE_TIMEOUT as PROBE_TIMEOUT_MS } from '$lib/server/config';

async function probe(fn: () => Promise<void>) {
    const start = Date.now();
    try {
        await fn();
        return { status: 'ok' as const, latency: Date.now() - start };
    } catch (err) {
        return {
            status: 'error' as const,
            latency: Date.now() - start,
            error: err instanceof Error ? err.message : String(err)
        };
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
        ollama: await probe(async () => {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
            try {
                const r = await fetch(`${OLLAMA_URL}/api/version`, { signal: ctrl.signal });
                if (!r.ok) throw new Error(`Ollama returned ${r.status}`);
            } finally {
                clearTimeout(t);
            }
        })
    };

    const allOk = Object.values(checks).every((c) => c.status === 'ok');
    const totalLatency = Date.now() - startTime;

    return json(
        {
            status: allOk ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            checks,
            latency: totalLatency,
            version: dev ? 'dev' : process.env.npm_package_version || 'unknown'
        },
        {
            status: allOk ? 200 : 503,
            headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        }
    );
};
