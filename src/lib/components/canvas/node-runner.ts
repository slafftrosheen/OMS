// Canvas node graph executor.
//
// Each "AI node" shape exposes a node descriptor (`getNodeDescriptor`) so the
// runner can execute it standalone or as part of a DAG traversal driven by
// tldraw arrows. Arrows whose `end` terminal binds to a shape become input
// edges — the upstream shape's `output` prop is fed into the downstream
// shape's `runFromInputs` call.
//
// Why we don't reuse tldraw's flow graph extensions: those expect a custom
// arrow util and a binding registry we don't have time to wire end-to-end.
// Walking the editor's record store on demand is enough for our scale
// (≤ ~50 shapes/canvas).

import type { Editor, TLShape } from '@tldraw/tldraw';

export type NodeKind =
    | 'web-search'
    | 'crawl'
    | 'lumigrid'
    | 'led-strip'
    | 'led-matrix'
    | 'boxletter'
    | 'maker'
    | 'chat'
    | 'forge'
    | 'document';

export interface NodeRunContext {
    editor: Editor;
    /** The shape we're executing — runner should read its own props from here. */
    shape: TLShape;
    /** Inputs collected from upstream shapes, keyed by upstream shape type. */
    inputs: Record<string, unknown>;
    /** Identifier the runner uses to abort a long job. */
    signal: AbortSignal;
}

export interface NodeOutput {
    /** Free-form payload other nodes can consume. */
    data: unknown;
    /** Human-readable summary, surfaced into chat / doc shapes. */
    summary?: string;
    /** Optional artifact URL (image, glb, audio) — wired into Document. */
    artifactUrl?: string;
}

export type NodeRunner = (ctx: NodeRunContext) => Promise<NodeOutput>;

const RUNNERS = new Map<string, NodeRunner>();

/** Register a runner for a custom shape type. */
export function registerNodeRunner(type: string, fn: NodeRunner): void {
    RUNNERS.set(type, fn);
}

/** Look up a runner. */
export function getNodeRunner(type: string): NodeRunner | undefined {
    return RUNNERS.get(type);
}

// ─── Graph traversal ────────────────────────────────────────────────────────

/**
 * Find every shape whose `end` terminal arrow points at `targetId`. Returns
 * the source shape ids in arrival order.
 */
export function findUpstreamIds(editor: Editor, targetId: string): string[] {
    const all = editor.getCurrentPageShapes();
    const incoming: string[] = [];
    for (const s of all) {
        if (s.type !== 'arrow') continue;
        // tldraw arrow shape stores both `start` and `end` as
        // { type: 'point', x, y } | { type: 'binding', boundShapeId, ... }.
        // We support both new-style bindings (editor.getBindingsFromShape) and
        // the legacy props shape.
        const props = (s as unknown as { props?: { start?: any; end?: any } }).props ?? {};
        const startBound = props.start?.boundShapeId as string | undefined;
        const endBound = props.end?.boundShapeId as string | undefined;
        if (endBound === targetId && startBound && startBound !== targetId) {
            incoming.push(startBound);
        }
    }
    // Newer tldraw versions store bindings in a separate registry.
    const anyEditor = editor as unknown as {
        getBindingsToShape?: (id: string, type?: string) => Array<{ fromId?: string; toId?: string }>;
    };
    if (anyEditor.getBindingsToShape) {
        try {
            const binds = anyEditor.getBindingsToShape(targetId, 'arrow') ?? [];
            for (const b of binds) {
                const arrow = b.fromId ? editor.getShape(b.fromId as any) : null;
                if (!arrow) continue;
                const otherEnd = (arrow as any)?.props?.start?.boundShapeId;
                if (otherEnd && otherEnd !== targetId && !incoming.includes(otherEnd)) {
                    incoming.push(otherEnd);
                }
            }
        } catch { /* tldraw version may not expose this */ }
    }
    return incoming;
}

/**
 * Pull the `output` prop out of a shape, falling back to a sensible string
 * representation so non-AI shapes (text, document, etc.) can still feed
 * downstream calculators.
 */
export function harvestOutput(shape: TLShape): unknown {
    const props = (shape as { props?: Record<string, unknown> }).props ?? {};
    if ('output' in props && props.output !== undefined) return props.output;
    // Common shapes: text, geo (sticky note), document.
    if ('text' in props && props.text) return { text: props.text };
    if ('content' in props) return { content: props.content };
    return null;
}

export interface RunOptions {
    signal?: AbortSignal;
    /** Updates the shape's status as it runs. */
    onStatus?: (id: string, status: 'running' | 'done' | 'error', detail?: string) => void;
}

/** Run a single shape, gathering inputs from upstream arrows first. */
export async function runShape(
    editor: Editor,
    shapeId: string,
    opts: RunOptions = {}
): Promise<NodeOutput> {
    const shape = editor.getShape(shapeId as any);
    if (!shape) throw new Error(`runShape: ${shapeId} not found`);
    const runner = getNodeRunner(shape.type);
    if (!runner) {
        throw new Error(`No runner registered for shape type "${shape.type}"`);
    }

    const upstreamIds = findUpstreamIds(editor, shapeId);
    const inputs: Record<string, unknown> = {};
    for (const id of upstreamIds) {
        const up = editor.getShape(id as any);
        if (!up) continue;
        const out = harvestOutput(up);
        if (out !== null && out !== undefined) {
            inputs[up.type] = out;
        }
    }

    opts.onStatus?.(shapeId, 'running');
    try {
        const result = await runner({
            editor,
            shape,
            inputs,
            signal: opts.signal ?? new AbortController().signal
        });
        // Persist result on the shape so downstream nodes can read it.
        try {
            const props = (shape as { props?: Record<string, unknown> }).props ?? {};
            editor.updateShape({
                id: shapeId as any,
                type: shape.type,
                props: { ...props, output: result.data, status: 'done', error: null }
            } as any);
        } catch { /* shape may have been deleted mid-run */ }
        opts.onStatus?.(shapeId, 'done', result.summary);
        return result;
    } catch (err) {
        const msg = (err as Error).message;
        try {
            const props = (shape as { props?: Record<string, unknown> }).props ?? {};
            editor.updateShape({
                id: shapeId as any,
                type: shape.type,
                props: { ...props, status: 'error', error: msg }
            } as any);
        } catch { /* swallow */ }
        opts.onStatus?.(shapeId, 'error', msg);
        throw err;
    }
}

/**
 * Run every AI node on the page in topological order. Skips shapes that have
 * no registered runner. Tolerates cycles by stopping when no more progress
 * can be made.
 */
export async function runAll(editor: Editor, opts: RunOptions = {}): Promise<void> {
    const all = editor.getCurrentPageShapes();
    const targets = all.filter((s) => RUNNERS.has(s.type));
    const completed = new Set<string>();
    const errored = new Set<string>();

    let progress = true;
    while (progress) {
        progress = false;
        for (const t of targets) {
            if (completed.has(t.id) || errored.has(t.id)) continue;
            const upstream = findUpstreamIds(editor, t.id).filter((id) =>
                targets.some((s) => s.id === id)
            );
            const ready = upstream.every((id) => completed.has(id));
            if (!ready) continue;
            try {
                await runShape(editor, t.id, opts);
                completed.add(t.id);
            } catch {
                errored.add(t.id);
            }
            progress = true;
        }
    }
}
