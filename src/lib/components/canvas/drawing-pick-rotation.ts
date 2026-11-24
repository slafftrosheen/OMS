import { atom, react, type Editor } from '@tldraw/tldraw';
import { cadRevision } from './cad-plans';
import { mapContours, validContours, type CadContour } from './cad-curves';
import { validCadPoint, type CadPoint } from './cad-settings';
import { applyRadialPlan, prepareRadialPlan, prepareRadialPointerPreview, type RadialPlan } from './drawing-radial';
import { isDrawingSkewMode } from './drawing-pick-skew';
import { readSkewSelection, readSkewSelectionContours } from './drawing-skew';
import { readDrawingRotationPivot, setDrawingRotationPivot } from './drawing-rotation-pivot';
import { claimDrawingPointerGesture, isDrawingPointerGestureActive, suppressDrawingKeyRelease } from './drawing-pointer-gesture';

export type DrawingRotationNotice = 'moved' | 'reset' | 'rotated' | 'canceled' | 'stale' | 'invalid' | 'failed' | null;
export interface DrawingRotationPreview {
  kind: 'pivot' | 'rotate'; point: CadPoint; angle: number;
  source: CadContour[]; result: CadContour[]; error: DrawingRotationNotice;
}
const previews = new WeakMap<Editor, ReturnType<typeof atom<DrawingRotationPreview | null>>>();
const notices = new WeakMap<Editor, ReturnType<typeof atom<DrawingRotationNotice>>>();
const sessions = new WeakMap<Editor, () => void>();
export function drawingRotationPreview(editor: Editor) {
  let value = previews.get(editor);
  if (!value) { value = atom<DrawingRotationPreview | null>('Custom rotation preview', null); previews.set(editor, value); }
  return value;
}
export function drawingRotationNotice(editor: Editor) {
  let value = notices.get(editor);
  if (!value) { value = atom<DrawingRotationNotice>('Custom rotation message', null); notices.set(editor, value); }
  return value;
}
export function cancelDrawingRotationPointer(editor: Editor): void { sessions.get(editor)?.(); }
const normalizeDegrees = (angle: number) => ((angle + 180) % 360 + 360) % 360 - 180;
const editable = (target: EventTarget | null) => target instanceof Element && !!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
const consume = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); (event as Event & { isKilled?: boolean }).isKilled = true; };
function available(editor: Editor): boolean {
  return isDrawingSkewMode(editor) && editor.isIn('select.idle') && !editor.getIsMenuOpen() && !readSkewSelection(editor).error;
}
function viewport(editor: Editor): string {
  const c = editor.getCamera(), b = editor.getViewportScreenBounds();
  return JSON.stringify([c.x, c.y, c.z, b.x, b.y, b.w, b.h]);
}

/** This path adds a custom center to the existing exact radial engine. The
 * stricter Pick curve guard also excludes form ancestors, clipping and paint
 * that cannot be previewed as ordinary editable curves. */
export function rotateDrawingAroundPivot(editor: Editor, angle: number): boolean {
  const pivot = readDrawingRotationPivot(editor);
  if (!pivot?.custom || !available(editor) || isDrawingPointerGestureActive(editor) || !Number.isFinite(angle)) return false;
  const normalized = normalizeDegrees(angle);
  if (Math.abs(normalized) < 1e-8) return true;
  try {
    const plan = prepareRadialPlan(editor, { center: pivot.point, angle: normalized, copies: 0, rotateCopies: true });
    const applied = !readSkewSelection(editor).error && applyRadialPlan(editor, plan);
    if (applied) setDrawingRotationPivot(editor, pivot.point);
    drawingRotationNotice(editor).set(applied ? 'rotated' : 'failed');
    return applied;
  } catch { drawingRotationNotice(editor).set('invalid'); return false; }
}

function start(editor: Editor, kind: 'pivot' | 'rotate', event: PointerEvent, target: Element): (() => void) | null {
  if (event.button !== 0 || event.isPrimary === false || editable(event.target) || !available(editor) || sessions.has(editor)) return null;
  const pivot = readDrawingRotationPivot(editor), win = target.ownerDocument.defaultView;
  if (!win || !pivot || kind === 'rotate' && !pivot.custom) return null;
  const startPoint = editor.screenToPage({ x: event.clientX, y: event.clientY });
  if (!validCadPoint(startPoint) || kind === 'rotate' && Math.hypot(startPoint.x - pivot.point.x, startPoint.y - pivot.point.y) * editor.getZoomLevel() < 4) return null;
  const release = claimDrawingPointerGesture(editor, kind === 'pivot' ? 'pivot' : 'rotation', event.pointerId);
  if (!release) return null;
  const pointerId = event.pointerId, revision = cadRevision(editor), initialViewport = viewport(editor);
  const source = kind === 'rotate' ? readSkewSelectionContours(editor) : [];
  const offset = { x: startPoint.x - pivot.point.x, y: startPoint.y - pivot.point.y };
  let last = { x: event.clientX, y: event.clientY, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey };
  let closed = false, moved = false, frame = 0, plan: RadialPlan | null = null, total = 0;
  let previousAngle = Math.atan2(startPoint.y - pivot.point.y, startPoint.x - pivot.point.x);
  let stopGuard = () => {};
  const fresh = () => available(editor) && cadRevision(editor) === revision && viewport(editor) === initialViewport;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (frame) win.cancelAnimationFrame(frame);
    win.removeEventListener('pointermove', move, true); win.removeEventListener('pointerup', up, true);
    win.removeEventListener('pointercancel', pointerCancel, true); win.removeEventListener('keydown', keys, true);
    win.removeEventListener('keyup', keys, true); win.removeEventListener('blur', cancel);
    win.removeEventListener('wheel', wheel, true); win.removeEventListener('scroll', cancel, true);
    target.removeEventListener('lostpointercapture', lostCapture);
    target.ownerDocument.removeEventListener('focusin', focus, true);
    target.ownerDocument.removeEventListener('visibilitychange', visibility);
    stopGuard(); sessions.delete(editor); drawingRotationPreview(editor).set(null); release();
    try { if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId); } catch { /* A detached handle already lost capture. */ }
  };
  const cancel = () => { if (!closed) { cleanup(); drawingRotationNotice(editor).set('canceled'); } };
  const update = () => {
    if (closed) return;
    if (frame) win.cancelAnimationFrame(frame); frame = 0;
    if (!fresh()) { cleanup(); drawingRotationNotice(editor).set('stale'); return; }
    moved ||= Math.hypot(last.x - event.clientX, last.y - event.clientY) >= 3;
    const point = editor.screenToPage(last);
    if (kind === 'pivot') {
      const result = { x: point.x - offset.x, y: point.y - offset.y };
      drawingRotationPreview(editor).set({ kind, point: result, angle: 0, source, result: [], error: validCadPoint(result) ? null : 'invalid' });
      return;
    }
    const raw = Math.atan2(point.y - pivot.point.y, point.x - pivot.point.x);
    total += Math.atan2(Math.sin(raw - previousAngle), Math.cos(raw - previousAngle)); previousAngle = raw;
    const continuous = -total * 180 / Math.PI, angle = last.shiftKey || last.ctrlKey ? Math.round(continuous / 15) * 15 : continuous;
    const normalized = normalizeDegrees(angle), radians = -normalized * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
    const result = mapContours(source, p => ({ x: pivot.point.x + (p.x - pivot.point.x) * c - (p.y - pivot.point.y) * s,
      y: pivot.point.y + (p.x - pivot.point.x) * s + (p.y - pivot.point.y) * c }));
    plan = null;
    let error: DrawingRotationNotice = null;
    try {
      if (!validCadPoint(point) || !validContours(result)) throw new Error('Invalid rotated geometry');
      if (moved && Math.abs(normalized) > 1e-8) plan = prepareRadialPointerPreview(editor, { center: pivot.point, angle: normalized, copies: 0, rotateCopies: true });
    } catch { error = 'invalid'; }
    drawingRotationPreview(editor).set({ kind, point: pivot.point, angle, source, result, error });
  };
  const move = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    consume(next); last = { x: next.clientX, y: next.clientY, shiftKey: next.shiftKey, ctrlKey: next.ctrlKey };
    if (!frame) frame = win.requestAnimationFrame(update);
  };
  const up = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    consume(next); last = { x: next.clientX, y: next.clientY, shiftKey: next.shiftKey, ctrlKey: next.ctrlKey }; update();
    if (closed) return;
    const preview = drawingRotationPreview(editor).get(), prepared = plan;
    cleanup();
    if (!moved || !preview) return;
    if (preview.error) { drawingRotationNotice(editor).set(preview.error); return; }
    if (kind === 'pivot') { drawingRotationNotice(editor).set(setDrawingRotationPivot(editor, preview.point) ? 'moved' : 'failed'); return; }
    if (!prepared) return;
    const applied = !readSkewSelection(editor).error && applyRadialPlan(editor, prepared);
    if (applied) setDrawingRotationPivot(editor, pivot.point);
    drawingRotationNotice(editor).set(applied ? 'rotated' : 'failed');
  };
  const pointerCancel = (next: PointerEvent) => { if (next.pointerId === pointerId) { consume(next); cancel(); } };
  const lostCapture = (next: Event) => { if ((next as PointerEvent).pointerId === pointerId) cancel(); };
  const wheel = () => { cancel(); };
  const focus = (next: FocusEvent) => { if (editable(next.target)) cancel(); };
  const visibility = () => { if (target.ownerDocument.visibilityState === 'hidden') cancel(); };
  const keys = (next: KeyboardEvent) => {
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(next.key)) {
      last.shiftKey = next.shiftKey; last.ctrlKey = next.ctrlKey; update(); return;
    }
    consume(next);
    if (next.type === 'keydown' && next.key === 'Escape') { suppressDrawingKeyRelease(editor, next.key); cancel(); }
  };
  consume(event); editor.focus(); drawingRotationNotice(editor).set(null); sessions.set(editor, cancel);
  drawingRotationPreview(editor).set({ kind, point: pivot.point, angle: 0, source, result: source, error: null });
  win.addEventListener('pointermove', move, { capture: true, passive: false }); win.addEventListener('pointerup', up, true);
  win.addEventListener('pointercancel', pointerCancel, true); win.addEventListener('keydown', keys, true);
  win.addEventListener('keyup', keys, true); win.addEventListener('blur', cancel);
  win.addEventListener('wheel', wheel, { capture: true, passive: false }); win.addEventListener('scroll', cancel, true);
  target.addEventListener('lostpointercapture', lostCapture);
  target.ownerDocument.addEventListener('focusin', focus, true); target.ownerDocument.addEventListener('visibilitychange', visibility);
  try { target.setPointerCapture(pointerId); } catch { /* Window listeners retain the same pointer ownership. */ }
  stopGuard = react('invalidate custom rotation pointer', () => { if (!closed && !fresh()) { cleanup(); drawingRotationNotice(editor).set('stale'); } });
  return cancel;
}

export const startDrawingPivotPointer = (editor: Editor, event: PointerEvent, target: Element) => start(editor, 'pivot', event, target);
export const startDrawingRotationPointer = (editor: Editor, event: PointerEvent, target: Element) => start(editor, 'rotate', event, target);
