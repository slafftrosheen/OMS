// src/lib/server/ai/swarm.ts
// ─────────────────────────────────────────────────────────────────────────────
// Legacy compatibility façade. Model chat is routed exclusively to OpenRouter;
// local Ollama nodes and Python inference sidecars are not used.
// ─────────────────────────────────────────────────────────────────────────────

import type { AiNode, Capability, ModelTag } from '$lib/server/config';
import { OPENROUTER_MODEL } from '$lib/server/config';
import { openRouterChat, openRouterComplete, openRouterError } from '$lib/server/ai/openrouter';

const OPENROUTER_NODE: AiNode = { idx: 0, label: 'openrouter', host: 'api.openrouter.ai', port: 443, caps: ['reasoning', 'vision', 'coder'], weight: 1, vramGb: 0 };
export async function listNodeStates() {
    const { resolveOpenRouterApiKey } = await import('$lib/server/ai/provider-key');
    const configured = Boolean((await resolveOpenRouterApiKey()).trim());
    return [{ label: 'openrouter', host: 'api.openrouter.ai', port: 443, caps: OPENROUTER_NODE.caps, inflight: 0, lastSeen: Date.now(), lastStatus: configured ? 'up' as const : 'down' as const, warmModels: [], weight: 1, vramGb: 0 }];
}
export async function refreshSwarmHealth(): Promise<void> { /* no probing until an inference request */ }
export function nodeLoad(): number { return 0; }
export function pickNode(_opts?: unknown): AiNode { return OPENROUTER_NODE; }
export function startSwarmHealthLoop(): void { /* no local nodes */ }
export function stopSwarmHealthLoop(): void { /* no local nodes */ }

// ─── High-level helpers ──────────────────────────────────────────────────────

export interface ChatOptions {
    model: ModelTag;
    messages: Array<{ role: string; content: string; images?: string[]; tool_calls?: unknown }>;
    tools?: unknown[];
    stream?: boolean;
    temperature?: number;
    timeoutMs?: number;
    cap?: Capability;
}

export interface ChatResult {
    node: AiNode;
    model: string;
    response: Response;
}

/** Hosted OpenRouter chat; legacy model tags fall back to configured router models. */
export async function swarmChat(opts: ChatOptions): Promise<ChatResult> {
    const requested = opts.model?.primary;
    const model = requested?.startsWith('openrouter/') || requested?.includes('/') ? requested : OPENROUTER_MODEL;
    const result = await openRouterChat({ model, messages: opts.messages as any, tools: opts.tools, stream: opts.stream, temperature: opts.temperature, timeoutMs: opts.timeoutMs });
    if (!result.response.ok) throw openRouterError(result.response, await result.response.text().catch(() => ''));
    return { node: OPENROUTER_NODE, model: result.model, response: result.response };
}

export { openRouterComplete };
