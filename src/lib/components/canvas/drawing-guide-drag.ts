import { atom, type Editor, type TLPageId } from '@tldraw/tldraw';
import { isCadNodeEditing } from './cad-node-selection';
import { validCadPoint } from './cad-settings';
import {
  applyDrawingGuideChange, drawingGuidesAreValid, drawingGuidesRevision, DrawingGuideError,
  prepareDrawingGuideChange, readDrawingGuides, selectDrawingGuide, type DrawingGuideAxis,
  type DrawingGuideErrorCode,
} from './drawing-guides';
import { claimDrawingPointerGesture, suppressDrawingKeyRelease } from './drawing-pointer-gesture';

export interface DrawingGuideDragPreview {
  axis: DrawingGuideAxis;
  guideId?: string;
  position: number;
  outside: boolean;
  valid: boolean;
}
export type DrawingGuideNotice = DrawingGuideErrorCode | 'created' | 'moved' | 'removed' | 'canceled' | null;
const previews = new WeakMap<Editor, ReturnType<typeof atom<DrawingGuideDragPreview | null>>>();
const notices = new WeakMap<Editor, ReturnType<typeof atom<DrawingGuideNotice>>>();
const sessions = new WeakMap<Editor, { cancel: (notice?: DrawingGuideNotice) => void }>();

export function drawingGuideDrag(editor: Editor) {
  let state = previews.get(editor);
  if (!state) { state = atom<DrawingGuideDragPreview | null>('Guideline drag preview', null); previews.set(editor, state); }
  return state;
}
export function drawingGuideNotice(editor: Editor) {
  let state = notices.get(editor);
  if (!state) { state = atom<DrawingGuideNotice>('Guideline interaction notice', null); notices.set(editor, state); }
  return state;
}
export function cancelDrawingGuideDrag(editor: Editor, notice: DrawingGuideNotice = 'canceled'): void {
  sessions.get(editor)?.cancel(notice);
}
export function canDragDrawingGuide(editor: Editor): boolean {
  return !editor.getInstanceState().isReadonly && drawingGuidesAreValid(editor) && !readDrawingGuides(editor).locked &&
    !editor.getIsMenuOpen() && !isCadNodeEditing(editor) && (editor.isIn('select.idle') || editor.isIn('hand.idle'));
}
export function guidePointerInsideViewport(editor: Editor, point: { clientX: number; clientY: number }): boolean {
  const bounds = editor.getViewportScreenBounds();
  return point.clientX >= bounds.x && point.clientX <= bounds.maxX && point.clientY >= bounds.y && point.clientY <= bounds.maxY;
}

function consume(event: Event): void {
  event.preventDefault(); event.stopPropagation();
  (event as Event & { isKilled?: boolean }).isKilled = true;
}

/** A ruler/line gesture never creates transient document records. Preview is
 * page-space UI; release applies one guarded change, Escape applies nothing. */
export function beginDrawingGuideDrag(
  editor: Editor,
  source: { axis: DrawingGuideAxis; guideId?: string },
  event: PointerEvent,
  captureTarget: Element,
): boolean {
  if (event.button !== 0 || event.isPrimary === false || !canDragDrawingGuide(editor) || sessions.has(editor)) return false;
  const state = readDrawingGuides(editor);
  const guide = source.guideId ? state.guides.find(item => item.id === source.guideId) : undefined;
  if (!['x', 'y'].includes(source.axis) || source.guideId && (!guide || guide.axis !== source.axis || guide.locked || !guide.visible || !state.visible)) return false;
  const start = editor.screenToPage({ x: event.clientX, y: event.clientY });
  if (!validCadPoint(start)) return false;
  const releaseClaim = claimDrawingPointerGesture(editor, 'guide', event.pointerId);
  if (!releaseClaim) return false;
  const win = captureTarget.ownerDocument.defaultView;
  if (!win) { releaseClaim(); return false; }
  const pageId: TLPageId = editor.getCurrentPageId();
  const revision = drawingGuidesRevision(editor);
  const viewport = () => {
    const camera = editor.getCamera(), bounds = editor.getViewportScreenBounds();
    return JSON.stringify([camera.x, camera.y, camera.z, bounds.x, bounds.y, bounds.w, bounds.h]);
  };
  const initialViewport = viewport();
  const pointerId = event.pointerId;
  const offset = guide ? start[source.axis] - guide.position : 0;
  const origin = { x: event.clientX, y: event.clientY };
  let moved = false, finished = false;
  let last = { clientX: event.clientX, clientY: event.clientY };
  const subscription: { stop?: () => void } = {};

  function fresh(): boolean {
    return editor.getCurrentPageId() === pageId && canDragDrawingGuide(editor) && drawingGuidesRevision(editor) === revision && viewport() === initialViewport;
  }
  function preview(point: { clientX: number; clientY: number }): DrawingGuideDragPreview {
    const p = editor.screenToPage({ x: point.clientX, y: point.clientY });
    const position = p[source.axis] - offset;
    return { axis: source.axis, guideId: source.guideId, position,
      outside: !guidePointerInsideViewport(editor, point),
      valid: Number.isFinite(position) && validCadPoint({ x: source.axis === 'x' ? position : 0, y: source.axis === 'y' ? position : 0 }) };
  }
  function cleanup() {
    if (finished) return;
    finished = true;
    win!.removeEventListener('pointermove', move, true);
    win!.removeEventListener('pointerup', up, true);
    win!.removeEventListener('pointercancel', cancelPointer, true);
    win!.removeEventListener('keydown', keys, true);
    win!.removeEventListener('keyup', keyUp, true);
    win!.removeEventListener('blur', blur);
    captureTarget.removeEventListener('lostpointercapture', lostCapture);
    subscription.stop?.();
    sessions.delete(editor);
    drawingGuideDrag(editor).set(null);
    releaseClaim!();
    try { if (captureTarget.hasPointerCapture(pointerId)) captureTarget.releasePointerCapture(pointerId); } catch { /* Detached targets already lost capture. */ }
  }
  function cancel(notice: DrawingGuideNotice = 'canceled') {
    cleanup(); drawingGuideNotice(editor).set(notice);
  }
  function move(next: PointerEvent) {
    if (next.pointerId !== pointerId) return;
    consume(next);
    if (!fresh()) { cancel('stale'); return; }
    last = { clientX: next.clientX, clientY: next.clientY };
    moved ||= Math.hypot(last.clientX - origin.x, last.clientY - origin.y) >= 3;
    drawingGuideDrag(editor).set(preview(last));
  }
  function finish() {
    if (!fresh()) { cancel('stale'); return; }
    const result = preview(last);
    cleanup();
    if (!moved) return;
    if (!result.valid) { drawingGuideNotice(editor).set('invalid'); return; }
    if (result.outside && !source.guideId) { drawingGuideNotice(editor).set('canceled'); return; }
    try {
      const change = source.guideId
        ? result.outside ? { kind: 'remove' as const, ids: [source.guideId] }
          : { kind: 'move' as const, id: source.guideId, position: result.position }
        : { kind: 'add' as const, axis: source.axis, position: result.position };
      const plan = prepareDrawingGuideChange(editor, change, revision);
      if (!applyDrawingGuideChange(editor, plan)) { drawingGuideNotice(editor).set('failed'); return; }
      drawingGuideNotice(editor).set(change.kind === 'add' ? 'created' : change.kind === 'remove' ? 'removed' : 'moved');
      if (change.kind === 'remove') editor.focus();
    } catch (error) { drawingGuideNotice(editor).set(error instanceof DrawingGuideError ? error.code : 'failed'); }
  }
  function up(next: PointerEvent) {
    if (next.pointerId !== pointerId) return;
    consume(next);
    last = { clientX: next.clientX, clientY: next.clientY };
    moved ||= Math.hypot(last.clientX - origin.x, last.clientY - origin.y) >= 3;
    finish();
  }
  function cancelPointer(next: PointerEvent) { if (next.pointerId === pointerId) { consume(next); cancel(); } }
  function lostCapture(next: Event) { if ((next as PointerEvent).pointerId === pointerId) cancel(); }
  function blur() { cancel(); }
  function keys(next: KeyboardEvent) {
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(next.key)) return;
    consume(next);
    if (next.key === 'Escape' || next.key === 'Enter') suppressDrawingKeyRelease(editor, next.key);
    if (next.key === 'Escape') cancel();
    else if (next.key === 'Enter') finish();
  }
  function keyUp(next: KeyboardEvent) { if (!['Shift', 'Control', 'Alt', 'Meta'].includes(next.key)) consume(next); }

  consume(event);
  drawingGuideNotice(editor).set(null);
  if (guide) selectDrawingGuide(editor, guide.id);
  sessions.set(editor, { cancel });
  drawingGuideDrag(editor).set(preview(last));
  win.addEventListener('pointermove', move, { capture: true, passive: false });
  win.addEventListener('pointerup', up, true);
  win.addEventListener('pointercancel', cancelPointer, true);
  win.addEventListener('keydown', keys, true);
  win.addEventListener('keyup', keyUp, true);
  win.addEventListener('blur', blur);
  captureTarget.addEventListener('lostpointercapture', lostCapture);
  subscription.stop = editor.store.listen(() => { if (!finished && !fresh()) cancel('stale'); }, { scope: 'all' });
  try { captureTarget.setPointerCapture(pointerId); } catch { /* Window listeners still own this pointer. */ }
  return true;
}
