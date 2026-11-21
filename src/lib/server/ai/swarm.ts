// src/lib/server/ai/swarm.ts
// ─────────────────────────────────────────────────────────────────────────────
// Legacy compatibility façade. Model chat uses the configured hosted provider;
// local Ollama nodes and Python inference sidecars are not used.
// ─────────────────────────────────────────────────────────────────────────────

import { activeAiProvider, isActiveAiConfigured, readAiRouting } from './active-provider';
import type { AiNode, Capability, ModelTag } from '$lib/server/config';
import { OPENROUTER_MODEL } from '$lib/server/config';
import { openRouterChat, openRouterComplete, openRouterError } from '$lib/server/ai/openrouter';

const OPENROUTER_NODE: AiNode = { idx: 0, label: 'openrouter', host: 'api.openrouter.ai', port: 443, caps: ['reasoning', 'vision', 'coder'], weight: 1, vramGb: 0 };
const OPENAI_NODE: AiNode = { ...OPENROUTER_NODE, label: 'openai', host: 'api.openai.com' };
export async function listNodeStates() {
    const routing = await readAiRouting();
    const configured = await isActiveAiConfigured(routing);
    const node = pickNode(routing.provider);
    return [{ label: node.label, host: node.host, port: 443, caps: node.caps, inflight: 0, lastSeen: Date.now(), lastStatus: configured ? 'up' as const : 'down' as const, warmModels: [], weight: 1, vramGb: 0 }];
}
export async function refreshSwarmHealth(): Promise<void> { /* no probing until an inference request */ }
export function nodeLoad(): number { return 0; }
export function pickNode(provider = activeAiProvider()): AiNode { return provider === 'openai' ? OPENAI_NODE : OPENROUTER_NODE; }
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

/** Hosted AI chat with the deployment's provider and model configuration. */
export async function swarmChat(opts: ChatOptions): Promise<ChatResult> {
    const requested = opts.model?.primary;
    const model = requested?.startsWith('openrouter/') || requested?.includes('/') ? requested : OPENROUTER_MODEL;
    const routing = await readAiRouting();
    const result = await openRouterChat({ aiRouting: routing, model, messages: opts.messages as any, tools: opts.tools, stream: opts.stream, temperature: opts.temperature, timeoutMs: opts.timeoutMs });
    if (!result.response.ok) throw openRouterError(result.response, await result.response.text().catch(() => ''));
    return { node: pickNode(routing.provider), model: result.model, response: result.response };
}

export { openRouterComplete };
