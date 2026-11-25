// AI diagnostics are independent of core /api/health readiness.
// GET never sends a paid inference request; RD may explicitly POST to probe.
import { json, type RequestHandler } from '@sveltejs/kit';
import { readAiRouting, isActiveAiConfigured, readActiveAiModels } from '$lib/server/ai/active-provider';
import { openRouterChat, providerBillingFailure } from '$lib/server/ai/openrouter';

const noStore = { 'Cache-Control': 'private, no-store' };

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
    let routing, models;
    try {
      routing = await readAiRouting();
      models = await readActiveAiModels(routing);
    }
    catch { return json({error: 'AI model settings unavailable'}, {status: 503, headers: noStore}); }
    return json({
        service: routing.provider,
        configured: await isActiveAiConfigured(routing).catch(() => false),
        model: models.textModel,
        visionModel: models.visionModel,
        connectivity: 'not_tested',
        note: 'Configured only: availability requires an explicit administrator probe.'
    }, { headers: noStore });
};

export const POST: RequestHandler = async ({ locals, request, url }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
    if (locals.user.role !== 'RD') return json({ error: 'Only R&D can run provider probes' },
        { status: 403, headers: noStore });
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin)
        return json({ error: 'Cross-origin provider probe denied' }, { status: 403, headers: noStore });
    const start = Date.now();
    let service: 'openrouter' | 'openai' | 'unavailable' = 'unavailable';
    try {
        const routing = await readAiRouting();
        service = routing.provider;
        const { response, model } = await openRouterChat({
            aiRouting: routing,
            messages: [{ role: 'user', content: 'Reply only OK.' }],
            stream: false,
            temperature: 0,
            maxTokens: 64,
            timeoutMs: 15_000,
            signal: request.signal
        });
        if (!response.ok) {
            return json({
                service, connectivity: 'failed',
                providerStatus: response.status, latencyMs: Date.now() - start
            }, { status: response.status === 429 ? 429 : 502, headers: noStore });
        }
        const payload = await response.json().catch(() => null);
        const text = payload?.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || !text.trim()) {
            return json({ service, connectivity: 'unexpected_response', latencyMs: Date.now() - start },
                { status: 502, headers: noStore });
        }
        return json({ service, connectivity: 'ok', model,
            latencyMs: Date.now() - start, responseReceived: true }, { headers: noStore });
    } catch (err) {
        const billing = providerBillingFailure(err);
        if (billing) return json({ ...billing, service, connectivity: 'billing_required', latencyMs: Date.now() - start },
          { status: 402, headers: noStore });
        console.error('[AI health] Provider probe failed', err instanceof Error ? err.name : 'unknown');
        return json({ service, connectivity: 'failed', latencyMs: Date.now() - start },
            { status: 503, headers: noStore });
    }
};
