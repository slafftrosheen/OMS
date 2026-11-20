import { createShapeId, getIndexBetween, type Editor, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { arrangementRoots } from './drawing-arrange';
import { drawingTransaction } from './drawing-commands';
import { TRANSFORM_ANCHORS, transformAnchorPoint, type TransformAnchor } from './drawing-transform';
import { assertCadEditable, cadRevision, CadOperationError } from './cad-plans';
import { curveBounds, mapContours, nodeAt, validContours, type CadContour } from './cad-curves';
import { validCadPoints, type CadPoint } from './cad-settings';
import { multiplyMatrix, transformAppearance, type VectorMatrix } from './cad-appearance';
import { validVectorPaint } from './cad-paint';
import { paintMetadata } from './cad-vector';

export const MAX_SKEW_ANGLE = 80;
export type SkewAxis = 'horizontal' | 'vertical';
export interface SkewOptions {
  axis: SkewAxis;
  angle: number;
  anchor: TransformAnchor;
  keepOriginal: boolean;
}
export type SkewBounds = ReturnType<typeof curveBounds>;
export interface SkewItem {
  id: TLShapeId;
  source: CadContour[];
  result: CadContour[];
  props: Record<string, unknown>;
  meta: TLShape['meta'];
}
export interface SkewPlan {
  revision: string;
  options: SkewOptions;
  roots: TLShapeId[];
  items: SkewItem[];
  sourceBounds: SkewBounds;
  resultBounds: SkewBounds;
  anchor: CadPoint;
  generated: number;
}

/** Positive horizontal angles lean the upper edge right; positive vertical
 * angles lift the right edge. This physical-page convention is independent of
 * document units, zoom and the canvas's downward-positive Y coordinates. */
export function skewPoint(point: CadPoint, anchor: CadPoint, axis: SkewAxis, angle: number): CadPoint {
  if (!['horizontal', 'vertical'].includes(axis) || !Number.isFinite(angle) || Math.abs(angle) > MAX_SKEW_ANGLE)
    throw new CadOperationError('invalid');
  const factor = Math.tan(angle * Math.PI / 180);
  return axis === 'horizontal'
    ? { x: point.x - factor * (point.y - anchor.y), y: point.y }
    : { x: point.x, y: point.y - factor * (point.x - anchor.x) };
}

function localContours(shape: TLShape): CadContour[] {
  const props = shape.props as Record<string, any>;
  if (shape.type === 'cad-bezier') {
    if (!validContours(props.contours)) throw new CadOperationError('bounds');
    return props.contours;
  }
  if (shape.type === 'cad-path') {
    if (!validCadPoints(props.points, props.closed)) throw new CadOperationError('bounds');
    return [{ closed: props.closed, nodes: props.points.map(nodeAt) }];
  }
  throw new CadOperationError('curves');
}

function selection(editor: Editor) {
  const roots = arrangementRoots(editor);
  if (!roots.length) throw new CadOperationError('selection');
  try { assertCadEditable(editor, roots); } catch { throw new CadOperationError('protected'); }
  const page = editor.getCurrentPageShapeIds();
  const shapes = [...editor.getShapeAndDescendantIds(roots)].map(id => editor.getShape(id));
  if (shapes.length > 500) throw new CadOperationError('limit');
  if (shapes.some(shape => !shape || !page.has(shape.id))) throw new CadOperationError('selection');
  const records = shapes as TLShape[];
  for (const shape of records) {
    if (!['group', 'cad-path', 'cad-bezier'].includes(shape.type)) throw new CadOperationError('curves');
    if (editor.getShapeMask(shape.id) || editor.getBindingsInvolvingShape(shape.id).length)
      throw new CadOperationError('unsupported');
    const paint = shape.meta.omsVectorPaint;
    if (paint && (!validVectorPaint(paint) || paint.clips?.length || paint.raster) || shape.meta.omsMaterialTexture)
      throw new CadOperationError('appearance');
    const seen = new Set<string>([shape.id]);
    let parent = editor.getShape(shape.parentId as TLShapeId);
    while (parent) {
      if (seen.has(parent.id) || parent.type !== 'group' || editor.getBindingsInvolvingShape(parent.id).length)
        throw new CadOperationError('unsupported');
      seen.add(parent.id);
      parent = editor.getShape(parent.parentId as TLShapeId);
    }
  }
  const leaves = records.filter(shape => shape.type !== 'group').map(shape => {
    const contours = localContours(shape);
    const pageContours = mapContours(contours, point => editor.getShapePageTransform(shape).applyToPoint(point));
    if (!validContours(pageContours)) throw new CadOperationError('bounds');
    return { shape, contours, pageContours };
  });
  if (!leaves.length) throw new CadOperationError('selection');
  if (leaves.length > 100 || leaves.reduce((n, item) => n + item.contours.reduce((sum, c) => sum + c.nodes.length, 0), 0) > 20000)
    throw new CadOperationError('limit');
  return { roots, shapes: records, leaves, bounds: curveBounds(leaves.flatMap(item => item.pageContours)) };
}

/** Give the docker a specific reason before an operator prepares a preview. */
export function readSkewSelection(editor: Editor): { count: number; bounds?: SkewBounds; error?: string } {
  try { const value = selection(editor); return { count: value.leaves.length, bounds: value.bounds }; }
  catch (error) { return { count: 0, error: error instanceof CadOperationError ? error.code : 'failed' }; }
}

/** Exact page-space curves for the guarded Pick transformation preview. */
export function readSkewSelectionContours(editor: Editor): CadContour[] {
  return selection(editor).leaves.flatMap(item => item.pageContours);
}

function capacity(editor: Editor, shapes: TLShape[], items: SkewItem[], keepOriginal: boolean) {
  if (keepOriginal && editor.getCurrentPageShapeIds().size + shapes.length > editor.options.maxShapesPerPage)
    throw new CadOperationError('limit');
  if (!editor.store) return;
  const replacements = new Map(items.map(item => [item.id, item]));
  let delta = 0;
  for (const shape of shapes) {
    const item = replacements.get(shape.id);
    const next = item ? { ...shape, props: item.props, meta: item.meta } : shape;
    delta += JSON.stringify(next).length - (keepOriginal ? 0 : JSON.stringify(shape).length);
  }
  // New IDs and root stack indices can be longer than those in the source.
  if (JSON.stringify(editor.store.getStoreSnapshot()).length + delta + (keepOriginal ? shapes.length * 128 : 0) > 1_900_000)
    throw new CadOperationError('limit');
}

export function prepareSkewPlan(editor: Editor, options: SkewOptions): SkewPlan {
  if (!options || !['horizontal', 'vertical'].includes(options.axis) || !TRANSFORM_ANCHORS.includes(options.anchor) ||
      !Number.isFinite(options.angle) || Math.abs(options.angle) > MAX_SKEW_ANGLE || typeof options.keepOriginal !== 'boolean')
    throw new CadOperationError('invalid');
  if (Math.abs(options.angle) < 1e-9) throw new CadOperationError('unchanged');
  const { roots, shapes, leaves, bounds } = selection(editor);
  const anchor = transformAnchorPoint(bounds, options.anchor);
  const factor = Math.tan(options.angle * Math.PI / 180);
  const shear: VectorMatrix = options.axis === 'horizontal'
    ? [1, 0, -factor, 1, factor * anchor.y, 0]
    : [1, -factor, 0, 1, 0, factor * anchor.x];
  let changed = false;
  const items: SkewItem[] = leaves.map(({ shape, contours, pageContours }) => {
    const transform = editor.getShapePageTransform(shape), origin = transform.point();
    const cos = Math.cos(transform.rotation()), sin = Math.sin(transform.rotation());
    const forward: VectorMatrix = [cos, sin, -sin, cos, origin.x, origin.y];
    const inverse: VectorMatrix = [cos, -sin, sin, cos, -cos * origin.x - sin * origin.y, sin * origin.x - cos * origin.y];
    const matrix = multiplyMatrix(inverse, multiplyMatrix(shear, forward));
    const localPoint = (p: CadPoint) => ({ x: matrix[0] * p.x + matrix[2] * p.y + matrix[4], y: matrix[1] * p.x + matrix[3] * p.y + matrix[5] });
    const next = mapContours(contours, localPoint);
    const result = mapContours(pageContours, point => skewPoint(point, anchor, options.axis, options.angle));
    if (!validContours(next) || !validContours(result)) throw new CadOperationError('bounds');
    for (let ci = 0; ci < pageContours.length; ci++) for (let ni = 0; ni < pageContours[ci].nodes.length; ni++) {
      const a = pageContours[ci].nodes[ni], b = result[ci].nodes[ni];
      if (['x', 'y', 'inX', 'inY', 'outX', 'outY'].some(key => Math.abs(a[key as 'x'] - b[key as 'x']) > 1e-8)) changed = true;
    }
    const props = { ...shape.props, ...(shape.type === 'cad-path'
      ? { points: next[0].nodes.map(({ x, y }) => ({ x, y })) }
      : { contours: next }) };
    if (shape.type === 'cad-path' && !validCadPoints((props as any).points, (props as any).closed))
      throw new CadOperationError('bounds');
    const paint = shape.meta.omsVectorPaint;
    // A gradient's own matrix receives exactly the same local affine map as
    // its curve. Solid paint, physical stroke width and dashes are retained.
    const nextPaint = validVectorPaint(paint) && paint.gradient ? transformAppearance(paint, matrix) : undefined;
    if (nextPaint && !validVectorPaint(nextPaint)) throw new CadOperationError('bounds');
    return { id: shape.id, source: pageContours, result, props,
      meta: nextPaint ? { ...shape.meta, omsVectorPaint: paintMetadata(nextPaint) } : structuredClone(shape.meta) };
  });
  if (!changed) throw new CadOperationError('unchanged');
  capacity(editor, shapes, items, options.keepOriginal);
  return { revision: cadRevision(editor), options: { ...options }, roots, items,
    sourceBounds: bounds, resultBounds: curveBounds(items.flatMap(item => item.result)), anchor, generated: options.keepOriginal ? shapes.length : 0 };
}

function sameValues(actual: object, expected: object) {
  return Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => JSON.stringify((actual as Record<string, unknown>)[key]) === JSON.stringify(value));
}

/** Edit mode changes only curve data and gradient coordinates. Copy mode makes
 * one complete hierarchy above its originals; no source IDs are repurposed. */
export function applySkewPlan(editor: Editor, plan: SkewPlan): boolean {
  try {
    if (plan.revision !== cadRevision(editor)) return false;
    editor.complete(); editor.setCurrentTool('select');
    if (plan.revision !== cadRevision(editor)) return false;
    const fresh = prepareSkewPlan(editor, plan.options), { shapes } = selection(editor);
    const items = new Map(fresh.items.map(item => [item.id, item]));
    const ids = new Map(shapes.map(shape => [shape.id, fresh.options.keepOriginal ? createShapeId() : shape.id]));
    const roots = new Set(fresh.roots);
    const expected = shapes.map(shape => {
      const item = items.get(shape.id);
      let index = shape.index;
      if (fresh.options.keepOriginal && roots.has(shape.id)) {
        const siblings = editor.getSortedChildIdsForParent(shape.parentId).map(id => editor.getShape(id)!).filter(Boolean);
        index = getIndexBetween(shape.index, siblings.find(sibling => sibling.index > shape.index)?.index);
      }
      return { ...structuredClone(shape), id: ids.get(shape.id)!, parentId: ids.get(shape.parentId as TLShapeId) ?? shape.parentId, index,
        ...(item ? { props: item.props, meta: item.meta } : {}) };
    });
    const camera = { ...editor.getCamera() };
    const result = drawingTransaction(editor, () => {
      if (fresh.options.keepOriginal) editor.createShapes(expected as any);
      else editor.updateShapes(expected.filter(shape => items.has(shape.id)).map(shape => ({ id: shape.id, type: shape.type, props: shape.props, meta: shape.meta })) as any);
      for (const shape of expected) {
        const actual = editor.getShape(shape.id);
        if (!actual || !['type', 'parentId', 'index', 'x', 'y', 'rotation', 'opacity', 'isLocked'].every(key => actual[key as 'x'] === shape[key as 'x']) ||
            !sameValues(actual.props, shape.props) || !sameValues(actual.meta, shape.meta))
          throw new CadOperationError('failed');
      }
      if (editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length > 1_900_000) throw new CadOperationError('limit');
      editor.setSelectedShapes(fresh.roots.map(id => ids.get(id)!));
    });
    editor.setCamera(camera);
    return result;
  } catch { return false; }
}
