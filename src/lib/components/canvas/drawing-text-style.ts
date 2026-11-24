import {getShapeDrawingFontId} from './drawing-fonts';
import type { Editor, TLShapeId, TLTextShape } from '@tldraw/tldraw';
import { drawingTransaction } from './drawing-commands';
import { drawingTextScaleForPointSize } from './drawing-text-size';
import { readCadSettings } from './cad-settings';
import { drawingTextSpacingMeta, getDrawingTextSpacing, validDrawingTextSpacing, type DrawingTextSpacing } from './drawing-text-spacing';
import { canFormatDrawingText, canKeepDrawingTextBounds, canKeepDrawingTextWidth, drawingTextFixedWidthAtScale, drawingTextPageBounds, MIN_DRAWING_TEXT_LAYOUT_WIDTH, reportDrawingTextBounds, withDrawingTextFormatting } from './drawing-text-formatting';

export type DrawingTextStylePatch = Partial<{
  font: TLTextShape['props']['font'];
  pointSize: number;
  textAlign: TLTextShape['props']['textAlign'];
  autoSize: boolean;
} & DrawingTextSpacing>;

/** Remove floating-point conversion noise only at the UI boundary. Shape scale
 * keeps its full precision; equally sized labels should never appear mixed. */
export function drawingTextPointSizeDisplay(value: number): number {
  return Number(value.toFixed(6));
}

/** Format exactly the text selection that opened the control. Content and the
 * next-text defaults are independent; a stale blur cannot format a new object. */
export function applySelectedDrawingTextStyle(
  editor: Editor,
  expectedIds: readonly TLShapeId[],
  patch: DrawingTextStylePatch,
): boolean {
  const keys = Object.keys(patch);
  if (!keys.length || keys.some(key => !['font', 'pointSize', 'textAlign', 'autoSize', 'letterSpacing', 'lineHeight'].includes(key))) return false;
  if (!validDrawingTextSpacing(patch)) return false;
  if ('font' in patch && !['draw', 'sans', 'serif', 'mono'].includes(patch.font!)) return false;
  if ('textAlign' in patch && !['start', 'middle', 'end'].includes(patch.textAlign!)) return false;
  if ('autoSize' in patch && typeof patch.autoSize !== 'boolean') return false;
  if ('pointSize' in patch && (!Number.isFinite(patch.pointSize) || patch.pointSize! < 1 || patch.pointSize! > 3000)) return false;
  if (!canFormatDrawingText(editor)) return false;
  const selected = editor.getSelectedShapeIds();
  const expected = new Set(expectedIds);
  if (!selected.length || expected.size !== expectedIds.length || selected.length !== expected.size || selected.some(id => !expected.has(id))) return false;

  const updates: Array<{ id: TLShapeId; type: 'text'; props: Partial<TLTextShape['props']>; meta?: TLTextShape['meta'] }> = [];
  const settings = readCadSettings(editor);
  for (const id of selected) {
    const shape = editor.getShape(id);
    if (!shape || shape.type !== 'text' || editor.isShapeOrAncestorLocked(shape)) return false;
    const text = shape as TLTextShape;
    const props: Partial<TLTextShape['props']> = {};
    if ('font' in patch && patch.font !== text.props.font) props.font = patch.font;
    if ('textAlign' in patch && patch.textAlign !== text.props.textAlign) props.textAlign = patch.textAlign;
    if ('autoSize' in patch && patch.autoSize !== text.props.autoSize) props.autoSize = patch.autoSize;
    if ('pointSize' in patch) {
      const scale = drawingTextScaleForPointSize(text.props.size, patch.pointSize!, settings);
      if (!Number.isFinite(scale) || scale <= 0) return false;
      if (scale !== text.props.scale) props.scale = scale;
    }
    if ((patch.autoSize ?? text.props.autoSize) === false && (props.scale !== undefined || patch.autoSize === false && text.props.autoSize)) {
      // Keep the measured box, including the native minimum in old records.
      // Validate the whole selection before writing; native rendering/export
      // cannot retain this width below its 16px local layout minimum.
      const width = drawingTextFixedWidthAtScale(editor, text, props.scale ?? text.props.scale);
      if (!canKeepDrawingTextWidth(width)) return false;
      props.w = Math.max(MIN_DRAWING_TEXT_LAYOUT_WIDTH, width);
    }
    let meta: TLTextShape['meta'] | undefined = 'font' in patch && getShapeDrawingFontId(text) ? { ...text.meta, omsFontId: null } : undefined;
    const spacing = getDrawingTextSpacing(text), spacingPatch: Partial<DrawingTextSpacing> = {};
    if ('letterSpacing' in patch && patch.letterSpacing !== spacing.letterSpacing) spacingPatch.letterSpacing = patch.letterSpacing;
    if ('lineHeight' in patch && patch.lineHeight !== spacing.lineHeight) spacingPatch.lineHeight = patch.lineHeight;
    if (Object.keys(spacingPatch).length) meta = drawingTextSpacingMeta({ meta: meta ?? text.meta }, spacingPatch);
    if (Object.keys(props).length || meta) updates.push({ id, type: 'text', props, ...(meta ? { meta } : {}) });
  }
  if (!updates.length) return true;
  const previousBounds = new Map(updates.map(update => [update.id, drawingTextPageBounds(editor, editor.getShape<TLTextShape>(update.id)!)]));
  return drawingTransaction(editor, () => {
    withDrawingTextFormatting(editor, () => editor.updateShapes(updates));
    for (const update of updates) {
      const current = editor.getShape<TLTextShape>(update.id);
      if (!current || Object.entries(update.props).some(([key, value]) => current.props[key as keyof TLTextShape['props']] !== value)
        || (update.meta && JSON.stringify(current.meta) !== JSON.stringify(update.meta))) {
        throw new Error('Text formatting was not applied');
      }
      if (!canKeepDrawingTextBounds(drawingTextPageBounds(editor, current), previousBounds.get(update.id))) {
        reportDrawingTextBounds(editor); throw new Error('Text exceeds canvas limits');
      }
    }
  });
}
