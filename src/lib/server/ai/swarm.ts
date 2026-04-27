// src/lib/server/ai/swarm.ts
// ─────────────────────────────────────────────────────────────────────────────
// Reclame AI Swarm Router
//
// Picks the best AI node for a given task:
//   1. Filter by capability tag (e.g. 'image-gen' → only nodes that have it).
//   2. Prefer nodes that already have the model loaded warm (Ollama
//      keep-alive). Falls back to least-loaded.
//   3. Health-check (probe Ollama + sidecar). Skip nodes that are down.
//   4. On request failure (timeout, OOM, model-not-found), retry on the next
//      eligible node and finally try the model's PRIMARY → FALLBACK pair.
//
// All consumers (orchestrator, ingestion worker, forge endpoints, tool
// executors) go through this module so we don't sprinkle node URLs anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import {
    AI_NODES,
    type AiNode,
    type Capability,
    type ModelTag,
    OLLAMA_TIMEOUT_MS,
    OLLAMA_PROBE_TIMEOUT,
    OLLAMA_KEEP_ALIVE,
    OLLAMA_NUM_CTX,
    OLLAMA_NUM_PREDICT
} from '$lib/server/config';
import { logger } from '$lib/server/logging/logger';

// ─── In-memory node state ────────────────────────────────────────────────────

interface NodeState {
    node: AiNode;
    inflight: number;
    lastSeen: number;
    lastStatus: 'up' | 'down' | 'degraded' | 'unknown';
    /** model tags currently warm-loaded on this node (reported by /api/ps) */
    warmModels: Set<string>;
    consecutiveFailures: number;
}

const STATE: Map<string, NodeState> = new Map(
    AI_NODES.map((n) => [
        n.label,
        {
            node: n,
            inflight: 0,
            lastSeen: 0,
            lastStatus: 'unknown' as const,
            warmModels: new Set<string>(),
            consecutiveFailures: 0
        }
    ])
);

export function listNodeStates(): Array<{
    label: string;
    host: string;
    port: number;
    sidecarUrl: string;
    caps: Capability[];
    inflight: number;
    lastSeen: number;
    lastStatus: NodeState['lastStatus'];
    warmModels: string[];
    weight: number;
    vramGb: number;
}> {
    return [...STATE.values()].map((s) => ({
        label: s.node.label,
        host: s.node.host,
        port: s.node.port,
        sidecarUrl: s.node.sidecarUrl,
        caps: s.node.caps,
        inflight: s.inflight,
        lastSeen: s.lastSeen,
        lastStatus: s.lastStatus,
        warmModels: [...s.warmModels],
        weight: s.node.weight,
        vramGb: s.node.vramGb
    }));
}

// ─── Probes ──────────────────────────────────────────────────────────────────

async function probeOllama(node: AiNode): Promise<{ up: boolean; warm: string[] }> {
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), OLLAMA_PROBE_TIMEOUT);
        const res = await fetch(`${node.ollamaUrl}/api/ps`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) return { up: false, warm: [] };
        const j = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
        const warm = (j.models ?? [])
            .map((m) => m.model ?? m.name ?? '')
            .filter(Boolean);
        return { up: true, warm };
    } catch {
        return { up: false, warm: [] };
    }
}

async function probeSidecar(node: AiNode): Promise<boolean> {
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), OLLAMA_PROBE_TIMEOUT);
        const res = await fetch(`${node.sidecarUrl}/health`, { signal: ctrl.signal });
        clearTimeout(timer);
        return res.ok;
    } catch {
        return false;
    }
}

/** Refresh node state. Call periodically (e.g. every 15s). */
export async function refreshSwarmHealth(): Promise<void> {
    await Promise.all(
        [...STATE.values()].map(async (s) => {
            const wantsSidecar = s.node.caps.some((c) =>
                ['image-gen', 'mesh-gen', 'asr', 'tts', 'rerank', 'colpali'].includes(c)
            );
            const [ollama, sidecarUp] = await Promise.all([
                probeOllama(s.node),
                wantsSidecar ? probeSidecar(s.node) : Promise.resolve(true)
            ]);
            s.lastSeen = Date.now();
            s.warmModels = new Set(ollama.warm);
            if (ollama.up && sidecarUp) s.lastStatus = 'up';
            else if (ollama.up || sidecarUp) s.lastStatus = 'degraded';
            else s.lastStatus = 'down';
        })
    );
}

// ─── Picker ──────────────────────────────────────────────────────────────────

export interface PickOptions {
    /** Required capability for this task. */
    cap: Capability;
    /** Model tag we'd like loaded. Used to prefer warm nodes. */
    model?: string;
    /** Exclude these labels (used during retry). */
    exclude?: Set<string>;
}

export function pickNode(opts: PickOptions): AiNode | null {
    const candidates = [...STATE.values()].filter((s) => {
        if (opts.exclude?.has(s.node.label)) return false;
        if (s.node.weight <= 0) return false;
        if (s.lastStatus === 'down') return false;
        if (!s.node.caps.includes(opts.cap)) return false;
        return true;
    });

    if (candidates.length === 0) {
        // If we have no recent health data yet, fall back to capability-only.
        const stale = AI_NODES.filter(
            (n) => n.caps.includes(opts.cap) && !opts.exclude?.has(n.label)
        );
        return stale[0] ?? null;
    }

    // Sort: warm-with-model first, then least-loaded × inverse-weight.
    candidates.sort((a, b) => {
        const aWarm = opts.model && a.warmModels.has(opts.model) ? 0 : 1;
        const bWarm = opts.model && b.warmModels.has(opts.model) ? 0 : 1;
        if (aWarm !== bWarm) return aWarm - bWarm;
        const aLoad = a.inflight / Math.max(0.0001, a.node.weight);
        const bLoad = b.inflight / Math.max(0.0001, b.node.weight);
        return aLoad - bLoad;
    });

    return candidates[0]?.node ?? null;
}

function track<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const s = STATE.get(label);
    if (s) s.inflight++;
    return fn().finally(() => {
        if (s) s.inflight = Math.max(0, s.inflight - 1);
    });
}

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

/** Stream-or-not chat against the swarm with PRIMARY → FALLBACK retry. */
export async function swarmChat(opts: ChatOptions): Promise<ChatResult> {
    const cap: Capability = opts.cap ?? 'reasoning';
    const tried = new Set<string>();
    const variants = [opts.model.primary, opts.model.fallback];

    for (const model of variants) {
        for (let attempt = 0; attempt < AI_NODES.length; attempt++) {
            const node = pickNode({ cap, model, exclude: tried });
            if (!node) break;
            tried.add(node.label);

            try {
                const res = await track(node.label, () =>
                    callOllamaChat(node, model, opts)
                );
                if (res.ok) return { node, model, response: res };
                logger.warn('Swarm chat non-OK', {
                    node: node.label,
                    model,
                    status: res.status
                });
            } catch (err) {
                logger.warn('Swarm chat error', {
                    node: node.label,
                    model,
                    error: (err as Error).message
                });
            }
        }
        // primary exhausted across all nodes → try fallback model
        tried.clear();
    }

    throw new Error('Swarm: no node could serve the request');
}

async function callOllamaChat(
    node: AiNode,
    model: string,
    opts: ChatOptions
): Promise<Response> {
    const ctrl = new AbortController();
    const timeout = opts.timeoutMs ?? OLLAMA_TIMEOUT_MS;
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const body = {
        model,
        messages: opts.messages,
        stream: opts.stream ?? false,
        keep_alive: OLLAMA_KEEP_ALIVE,
        options: {
            num_ctx: OLLAMA_NUM_CTX,
            num_predict: OLLAMA_NUM_PREDICT,
            temperature: opts.temperature ?? 0.6
        },
        ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools } : {})
    };
    try {
        return await fetch(`${node.ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: ctrl.signal
        });
    } finally {
        clearTimeout(timer);
    }
}

/** Generate a dense embedding via the swarm. Returns {vector, model, node}. */
export async function swarmEmbed(
    text: string,
    model: ModelTag
): Promise<{ vector: number[]; model: string; node: string }> {
    const variants = [model.primary, model.fallback];
    const tried = new Set<string>();
    for (const m of variants) {
        for (let i = 0; i < AI_NODES.length; i++) {
            const node = pickNode({ cap: 'embed', model: m, exclude: tried });
            if (!node) break;
            tried.add(node.label);
            try {
                const res = await track(node.label, async () => {
                    const ctrl = new AbortController();
                    const timer = setTimeout(() => ctrl.abort(), OLLAMA_TIMEOUT_MS);
                    try {
                        return await fetch(`${node.ollamaUrl}/api/embeddings`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                model: m,
                                prompt: text,
                                keep_alive: OLLAMA_KEEP_ALIVE
                            }),
                            signal: ctrl.signal
                        });
                    } finally {
                        clearTimeout(timer);
                    }
                });
                if (!res.ok) continue;
                const j = (await res.json()) as { embedding: number[] };
                if (Array.isArray(j.embedding)) {
                    return { vector: j.embedding, model: m, node: node.label };
                }
            } catch (err) {
                logger.warn('Swarm embed error', { node: node.label, error: (err as Error).message });
            }
        }
        tried.clear();
    }
    throw new Error('Swarm: embedding failed on all nodes');
}

/** POST a JSON body to a node's sidecar with capability-based routing. */
export async function swarmSidecar<T = unknown>(
    cap: Capability,
    path: string,
    body: unknown,
    opts: { timeoutMs?: number } = {}
): Promise<{ data: T; node: AiNode }> {
    const tried = new Set<string>();
    for (let i = 0; i < AI_NODES.length; i++) {
        const node = pickNode({ cap, exclude: tried });
        if (!node) break;
        tried.add(node.label);
        try {
            const res = await track(node.label, async () => {
                const ctrl = new AbortController();
                const timer = setTimeout(
                    () => ctrl.abort(),
                    opts.timeoutMs ?? OLLAMA_TIMEOUT_MS
                );
                try {
                    return await fetch(`${node.sidecarUrl}${path}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                        signal: ctrl.signal
                    });
                } finally {
                    clearTimeout(timer);
                }
            });
            if (!res.ok) {
                logger.warn('Sidecar non-OK', {
                    node: node.label,
                    path,
                    status: res.status
                });
                continue;
            }
            const data = (await res.json()) as T;
            return { data, node };
        } catch (err) {
            logger.warn('Sidecar error', { node: node.label, path, error: (err as Error).message });
        }
    }
    throw new Error(`Swarm sidecar: no node could serve ${path}`);
}

/** Stream a multipart POST (binary upload) to a sidecar. */
export async function swarmSidecarUpload(
    cap: Capability,
    path: string,
    form: FormData,
    opts: { timeoutMs?: number } = {}
): Promise<{ response: Response; node: AiNode }> {
    const tried = new Set<string>();
    for (let i = 0; i < AI_NODES.length; i++) {
        const node = pickNode({ cap, exclude: tried });
        if (!node) break;
        tried.add(node.label);
        try {
            const res = await track(node.label, async () => {
                const ctrl = new AbortController();
                const timer = setTimeout(
                    () => ctrl.abort(),
                    opts.timeoutMs ?? OLLAMA_TIMEOUT_MS
                );
                try {
                    return await fetch(`${node.sidecarUrl}${path}`, {
                        method: 'POST',
                        body: form,
                        signal: ctrl.signal
                    });
                } finally {
                    clearTimeout(timer);
                }
            });
            if (res.ok) return { response: res, node };
        } catch (err) {
            logger.warn('Sidecar upload error', {
                node: node.label,
                path,
                error: (err as Error).message
            });
        }
    }
    throw new Error(`Swarm sidecar upload: no node could serve ${path}`);
}

// Kick off a periodic health refresh in the background. The interval is small
// because Ollama's /api/ps is cheap and we want warm-model awareness fresh.
let _healthTimer: ReturnType<typeof setInterval> | null = null;
export function startSwarmHealthLoop(intervalMs = 15_000): void {
    if (_healthTimer) return;
    void refreshSwarmHealth();
    _healthTimer = setInterval(() => void refreshSwarmHealth(), intervalMs);
}
export function stopSwarmHealthLoop(): void {
    if (_healthTimer) {
        clearInterval(_healthTimer);
        _healthTimer = null;
    }
}
