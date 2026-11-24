import { Box, Mat, type Editor, type TLTextShape, type TextShapeUtil } from '@tldraw/tldraw';
import { CAD_MAX_COORDINATE } from './cad-settings';
import { getWorkbenchText } from './workbench-copy';

const formatting = new WeakSet<Editor>();

/** A point-size edit and a corner resize both change native `scale`, but their
 * anchors differ. Scope this distinction to the synchronous formatting command. */
export function withDrawingTextFormatting<T>(editor: Editor, change: () => T): T {
  const already = formatting.has(editor);
  formatting.add(editor);
  try { return change(); } finally { if (!already) formatting.delete(editor); }
}
export const isDrawingTextFormatting = (editor: Editor): boolean => formatting.has(editor);

/** Measure the candidate record itself: native geometry/transform caches use
 * its id and would otherwise validate the previous text or alignment anchor. */
export function drawingTextPageBounds(editor: Editor, shape: TLTextShape): Box | null {
  try {
    const util = editor.getShapeUtil(shape);
    const bounds = (typeof util.getGeometry === 'function' ? util.getGeometry(shape) : editor.getShapeGeometry(shape)).bounds;
    if (![bounds.x, bounds.y, bounds.w, bounds.h, shape.x, shape.y, shape.rotation].every(Number.isFinite) || bounds.w <= 0 || bounds.h <= 0) return null;
    let transform = Mat.Identity().translate(shape.x, shape.y).rotate(shape.rotation);
    if (!shape.parentId.startsWith('page:')) {
      const parent = editor.getShape(shape.parentId);
      if (!parent) return null;
      transform = Mat.Compose(editor.getShapePageTransform(parent), transform);
    }
    const points = bounds.corners.map(point => transform.applyToPoint(point));
    return points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)) ? Box.FromPoints(points) : null;
  } catch { return null; }
}

export function drawingTextBoundsInsideCanvas(bounds: Box | null): boolean {
  return !!bounds && bounds.minX >= -CAD_MAX_COORDINATE && bounds.minY >= -CAD_MAX_COORDINATE &&
    bounds.maxX <= CAD_MAX_COORDINATE && bounds.maxY <= CAD_MAX_COORDINATE;
}

/** Existing oversized text can be repaired or edited without increasing any
 * page extent. A new record must fit entirely inside the supported canvas. */
export function canKeepDrawingTextBounds(next: Box | null, before?: Box | null): boolean {
  if (drawingTextBoundsInsideCanvas(next)) return true;
  return !!next && !!before && !drawingTextBoundsInsideCanvas(before) &&
    next.minX >= before.minX - 1e-7 && next.minY >= before.minY - 1e-7 &&
    next.maxX <= before.maxX + 1e-7 && next.maxY <= before.maxY + 1e-7;
}

export function reportDrawingTextBounds(editor: Editor): void {
  editor.getContainer?.()?.dispatchEvent(new CustomEvent('oms:canvas-upload', {
    detail: { message: getWorkbenchText('textBounds'), busy: false },
  }));
}

/** Native paragraph measurement clamps width to 16 unscaled pixels; TextLabel
 * and export then use that measured width. Do not claim to preserve a box whose
 * requested type size would force its local width below that minimum. */
export const MIN_DRAWING_TEXT_LAYOUT_WIDTH = 16;

export function drawingTextFixedWidthAtScale(editor: Editor, shape: TLTextShape, scale: number): number {
  const util = editor.getShapeUtil(shape) as TextShapeUtil;
  const width = typeof util.getMinDimensions === 'function'
    ? util.getMinDimensions(shape).width
    : Math.max(MIN_DRAWING_TEXT_LAYOUT_WIDTH, shape.props.w);
  return width * shape.props.scale / scale;
}

export function canKeepDrawingTextWidth(width: number): boolean {
  return Number.isFinite(width) && width >= MIN_DRAWING_TEXT_LAYOUT_WIDTH - 1e-8;
}

export function canFormatDrawingText(editor: Editor): boolean {
  return !editor.isDisposed && !editor.getInstanceState().isReadonly && editor.getCurrentToolId() === 'select'
    && (typeof editor.isIn !== 'function' || editor.isIn('select.idle') || editor.isIn('select.editing_shape'));
}
