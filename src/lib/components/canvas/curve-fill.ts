import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { validContours, type CadContour } from './cad-curves';
import { validVectorPaint, type VectorPaint } from './cad-paint';
import { vectorPaint, paintMetadata } from './cad-vector';
import { assertCadEditable } from './cad-plans';
import { drawingTransaction } from './drawing-commands';

/** Common edit boundary for image and vector fills on production curves. */
export function curveFillSource(editor: Editor, id?: TLShapeId, error = 'fill-selection') {
  const shape = id ? editor.getShape(id) : editor.getOnlySelectedShape();
  if (shape?.type !== 'cad-bezier') throw new Error(error);
  assertCadEditable(editor, [shape.id]);
  const props = shape.props as any, paint = vectorPaint(shape.meta, props.color);
  if (!validContours(props.contours) || shape.meta.omsVectorPaint && !validVectorPaint(shape.meta.omsVectorPaint) ||
      editor.getShapeMask(shape.id) || paint.clips?.length || paint.raster && paint.raster.usage !== 'material' ||
      editor.getBindingsInvolvingShape(shape.id).length) throw new Error(error);
  let parent = editor.getShape(shape.parentId as TLShapeId); const seen = new Set<string>();
  while (parent && !seen.has(parent.id)) {
    if (parent.type !== 'group') throw new Error(error);
    seen.add(parent.id); parent = editor.getShape(parent.parentId as TLShapeId);
  }
  return { shape, paint, contours: props.contours as CadContour[], fillRule: props.fillRule as 'evenodd' | 'nonzero' };
}

/** Atomic paint-only update; metadata patches must explicitly clear old keys
 * because tldraw shallow-merges them. Shrinking an over-budget document is OK. */
export function updateCurveFill(editor: Editor, id: TLShapeId, paint: VectorPaint, patch: Record<string, any>) {
  const shape = editor.getShape(id)!;
  const meta = { ...shape.meta, ...patch, omsVectorPaint: paintMetadata(paint) };
  const encoded = JSON.stringify(meta), props = JSON.stringify(shape.props);
  const current = editor.store ? JSON.stringify(editor.store.getStoreSnapshot()).length : JSON.stringify(shape.meta).length;
  const next = current - JSON.stringify(shape.meta).length + encoded.length;
  if (next > 1_900_000 && next >= current) return false;
  return drawingTransaction(editor, () => {
    editor.updateShape({ id, type: shape.type, meta });
    const changed = editor.getShape(id);
    if (!changed || JSON.stringify(changed.meta) !== encoded || JSON.stringify(changed.props) !== props) throw new Error('fill-failed');
  });
}
