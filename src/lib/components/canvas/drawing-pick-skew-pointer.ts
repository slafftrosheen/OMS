import { react, type Editor } from '@tldraw/tldraw';
import { beginDrawingSkew, cancelDrawingSkew, finishDrawingSkew, isDrawingSkewDragging, updateDrawingSkew, type DrawingSkewEdge } from './drawing-pick-skew';
import { suppressDrawingKeyRelease } from './drawing-pointer-gesture';

const editable = (target: EventTarget | null) => target instanceof Element && !!target.closest(
  'input,textarea,select,[contenteditable]:not([contenteditable="false"])');
const kill = (event: Event) => {
  event.preventDefault(); event.stopImmediatePropagation();
  (event as Event & { isKilled?: boolean }).isKilled = true;
};

/** Custom skew is a preview, so the native select tool stays idle throughout.
 * Capture listeners own this one pointer until release, cancel or invalidation.
 * No temporary curve records enter the document/history while dragging. */
export function startDrawingSkewPointer(editor: Editor, edge: DrawingSkewEdge, event: PointerEvent): (() => void) | null {
  if (event.button !== 0 || event.isPrimary === false || editable(event.target)) return null;
  const container = editor.getContainer(), doc = container.ownerDocument, win = doc.defaultView;
  if (!win || !beginDrawingSkew(editor, edge, editor.screenToPage({ x: event.clientX, y: event.clientY }), event.pointerId)) return null;
  kill(event); editor.focus();
  const pointerId = event.pointerId;
  let last = { x: event.clientX, y: event.clientY }, snap = event.shiftKey, frame = 0, closed = false, moved = false;
  const enoughMovement = (point: { x: number; y: number }) => Math.abs(edge === 'top' || edge === 'bottom' ? point.x - event.clientX : point.y - event.clientY) >= 3;
  let stopGuard = () => {};
  const update = () => {
    if (closed) return;
    // Shift can recompute synchronously before the queued pointer frame runs.
    // Retire that frame, so it cannot survive cleanup and touch a later drag.
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    moved ||= enoughMovement(last);
    if (moved) updateDrawingSkew(editor, editor.screenToPage(last), snap);
  };
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (frame) win.cancelAnimationFrame(frame);
    doc.removeEventListener('pointermove', move, true);
    doc.removeEventListener('pointerup', up, true);
    doc.removeEventListener('pointercancel', pointerCancel, true);
    doc.removeEventListener('pointerdown', anotherPointer, true);
    doc.removeEventListener('lostpointercapture', lostCapture, true);
    doc.removeEventListener('contextmenu', context, true);
    doc.removeEventListener('visibilitychange', visibility);
    doc.removeEventListener('focusin', focus, true);
    win.removeEventListener('keydown', key, true);
    win.removeEventListener('keyup', key, true);
    win.removeEventListener('blur', cancel);
    win.removeEventListener('wheel', wheel, true);
    win.removeEventListener('scroll', cancel, true);
    stopGuard();
    try { if (container.hasPointerCapture(pointerId)) container.releasePointerCapture(pointerId); } catch { /* Capture may already have been released by the platform. */ }
  };
  const cancel = () => { if (closed) return; cleanup(); cancelDrawingSkew(editor); };
  const move = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    kill(next); last = { x: next.clientX, y: next.clientY }; snap = next.shiftKey;
    if (!frame) frame = win.requestAnimationFrame(update);
  };
  const up = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    kill(next); cleanup();
    const point = { x: next.clientX, y: next.clientY };
    if (moved || enoughMovement(point)) finishDrawingSkew(editor, editor.screenToPage(point), next.shiftKey);
    else cancelDrawingSkew(editor, null);
  };
  const pointerCancel = (next: PointerEvent) => { if (next.pointerId === pointerId) { kill(next); cancel(); } };
  const anotherPointer = (next: PointerEvent) => { kill(next); if (next.pointerId !== pointerId) cancel(); };
  const lostCapture = (next: PointerEvent) => { if (next.pointerId === pointerId) cancel(); };
  const context = (next: Event) => { kill(next); cancel(); };
  const visibility = () => { if (doc.visibilityState === 'hidden') cancel(); };
  const focus = (next: FocusEvent) => { if (editable(next.target)) cancel(); };
  const wheel = (next: WheelEvent) => { kill(next); cancel(); };
  const key = (next: KeyboardEvent) => {
    if (editable(next.target)) { cancel(); return; }
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(next.key)) {
      if (next.key === 'Shift') { snap = next.type === 'keydown'; update(); }
      return;
    }
    kill(next);
    if (next.type === 'keydown' && next.key === 'Escape') { suppressDrawingKeyRelease(editor, next.key); cancel(); }
  };
  doc.addEventListener('pointermove', move, true);
  doc.addEventListener('pointerup', up, true);
  doc.addEventListener('pointercancel', pointerCancel, true);
  doc.addEventListener('pointerdown', anotherPointer, true);
  doc.addEventListener('lostpointercapture', lostCapture, true);
  doc.addEventListener('contextmenu', context, true);
  doc.addEventListener('visibilitychange', visibility);
  doc.addEventListener('focusin', focus, true);
  win.addEventListener('keydown', key, true);
  win.addEventListener('keyup', key, true);
  win.addEventListener('blur', cancel);
  win.addEventListener('wheel', wheel, { capture: true, passive: false });
  win.addEventListener('scroll', cancel, true);
  try { container.setPointerCapture(pointerId); } catch { /* Document listeners also handle pointers outside the handle. */ }
  stopGuard = react('release invalid Pick skew pointer', () => { if (!isDrawingSkewDragging(editor)) cleanup(); });
  return cancel;
}
