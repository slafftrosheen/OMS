// Canvas node graph executor.
//
// Custom technical shapes register a runner shared by their own Run button
// and the canvas toolbar. Native arrow bindings supply optional upstream
// inputs, and completion only patches execution state so edits made while a
// request is pending are preserved.

import type { Editor, TLShape } from '@tldraw/tldraw';

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
const ACTIVE_RUNS = new WeakMap<Editor, Map<string, Promise<NodeOutput>>>();

/** Register a runner for a custom shape type. */
export function registerNodeRunner(type: string, fn: NodeRunner): void {
    RUNNERS.set(type, fn);
}

/** Look up a runner. */
export function getNodeRunner(type: string): NodeRunner | undefined {
    return RUNNERS.get(type);
}

/** Only editable technical nodes can run from a mixed canvas selection. */
export function getRunnableShapeIds(editor: Editor, ids = editor.getSelectedShapeIds()): string[] {
    if (editor.getInstanceState().isReadonly) return [];
    return ids.filter((id) => {
        const shape = editor.getShape(id);
        return !!shape && RUNNERS.has(shape.type) && !editor.isShapeOrAncestorLocked(shape);
    });
}

// ─── Graph traversal ────────────────────────────────────────────────────────

type ArrowBinding = {
    fromId: string;
    toId: string;
    props: { terminal: 'start' | 'end' };
};

interface MaybeBindingsApi {
    getBindingsToShape?: (id: string, type: string) => ArrowBinding[];
    getBindingsFromShape?: (id: string, type: string) => ArrowBinding[];
}

/**
 * Find every shape whose arrow's "end" terminal binds to `targetId`. Returns
 * the source shape ids (the arrow's "start" terminal) in arrival order.
 *
 * Uses the modern tldraw bindings registry where `fromId` is the arrow and
 * `toId` is the bound shape. Falls back to the legacy in-props arrow style
 * for older versions.
 */
export function findUpstreamIds(editor: Editor, targetId: string): string[] {
    const incoming: string[] = [];
    const anyEd = editor as unknown as MaybeBindingsApi;

    if (anyEd.getBindingsToShape && anyEd.getBindingsFromShape) {
        try {
            const incomingArrows = anyEd.getBindingsToShape(targetId, 'arrow') ?? [];
            for (const b of incomingArrows) {
                if (b.props?.terminal !== 'end') continue;
                // The opposite end of the same arrow is what we want.
                const arrowId = b.fromId;
                const sibling = (anyEd.getBindingsFromShape!(arrowId, 'arrow') ?? [])
                    .find((s) => s.props?.terminal === 'start');
                if (sibling?.toId && sibling.toId !== targetId && !incoming.includes(sibling.toId)) {
                    incoming.push(sibling.toId);
                }
            }
            // An empty native binding result is authoritative too. Most
            // standalone nodes have no inputs; don't scan the entire page.
            return incoming;
        } catch { /* tldraw version may not expose this — fall through */ }
    }

    // Legacy: arrows store endpoints inside their own props.
    const all = editor.getCurrentPageShapes();
    for (const s of all) {
        if (s.type !== 'arrow') continue;
        const props = (s as unknown as { props?: { start?: any; end?: any } }).props ?? {};
        const startBound = props.start?.boundShapeId as string | undefined;
        const endBound = props.end?.boundShapeId as string | undefined;
        if (endBound === targetId && startBound && startBound !== targetId && !incoming.includes(startBound)) {
            incoming.push(startBound);
        }
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
    /** Node buttons use their explicit form values; the toolbar follows arrows. */
    useUpstream?: boolean;
    /** Updates the shape's status as it runs. */
    onStatus?: (id: string, status: 'running' | 'done' | 'error', detail?: string) => void;
}

/** Run a single shape, gathering inputs from upstream arrows first. */
export async function runShape(
    editor: Editor,
    shapeId: string,
    opts: RunOptions = {}
): Promise<NodeOutput> {
    let active = ACTIVE_RUNS.get(editor);
    if (!active) { active = new Map(); ACTIVE_RUNS.set(editor, active); }
    const existing = active.get(shapeId);
    if (existing) return existing;

    const pending = executeShape(editor, shapeId, opts);
    active.set(shapeId, pending);
    try { return await pending; }
    finally { active.delete(shapeId); }
}

async function executeShape(editor: Editor, shapeId: string, opts: RunOptions): Promise<NodeOutput> {
    const shape = editor.getShape(shapeId as any);
    if (!shape) throw new Error(`runShape: ${shapeId} not found`);
    const runner = getNodeRunner(shape.type);
    if (!runner) {
        throw new Error(`No runner registered for shape type "${shape.type}"`);
    }
    if (editor.getInstanceState().isReadonly || editor.isShapeOrAncestorLocked(shape)) {
        throw new Error('This technical node is locked or read-only');
    }
    opts.signal?.throwIfAborted();

    const upstreamIds = opts.useUpstream === false ? [] : findUpstreamIds(editor, shapeId);
    const inputs: Record<string, unknown> = {};
    for (const id of upstreamIds) {
        const up = editor.getShape(id as any);
        if (!up) continue;
        const out = harvestOutput(up);
        if (out !== null && out !== undefined) {
            inputs[up.type] = out;
        }
    }

    const update = (props: Record<string, unknown>) => {
        // A deleted/replaced shape must never be recreated by a late response.
        if (editor.getShape(shape.id)?.type !== shape.type) return;
        editor.updateShape({ id: shape.id, type: shape.type, props } as any);
    };
    update({ status: 'running', error: null });
    opts.onStatus?.(shapeId, 'running');
    try {
        const result = await runner({
            editor,
            shape,
            inputs,
            signal: opts.signal ?? new AbortController().signal
        });
        opts.signal?.throwIfAborted();
        // Persist result on the shape so downstream nodes can read it.
        update({ output: result.data, status: 'done', error: null });
        opts.onStatus?.(shapeId, 'done', result.summary);
        return result;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        update({ status: 'error', error: msg });
        opts.onStatus?.(shapeId, 'error', msg);
        throw err;
    }
}
