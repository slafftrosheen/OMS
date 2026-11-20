import { atom, react, type Editor } from '@tldraw/tldraw';
import { getSelectedCadNodes, isCadNodeEditing, setSelectedCadNodes } from './cad-node-selection';
import { claimDrawingPointerGesture, suppressDrawingKeyRelease } from './drawing-pointer-gesture';
import type { CadPoint } from './cad-settings';
import type { CadBezierShape } from './shapes/CadBezierShape';

type MarqueeBox = { x: number; y: number; w: number; h: number };
function marqueeAtom() { return atom<MarqueeBox | null>('CAD node marquee', null); }
const marquees = new WeakMap<Editor, ReturnType<typeof marqueeAtom>>();
export function cadNodeMarquee(editor: Editor) {
  let value = marquees.get(editor);
  if (!value) { value = marqueeAtom(); marquees.set(editor, value); }
  return value;
}

function boxBetween(a: CadPoint, b: CadPoint): MarqueeBox {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

function applyMarquee(editor: Editor, shape: CadBezierShape, rect: MarqueeBox, add: boolean) {
  const selected = add ? [...getSelectedCadNodes(editor)] : [];
  const keys = new Set(selected.map(node => `${node.contourIndex}:${node.nodeIndex}`));
  const transform = editor.getShapePageTransform(shape);
  // Include every anchor in the rectangle, even if dense handle display sampled it out.
  shape.props.contours.forEach((contour, contourIndex) => contour.nodes.forEach((node, nodeIndex) => {
    const point = transform.applyToPoint(node);
    if (point.x < rect.x || point.x > rect.x + rect.w || point.y < rect.y || point.y > rect.y + rect.h) return;
    const key = `${contourIndex}:${nodeIndex}`;
    if (!keys.has(key)) selected.push({ shapeId: shape.id, contourIndex, nodeIndex });
  }));
  setSelectedCadNodes(editor, selected);
}

/** Capture blank-canvas drags before native Pick can turn them into object selection. */
export function installCadNodeMarquee(editor: Editor): () => void {
  const container = editor.getContainer(), doc = container.ownerDocument, win = doc.defaultView;
  if (!win) return () => {};
  const preview = cadNodeMarquee(editor);
  let cancelActive: (() => void) | undefined;
  const consume = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const down = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const canvas = target.closest('.tl-canvas[data-testid="canvas"]');
    if (!canvas || (target !== canvas && !target.matches('.tl-background, .tl-background__wrapper')) ||
        event.defaultPrevented || event.button !== 0 || event.isPrimary === false || event.pointerType === 'touch' ||
        event.ctrlKey || event.metaKey || event.altKey || editor.inputs.keys.has('Space') ||
        !isCadNodeEditing(editor) || !editor.isIn('select.idle')) return;
    const shape = editor.getOnlySelectedShape() as CadBezierShape | null;
    if (shape?.type !== 'cad-bezier') return;
    const release = claimDrawingPointerGesture(editor, 'nodes', event.pointerId);
    if (!release) return;
    consume(event);
    editor.focus();

    const screen = { x: event.clientX, y: event.clientY }, origin = editor.screenToPage(screen);
    const pageId = editor.getCurrentPageId(), viewport = editor.getViewportScreenBounds();
    const view = () => {
      const { x, y, z } = editor.getCamera(), screen = editor.getViewportScreenBounds();
      const { a, b, c, d, e, f } = editor.getShapePageTransform(shape.id);
      return [x, y, z, screen.x, screen.y, screen.w, screen.h, a, b, c, d, e, f];
    };
    const startView = view();
    const readOnly = editor.getInstanceState().isReadonly;
    let stopGuard = () => {};
    const current = () => isCadNodeEditing(editor) && editor.isIn('select.idle') &&
      editor.getCurrentPageId() === pageId && editor.getOnlySelectedShape() === shape &&
      view().every((value, index) => value === startView[index]) &&
      editor.getInstanceState().isReadonly === readOnly;
    const rect = (next: PointerEvent) =>
      Math.hypot(next.clientX - screen.x, next.clientY - screen.y) >= 4
        ? boxBetween(origin, editor.screenToPage({
          x: Math.min(viewport.maxX, Math.max(viewport.minX, next.clientX)),
          y: Math.min(viewport.maxY, Math.max(viewport.minY, next.clientY))
        })) : null;
    const cancel = () => {
      if (cancelActive !== cancel) return;
      cancelActive = undefined;
      preview.set(null);
      stopGuard();
      release();
      doc.removeEventListener('pointermove', move, true);
      doc.removeEventListener('pointerup', up, true);
      doc.removeEventListener('pointercancel', pointerCancel, true);
      doc.removeEventListener('lostpointercapture', pointerCancel, true);
      doc.removeEventListener('visibilitychange', visibility);
      win.removeEventListener('keydown', key, true);
      win.removeEventListener('blur', cancel);
      win.removeEventListener('wheel', cancel, true);
      try { if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); } catch { /* Platform may have released it. */ }
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId) return;
      consume(next);
      if (current()) preview.set(rect(next));
      else cancel();
    };
    const up = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId) return;
      consume(next);
      const valid = current(), area = valid ? rect(next) : null;
      cancel();
      if (area) applyMarquee(editor, shape, area, next.shiftKey);
      else if (valid && !next.shiftKey) setSelectedCadNodes(editor, []);
    };
    const pointerCancel = (next: PointerEvent) => { if (next.pointerId === event.pointerId) cancel(); };
    const visibility = () => { if (doc.visibilityState === 'hidden') cancel(); };
    const key = (next: KeyboardEvent) => {
      if (next.key === 'Escape') {
        consume(next);
        suppressDrawingKeyRelease(editor, next.key);
      }
      if (next.key !== 'Shift') cancel();
    };
    cancelActive = cancel;
    doc.addEventListener('pointermove', move, true);
    doc.addEventListener('pointerup', up, true);
    doc.addEventListener('pointercancel', pointerCancel, true);
    doc.addEventListener('lostpointercapture', pointerCancel, true);
    doc.addEventListener('visibilitychange', visibility);
    win.addEventListener('keydown', key, true);
    win.addEventListener('blur', cancel);
    win.addEventListener('wheel', cancel, true);
    try { canvas.setPointerCapture(event.pointerId); } catch { /* Document capture also sees release outside the canvas. */ }
    const stop = react('cancel stale CAD node marquee', () => { if (!current()) cancel(); });
    if (cancelActive === cancel) stopGuard = stop;
    else stop();
  };
  container.addEventListener('pointerdown', down, true);
  return () => { container.removeEventListener('pointerdown', down, true); cancelActive?.(); };
}
