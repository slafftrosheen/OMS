// AI diagnostics are independent of core /api/health readiness.
// GET never sends a paid inference request; RD may explicitly POST to probe.
import { json, type RequestHandler } from '@sveltejs/kit';
import { activeAiProvider, isActiveAiConfigured, readActiveAiModels } from '$lib/server/ai/active-provider';
import { openRouterChat } from '$lib/server/ai/openrouter';

const noStore = { 'Cache-Control': 'private, no-store' };

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
    const configured = await isActiveAiConfigured().catch(() => false);
    let models;
    try { models = await readActiveAiModels(); }
    catch { return json({error: 'AI model settings unavailable'}, {status: 503, headers: noStore}); }
    return json({
        service: activeAiProvider(),
        configured,
        model: models.textModel,
        visionModel: models.visionModel,
        connectivity: 'not_tested',
        note: 'Configured only: availability requires an explicit administrator probe.'
    }, { headers: noStore });
};

export const POST: RequestHandler = async ({ locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
    if (locals.user.role !== 'RD') return json({ error: 'Only R&D can run provider probes' },
        { status: 403, headers: noStore });
    const start = Date.now();
    let service: ReturnType<typeof activeAiProvider> | 'unavailable' = 'unavailable';
    try {
        service = activeAiProvider();
        const { response, model } = await openRouterChat({
            messages: [{ role: 'user', content: 'Reply only OK.' }],
            stream: false,
            temperature: 0,
            maxTokens: 16,
            timeoutMs: 15_000
        });
        if (!response.ok) {
            return json({
                service, connectivity: 'failed',
                providerStatus: response.status, latencyMs: Date.now() - start
            }, { status: response.status === 429 ? 429 : 502, headers: noStore });
        }
        const payload = await response.json().catch(() => null);
        const text = payload?.choices?.[0]?.message?.content;
        if (typeof text !== 'string') {
            return json({ service, connectivity: 'unexpected_response', latencyMs: Date.now() - start },
                { status: 502, headers: noStore });
        }
        return json({ service, connectivity: 'ok', model,
            latencyMs: Date.now() - start, responseReceived: true }, { headers: noStore });
    } catch (err) {
        console.error('[AI health] Provider probe failed', err instanceof Error ? err.name : 'unknown');
        return json({ service, connectivity: 'failed', latencyMs: Date.now() - start },
            { status: 503, headers: noStore });
    }
};
