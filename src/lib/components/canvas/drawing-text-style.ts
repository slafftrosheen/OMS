import {getShapeDrawingFontId} from './drawing-fonts';
import type { Editor, TLShapeId, TLTextShape } from '@tldraw/tldraw';
import { drawingTransaction } from './drawing-commands';
import { TEXT_PIXELS } from './workbench-operations';

export type DrawingTextStylePatch = Partial<{
  font: TLTextShape['props']['font'];
  pointSize: number;
  textAlign: TLTextShape['props']['textAlign'];
  autoSize: boolean;
}>;

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
  if (!keys.length || keys.some(key => !['font', 'pointSize', 'textAlign', 'autoSize'].includes(key))) return false;
  if ('font' in patch && !['draw', 'sans', 'serif', 'mono'].includes(patch.font!)) return false;
  if ('textAlign' in patch && !['start', 'middle', 'end'].includes(patch.textAlign!)) return false;
  if ('autoSize' in patch && typeof patch.autoSize !== 'boolean') return false;
  if ('pointSize' in patch && (!Number.isFinite(patch.pointSize) || patch.pointSize! < 1 || patch.pointSize! > 3000)) return false;
  if (editor.getInstanceState().isReadonly || editor.getCurrentToolId() !== 'select') return false;
  const selected = editor.getSelectedShapeIds();
  const expected = new Set(expectedIds);
  if (!selected.length || expected.size !== expectedIds.length || selected.length !== expected.size || selected.some(id => !expected.has(id))) return false;

  const updates: Array<{ id: TLShapeId; type: 'text'; props: Partial<TLTextShape['props']>; meta?: TLTextShape['meta'] }> = [];
  for (const id of selected) {
    const shape = editor.getShape(id);
    if (!shape || shape.type !== 'text' || editor.isShapeOrAncestorLocked(shape)) return false;
    const text = shape as TLTextShape;
    const props: Partial<TLTextShape['props']> = {};
    if ('font' in patch && patch.font !== text.props.font) props.font = patch.font;
    if ('textAlign' in patch && patch.textAlign !== text.props.textAlign) props.textAlign = patch.textAlign;
    if ('autoSize' in patch && patch.autoSize !== text.props.autoSize) props.autoSize = patch.autoSize;
    if ('pointSize' in patch) {
      const scale = patch.pointSize! / (TEXT_PIXELS[text.props.size] * 0.75);
      if (!Number.isFinite(scale) || scale <= 0) return false;
      if (scale !== text.props.scale) props.scale = scale;
    }
    const meta = 'font' in patch && getShapeDrawingFontId(text) ? { ...text.meta, omsFontId: null } : undefined;
    if (Object.keys(props).length || meta) updates.push({ id, type: 'text', props, ...(meta ? { meta } : {}) });
  }
  if (!updates.length) return true;
  return drawingTransaction(editor, () => {
    editor.updateShapes(updates);
    for (const update of updates) {
      const current = editor.getShape<TLTextShape>(update.id);
      if (!current || Object.entries(update.props).some(([key, value]) => current.props[key as keyof TLTextShape['props']] !== value)) {
        throw new Error('Text formatting was not applied');
      }
    }
  });
}
