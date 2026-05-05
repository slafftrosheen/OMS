// src/lib/server/ai/queue.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-node + per-capability request queue.
//
// Why: the AI sidecars + Ollama nodes can stall the whole frontend if a single
// long-running job (Flux image gen, TRELLIS mesh, ColQwen2 embed) saturates
// VRAM or the HTTP keep-alive pool. We can't rely on the node itself to push
// back gracefully — Ollama will accept any number of concurrent /api/chat
// requests and grind them through serially with growing tail latency.
//
// This module:
//   • Bounds concurrency per (node × capability) so chat stays snappy while
//     image-gen runs in the background.
//   • Tracks queued/inflight counts so the swarm picker can prefer the least
//     loaded node — the existing `inflight` counter only saw HTTP-level work.
//   • Surfaces a backpressure signal to the caller (via timeoutMs on the wait)
//     so we can shed requests instead of piling up unbounded.
//   • Exposes stats() for the AI Lab dashboard.
//
// Usage:
//   const release = await acquire(node.label, 'image-gen', { timeoutMs: 30_000 });
//   try { return await fetch(...) } finally { release(); }
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from '$lib/server/logging/logger';
import type { Capability } from '$lib/server/config';

interface SlotRequest {
    resolve: (release: () => void) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout> | null;
    queuedAt: number;
}

interface NodeQueue {
    /** label → cap → state */
    perCap: Map<string, { inflight: number; max: number; waiters: SlotRequest[] }>;
}

const QUEUES = new Map<string, NodeQueue>();

// Default per-capability concurrency. Tunable via env (see config.ts).
// Reasoning/coder are cheap → allow several. Image/mesh are VRAM-heavy → 1.
const DEFAULT_CAPS: Record<Capability | string, number> = {
    reasoning: 4,
    vision: 2,
    coder: 3,
    embed: 8,
    rerank: 4,
    'image-gen': 1,
    'mesh-gen': 1,
    asr: 2,
    tts: 3,
    colpali: 4,
    // Synthetic capability used by the web crawler — it shouldn't hammer
    // remote sites either.
    crawl: 2,
    'web-search': 4
};

const ENV_OVERRIDES: Record<string, number> = (() => {
    const out: Record<string, number> = {};
    for (const [cap, fallback] of Object.entries(DEFAULT_CAPS)) {
        const envKey = `AI_QUEUE_${cap.toUpperCase().replace(/-/g, '_')}_CONCURRENCY`;
        const raw = process.env[envKey];
        const n = raw ? Number(raw) : NaN;
        out[cap] = Number.isFinite(n) && n > 0 ? n : fallback;
    }
    return out;
})();

function getCapState(label: string, cap: string) {
    let q = QUEUES.get(label);
    if (!q) {
        q = { perCap: new Map() };
        QUEUES.set(label, q);
    }
    let s = q.perCap.get(cap);
    if (!s) {
        s = { inflight: 0, max: ENV_OVERRIDES[cap] ?? 2, waiters: [] };
        q.perCap.set(cap, s);
    }
    return s;
}

export interface AcquireOpts {
    /** Reject the wait if the slot can't be claimed within this many ms. */
    timeoutMs?: number;
    /** Absolute hard cap for the queue length. 0 = unlimited. */
    maxQueue?: number;
}

/**
 * Wait for a concurrency slot on (label, cap). Returns a release() callback —
 * always call it in finally{}.
 */
export function acquire(
    label: string,
    cap: string,
    opts: AcquireOpts = {}
): Promise<() => void> {
    const s = getCapState(label, cap);
    return new Promise((resolve, reject) => {
        const tryClaim = () => {
            if (s.inflight < s.max) {
                s.inflight++;
                let released = false;
                const release = () => {
                    if (released) return;
                    released = true;
                    s.inflight = Math.max(0, s.inflight - 1);
                    const next = s.waiters.shift();
                    if (next) {
                        if (next.timer) clearTimeout(next.timer);
                        // Run on next tick so caller's .finally completes first.
                        setImmediate(() =>
                            next.resolve(makeRelease(label, cap))
                        );
                    }
                };
                resolve(release);
                return true;
            }
            return false;
        };

        if (tryClaim()) return;

        const maxQueue = opts.maxQueue ?? 100;
        if (maxQueue > 0 && s.waiters.length >= maxQueue) {
            reject(
                new Error(
                    `AI queue overflow on ${label}:${cap} (>${maxQueue} waiters)`
                )
            );
            return;
        }

        const wait: SlotRequest = {
            resolve,
            reject,
            timer: null,
            queuedAt: Date.now()
        };
        if (opts.timeoutMs && opts.timeoutMs > 0) {
            wait.timer = setTimeout(() => {
                const i = s.waiters.indexOf(wait);
                if (i >= 0) s.waiters.splice(i, 1);
                reject(
                    new Error(
                        `AI queue wait timeout on ${label}:${cap} after ${opts.timeoutMs}ms`
                    )
                );
            }, opts.timeoutMs);
        }
        s.waiters.push(wait);
    });
}

// Helper used by a queued waiter once it gets its slot.
function makeRelease(label: string, cap: string): () => void {
    const s = getCapState(label, cap);
    let released = false;
    return () => {
        if (released) return;
        released = true;
        s.inflight = Math.max(0, s.inflight - 1);
        const next = s.waiters.shift();
        if (next) {
            if (next.timer) clearTimeout(next.timer);
            setImmediate(() => next.resolve(makeRelease(label, cap)));
        }
    };
}

/**
 * Acquire + run + release in one call. The fn receives no args — it just runs
 * once a slot is free. Use this for simple cases.
 */
export async function withSlot<T>(
    label: string,
    cap: string,
    fn: () => Promise<T>,
    opts: AcquireOpts = {}
): Promise<T> {
    const release = await acquire(label, cap, opts);
    const t0 = Date.now();
    try {
        return await fn();
    } finally {
        const dt = Date.now() - t0;
        if (dt > 30_000) {
            logger.warn(`Long AI slot held on ${label}:${cap} (${dt}ms)`);
        }
        release();
    }
}

// ─── Stats / introspection ──────────────────────────────────────────────────

export interface QueueStats {
    label: string;
    capabilities: Array<{
        cap: string;
        inflight: number;
        max: number;
        queued: number;
        oldestQueuedMs: number | null;
    }>;
}

export function stats(): QueueStats[] {
    const out: QueueStats[] = [];
    const now = Date.now();
    for (const [label, q] of QUEUES.entries()) {
        const caps: QueueStats['capabilities'] = [];
        for (const [cap, s] of q.perCap.entries()) {
            const oldest = s.waiters[0]?.queuedAt;
            caps.push({
                cap,
                inflight: s.inflight,
                max: s.max,
                queued: s.waiters.length,
                oldestQueuedMs: oldest ? now - oldest : null
            });
        }
        out.push({ label, capabilities: caps });
    }
    return out;
}

/** Total queued+inflight across every capability for one node. */
export function nodeLoad(label: string): number {
    const q = QUEUES.get(label);
    if (!q) return 0;
    let n = 0;
    for (const s of q.perCap.values()) n += s.inflight + s.waiters.length;
    return n;
}

/** Set the concurrency limit for a (label, cap). Used by admin tools. */
export function setLimit(label: string, cap: string, max: number): void {
    if (!Number.isFinite(max) || max <= 0) return;
    const s = getCapState(label, cap);
    s.max = Math.floor(max);
    while (s.waiters.length > 0 && s.inflight < s.max) {
        const next = s.waiters.shift()!;
        if (next.timer) clearTimeout(next.timer);
        s.inflight++;
        next.resolve(makeRelease(label, cap));
    }
}
