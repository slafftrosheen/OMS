import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { CAD_APPEARANCE_TYPES, cadAppearanceGeometry } from './cad-shape-appearance';
import { vectorPaint, paintMetadata, validVectorPaint } from './cad-vector';
import { assertCadEditable } from './cad-plans';
import { drawingTransaction } from './drawing-commands';

export function drawingSolidFillSource(editor: Editor) {
  const shape = editor.getOnlySelectedShape();
  if (!shape || !CAD_APPEARANCE_TYPES.has(shape.type)) return null;
  try {
    if (!cadAppearanceGeometry(shape).closed || shape.meta.omsVectorPaint && !validVectorPaint(shape.meta.omsVectorPaint)) return null;
    return { shape, signature: JSON.stringify(shape), paint: vectorPaint(shape.meta, (shape.props as {color?:string}).color) };
  } catch { return null; }
}

/** A solid-fill edit owns only fill colour and its replaced gradient/material.
 * Outline, clipping, opacity, source links and original geometry are retained. */
export function applyDrawingSolidFill(editor: Editor, id: TLShapeId, signature: string, fill: string): boolean {
  if (!/^(none|#[0-9a-f]{6})$/i.test(fill)) return false;
  try {
    assertCadEditable(editor, [id]);
    const source = drawingSolidFillSource(editor);
    if (!source || source.shape.id !== id || source.signature !== signature) return false;
    const {shape,paint} = source;
    paint.fill = fill;
    delete paint.gradient;
    delete paint.raster;
    const meta = {...shape.meta, omsMaterialTexture: null, omsVectorPaint: paintMetadata(paint)};
    const encoded = JSON.stringify(meta);
    const current = editor.store ? JSON.stringify(editor.store.getStoreSnapshot()).length : JSON.stringify(shape.meta).length;
    const next = current - JSON.stringify(shape.meta).length + encoded.length;
    if (next > 1_900_000 && next >= current) return false;
    return drawingTransaction(editor, () => {
      editor.updateShape({id, type:shape.type, meta});
      const result = editor.getShape(id);
      if (!result || JSON.stringify(result) !== JSON.stringify({...shape,meta})) throw new Error('fill-failed');
    });
  } catch { return false; }
}
