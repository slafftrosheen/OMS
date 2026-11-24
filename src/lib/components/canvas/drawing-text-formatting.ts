import type { Editor, TLTextShape, TextShapeUtil } from '@tldraw/tldraw';

const formatting = new WeakSet<Editor>();

/** A point-size edit and a corner resize both change native `scale`, but their
 * anchors differ. Scope this distinction to the synchronous formatting command. */
export function withDrawingTextFormatting<T>(editor: Editor, change: () => T): T {
  const already = formatting.has(editor);
  formatting.add(editor);
  try { return change(); } finally { if (!already) formatting.delete(editor); }
}
export const isDrawingTextFormatting = (editor: Editor): boolean => formatting.has(editor);

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
