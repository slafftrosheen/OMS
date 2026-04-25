import { json, type RequestHandler } from '@sveltejs/kit';
import { OLLAMA_URL, OLLAMA_PROBE_TIMEOUT as PROBE_TIMEOUT_MS } from '$lib/server/config';

export const GET: RequestHandler = async () => {
    const start = Date.now();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);

    try {
        const versionRes = await fetch(`${OLLAMA_URL}/api/version`, { signal: ctrl.signal });
        const tagsRes = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
        clearTimeout(t);

        if (!versionRes.ok) {
            return json({
                status: 'error',
                service: 'ollama',
                error: `Ollama /api/version returned ${versionRes.status}`,
                latency: Date.now() - start
            }, { status: 503 });
        }

        const version = await versionRes.json().catch(() => ({}));
        const tags = tagsRes.ok ? await tagsRes.json().catch(() => ({})) : { models: [] };
        const models = Array.isArray(tags?.models) ? tags.models.map((m: any) => m?.name).filter(Boolean) : [];

        return json({
            status: 'ok',
            service: 'ollama',
            host: OLLAMA_URL,
            version: version?.version ?? 'unknown',
            models,
            latency: Date.now() - start,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        clearTimeout(t);
        return json({
            status: 'error',
            service: 'ollama',
            host: OLLAMA_URL,
            error: err instanceof Error ? err.message : String(err),
            latency: Date.now() - start
        }, { status: 503 });
    }
};
