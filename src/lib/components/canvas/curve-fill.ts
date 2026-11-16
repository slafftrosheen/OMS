import type { Editor, TLShape, TLShapeId } from '@tldraw/tldraw';
import { curvePathData, nodeAt, type CadContour } from './cad-curves';
import { validVectorPaint, type VectorPaint } from './cad-paint';
import { vectorPaint, paintMetadata } from './cad-vector';
import { assertCadEditable } from './cad-plans';
import { drawingTransaction } from './drawing-commands';
import { cadAnalyticPath, cadAppearanceGeometry } from './cad-shape-appearance';

/** Read-only geometry for fill mapping. The ellipse envelope is used only for
 * conservative tile budgeting and preview bounds; rendering uses its exact SVG
 * conic and paint edits never write these contours into the document. */
export function curveFillGeometry(shape: TLShape) {
  const { bounds, closed } = cadAppearanceGeometry(shape);
  const props = shape.props as any;
  if (shape.type === 'cad-bezier') {
    if (!['evenodd', 'nonzero'].includes(props.fillRule)) throw new Error('fill-selection');
    return { bounds, closed, contours: props.contours as CadContour[],
      data: curvePathData(props.contours), fillRule: props.fillRule as 'evenodd' | 'nonzero' };
  }
  if (!closed || !['cad-path', 'cad-ellipse'].includes(shape.type)) throw new Error('fill-selection');
  const { x, y, w, h } = bounds;
  const points = shape.type === 'cad-path' ? props.points : [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  return { bounds, closed, contours: [{ closed: true, nodes: points.map(nodeAt) }] as CadContour[],
    data: cadAnalyticPath(shape), fillRule: 'evenodd' as const };
}

/** Common edit boundary for image and vector fills on production curves. */
export function curveFillSource(editor: Editor, id?: TLShapeId, error = 'fill-selection') {
  const shape = id ? editor.getShape(id) : editor.getOnlySelectedShape();
  if (!shape) throw new Error(error);
  assertCadEditable(editor, [shape.id]);
  let geometry: ReturnType<typeof curveFillGeometry>;
  try { geometry = curveFillGeometry(shape); } catch { throw new Error(error); }
  const props = shape.props as any, paint = vectorPaint(shape.meta, props.color);
  if (shape.meta.omsVectorPaint && !validVectorPaint(shape.meta.omsVectorPaint) ||
      editor.getShapeMask(shape.id) || paint.clips?.length || paint.raster && paint.raster.usage !== 'material' ||
      editor.getBindingsInvolvingShape(shape.id).length) throw new Error(error);
  let parent = editor.getShape(shape.parentId as TLShapeId); const seen = new Set<string>();
  while (parent && !seen.has(parent.id)) {
    if (parent.type !== 'group') throw new Error(error);
    seen.add(parent.id); parent = editor.getShape(parent.parentId as TLShapeId);
  }
  if (parent) throw new Error(error);
  return { shape, paint, ...geometry };
}

/** Atomic paint-only update; metadata patches must explicitly clear old keys
 * because tldraw shallow-merges them. Shrinking an over-budget document is OK. */
export function updateCurveFill(editor: Editor, id: TLShapeId, paint: VectorPaint, patch: Record<string, any>) {
  let shape: TLShape;
  try { shape = curveFillSource(editor, id).shape; } catch { return false; }
  if (!validVectorPaint(paint)) return false;
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
