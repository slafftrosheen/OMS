import { atom, react, type Editor, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { isCadNodeEditing, setCadNodeEditing } from './cad-node-selection';
import { cadRevision, CadOperationError } from './cad-plans';
import type { CadPoint } from './cad-settings';
import { claimDrawingPointerGesture, isDrawingPointerGestureActive } from './drawing-pointer-gesture';
import { applySkewPlan, MAX_SKEW_ANGLE, prepareSkewPlan, readSkewSelection, type SkewBounds, type SkewOptions, type SkewPlan } from './drawing-skew';

export type DrawingSkewEdge = 'top' | 'right' | 'bottom' | 'left';
export const DRAWING_SKEW_EDGES: DrawingSkewEdge[] = ['top', 'right', 'bottom', 'left'];
export interface DrawingSkewGesture {
  edge: DrawingSkewEdge;
  angle: number;
  limited: boolean;
  plan: SkewPlan | null;
  error: string | null;
}
interface Session {
  revision: string;
  viewport: string;
  edge: DrawingSkewEdge;
  bounds: SkewBounds;
  start: CadPoint;
  release: () => void;
}
interface NativeRotationSession {
  before: Map<TLShapeId, TLShape>;
  last: Map<TLShapeId, TLShape>;
}
function makeState() {
  return {
    mode: atom('Pick rotate/skew mode', false),
    gesture: atom<DrawingSkewGesture | null>('Pick skew gesture', null),
    notice: atom<string | null>('Pick skew notice', null),
    session: null as Session | null,
    rotation: null as NativeRotationSession | null,
  };
}
const states = new WeakMap<Editor, ReturnType<typeof makeState>>();
function state(editor: Editor) {
  let value = states.get(editor);
  if (!value) { value = makeState(); states.set(editor, value); }
  return value;
}
export function drawingSkewGesture(editor: Editor) { return state(editor).gesture; }
export function drawingSkewNotice(editor: Editor) { return state(editor).notice; }
export function isDrawingSkewDragging(editor: Editor): boolean { return drawingSkewGesture(editor).get() !== null; }
export function isDrawingSkewMode(editor: Editor): boolean {
  return state(editor).mode.get() && editor.getCurrentToolId() === 'select' && !isCadNodeEditing(editor);
}

/** The drag uses physical page axes, even for a rotated group. Subtracting the
 * actual press position prevents jumps when the edge's generous target is hit. */
export function drawingSkewAngle(bounds: SkewBounds, edge: DrawingSkewEdge, start: CadPoint, point: CadPoint, snap = false) {
  if (!DRAWING_SKEW_EDGES.includes(edge) || ![bounds.x, bounds.y, bounds.w, bounds.h, start.x, start.y, point.x, point.y].every(Number.isFinite))
    throw new CadOperationError('invalid');
  const horizontal = edge === 'top' || edge === 'bottom';
  const span = horizontal ? bounds.h : bounds.w;
  if (span <= 1e-8) throw new CadOperationError('unchanged');
  const delta = horizontal ? point.x - start.x : point.y - start.y;
  const raw = Math.atan(delta / span * (edge === 'top' || edge === 'left' ? 1 : -1)) * 180 / Math.PI;
  // Snapped angles remain multiples of 15°. The largest allowed one is 75°.
  const maximum = snap ? Math.floor(MAX_SKEW_ANGLE / 15) * 15 : MAX_SKEW_ANGLE;
  const requested = snap ? Math.round(raw / 15) * 15 : raw;
  return { angle: Math.max(-maximum, Math.min(maximum, requested)), limited: Math.abs(requested) > maximum };
}
export function drawingSkewOptions(edge: DrawingSkewEdge, angle: number): SkewOptions {
  return { axis: edge === 'top' || edge === 'bottom' ? 'horizontal' : 'vertical', angle,
    anchor: ({ top: 'bottom', right: 'left', bottom: 'top', left: 'right' } as const)[edge], keepOriginal: false };
}
export function drawingSkewHandlePoint(bounds: SkewBounds, edge: DrawingSkewEdge): CadPoint {
  return { x: bounds.x + bounds.w * (edge === 'left' ? 0 : edge === 'right' ? 1 : .5),
    y: bounds.y + bounds.h * (edge === 'top' ? 0 : edge === 'bottom' ? 1 : .5) };
}
function viewport(editor: Editor) {
  const camera = editor.getCamera(), box = editor.getViewportScreenBounds();
  return JSON.stringify([camera.x, camera.y, camera.z, box.x, box.y, box.w, box.h]);
}
export function cancelDrawingSkew(editor: Editor, notice: string | null = 'canceled'): void {
  const value = state(editor), session = value.session;
  value.session = null;
  session?.release();
  value.gesture.set(null);
  if (notice !== null) value.notice.set(notice);
}

/** Track only the native rotations started from our custom corner controls.
 * Native rotation mutates live records and its ordinary cancel rolls history
 * back wholesale, including a lock received while rotating. Keep each latest
 * native transform so a guarded rollback can retain unrelated external edits. */
export function beginDrawingSkewRotation(editor: Editor): boolean {
  if (!isDrawingSkewMode(editor) || !editor.isIn('select.idle') || isDrawingPointerGestureActive(editor) || readSkewSelection(editor).error) return false;
  const before = new Map(editor.getSelectedShapes().map(shape => [shape.id, shape]));
  state(editor).rotation = { before, last: new Map(before) };
  return true;
}
function cancelDrawingSkewRotation(editor: Editor): void {
  const value = state(editor), rotation = value.rotation;
  if (!rotation) return;
  value.rotation = null;
  if (!editor.isInAny('select.pointing_rotate_handle', 'select.rotating')) return;
  const restores: TLShape[] = [];
  for (const [id, before] of rotation.before) {
    const current = editor.getShape(id), last = rotation.last.get(id);
    // A different writer's transform/reparenting wins. Restore only transforms
    // still owned by this gesture; all lock, paint and metadata fields survive.
    if (current && last && current.parentId === before.parentId && current.type === before.type &&
        current.x === last.x && current.y === last.y && current.rotation === last.rotation)
      restores.push({ ...current, x: before.x, y: before.y, rotation: before.rotation });
  }
  editor.run(() => {
    // Exiting the state directly avoids native completion/snap or bailToMark.
    editor.setCurrentTool('select.idle');
    // Direct store restoration also works after readonly/ancestor lock changed;
    // it only removes geometry changes owned by this canceled preview.
    if (restores.length) editor.store.put(restores);
  });
}
export function setDrawingSkewMode(editor: Editor, enabled: boolean): boolean {
  const value = state(editor);
  if (!enabled) { value.mode.set(false); cancelDrawingSkew(editor, null); cancelDrawingSkewRotation(editor); value.notice.set(null); return true; }
  if (isDrawingPointerGestureActive(editor)) return false;
  const selection = readSkewSelection(editor);
  if (selection.error) { value.notice.set(selection.error); return false; }
  editor.complete(); editor.setCurrentTool('select'); setCadNodeEditing(editor, false);
  value.notice.set(null); value.mode.set(true);
  return true;
}
function validSession(editor: Editor): Session | null {
  const value = state(editor), session = value.session;
  if (!session) return null;
  const selection = readSkewSelection(editor);
  if (!isDrawingSkewMode(editor) || !editor.isIn('select.idle') || editor.getIsMenuOpen() || selection.error ||
      session.revision !== cadRevision(editor) || session.viewport !== viewport(editor)) {
    cancelDrawingSkew(editor, selection.error ?? 'stale');
    return null;
  }
  return session;
}
export function beginDrawingSkew(editor: Editor, edge: DrawingSkewEdge, point: CadPoint, pointerId?: number): boolean {
  const value = state(editor);
  if (!isDrawingSkewMode(editor) || !editor.isIn('select.idle') || editor.getIsMenuOpen() || value.session ||
      !DRAWING_SKEW_EDGES.includes(edge) || ![point.x, point.y].every(Number.isFinite)) return false;
  const selection = readSkewSelection(editor);
  if (selection.error || !selection.bounds) { value.notice.set(selection.error ?? 'selection'); return false; }
  try { drawingSkewAngle(selection.bounds, edge, point, point); }
  catch (error) { value.notice.set(error instanceof CadOperationError ? error.code : 'failed'); return false; }
  const release = claimDrawingPointerGesture(editor, 'skew', pointerId);
  if (!release) return false;
  value.session = { edge, bounds: selection.bounds, start: { ...point }, revision: cadRevision(editor), viewport: viewport(editor), release };
  value.notice.set(null);
  value.gesture.set({ edge, angle: 0, limited: false, plan: null, error: null });
  return true;
}
export function updateDrawingSkew(editor: Editor, point: CadPoint, snap = false): boolean {
  const session = validSession(editor);
  if (!session) return false;
  const value = state(editor);
  try {
    const { angle, limited } = drawingSkewAngle(session.bounds, session.edge, session.start, point, snap);
    const previous = value.gesture.get();
    if (previous?.angle === angle && previous.limited === limited && previous.error === null) return true;
    const plan = Math.abs(angle) < 1e-9 ? null : prepareSkewPlan(editor, drawingSkewOptions(session.edge, angle));
    value.gesture.set({ edge: session.edge, angle, limited, plan, error: null });
    return true;
  } catch (error) {
    value.gesture.set({ edge: session.edge, angle: 0, limited: false, plan: null, error: error instanceof CadOperationError ? error.code : 'failed' });
    return false;
  }
}
export function finishDrawingSkew(editor: Editor, point: CadPoint, snap = false): boolean {
  if (!updateDrawingSkew(editor, point, snap)) { cancelDrawingSkew(editor, state(editor).gesture.get()?.error ?? 'stale'); return false; }
  const value = state(editor), preview = value.gesture.get();
  // End the transient gesture before committing: a store listener observing our
  // own transaction must not mistake that transaction for an external edit.
  cancelDrawingSkew(editor, null);
  if (!preview?.plan) { value.notice.set(preview?.error ?? null); return false; }
  const applied = applySkewPlan(editor, preview.plan);
  value.notice.set(applied ? 'done' : 'failed');
  return applied;
}

/** Lifecycle protection is independent of React's render schedule, so an
 * external edit, page switch or readonly transition clears a preview at once. */
export function installDrawingSkewMode(editor: Editor): () => void {
  const value = state(editor);
  const nativeRotationEvent = () => {
    const rotation = value.rotation;
    if (!rotation) return;
    if (!editor.isInAny('select.pointing_rotate_handle', 'select.rotating')) { value.rotation = null; return; }
    for (const id of rotation.before.keys()) {
      const shape = editor.getShape(id);
      if (shape) rotation.last.set(id, shape);
    }
  };
  editor.on('event', nativeRotationEvent);
  const stop = react('guard Pick skew mode', () => {
    if (!value.mode.get()) return;
    value.gesture.get();
    const selection = readSkewSelection(editor);
    if (editor.getCurrentToolId() !== 'select' || isCadNodeEditing(editor) || selection.error) {
      value.mode.set(false); cancelDrawingSkew(editor, selection.error ?? 'canceled'); cancelDrawingSkewRotation(editor); return;
    }
    if (value.session) validSession(editor);
  });
  return () => { stop(); editor.off('event', nativeRotationEvent); value.mode.set(false); cancelDrawingSkew(editor, null); cancelDrawingSkewRotation(editor); };
}
