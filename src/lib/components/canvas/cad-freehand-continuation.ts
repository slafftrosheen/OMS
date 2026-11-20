import { getDefaultColorTheme, type Editor, type TLShapeId } from '@tldraw/tldraw';
import { assertCadEditable, cadRevision, CadOperationError } from './cad-plans';
import { mapContours, validContours, type CadBezierNode, type CadContour } from './cad-curves';
import { validCadPoint, type CadPoint } from './cad-settings';
import { vectorPaint } from './cad-vector';
import { validVectorPaint, type VectorPaint } from './cad-paint';
import { drawingTransaction } from './drawing-commands';
import type { CadBezierShape } from './shapes/CadBezierShape';

export interface CadFreehandEndpoint {
  shapeId: TLShapeId;
  contourIndex: number;
  end: 'start' | 'end';
  point: CadPoint;
}
export interface CadFreehandContinuation {
  endpoint: CadFreehandEndpoint;
  oppositePoint: CadPoint;
  revision: string;
  pageId: string;
  source: CadBezierShape;
  paint: VectorPaint;
  /** Native color names follow the editor theme; explicit vector paint does not. */
  theme: boolean | null;
  /** Effective ancestor opacity is for the preview; the shape's own value stays unchanged. */
  opacity: number;
}
export interface CadFreehandContinuationPlan {
  captured: CadFreehandContinuation;
  extension: CadContour;
  close: boolean;
  contours: CadContour[];
  preview: CadContour[];
  previewPaint: VectorPaint;
}

const fail = (code = 'freehand-continuation') => new CadOperationError(code);
const samePoint = (a: CadPoint, b: CadPoint) => Math.hypot(a.x - b.x, a.y - b.y) <= 1e-7;
const reversed = (nodes: CadBezierNode[]) => nodes.slice().reverse().map(node => ({ ...node,
  inX: node.outX, inY: node.outY, outX: node.inX, outY: node.inY,
}));

function source(editor: Editor) {
  const shape = editor.getOnlySelectedShape();
  if (!shape || shape.type !== 'cad-bezier' || !editor.getCurrentPageShapeIds().has(shape.id)) throw fail();
  assertCadEditable(editor, [shape.id]);
  const curve = shape as CadBezierShape;
  if (!validContours(curve.props.contours) || !curve.props.contours.some(contour => !contour.closed)) throw fail();
  const paint = vectorPaint(curve.meta, curve.props.color);
  const theme = curve.meta.omsVectorPaint ? null : editor.user.getIsDarkMode();
  if (theme !== null) paint.stroke = getDefaultColorTheme({ isDarkMode: theme })[curve.props.color].solid;
  if (curve.meta.omsVectorPaint && !validVectorPaint(curve.meta.omsVectorPaint) ||
      (paint.fill !== 'none' && paint.fillOpacity > 0) || paint.stroke === 'none' || paint.strokeWidth <= 0 || paint.strokeOpacity <= 0 ||
      paint.gradient || paint.raster || paint.clips?.length || curve.meta.omsMaterialTexture ||
      editor.getShapeMask(curve.id) || editor.getBindingsInvolvingShape(curve.id).length) throw fail();
  let opacity = curve.opacity, parentId = curve.parentId;
  const seen = new Set<string>([curve.id]);
  while (parentId !== editor.getCurrentPageId()) {
    const parent = editor.getShape(parentId as TLShapeId);
    if (!parent || parent.type !== 'group' || seen.has(parent.id) || editor.getBindingsInvolvingShape(parent.id).length || editor.getShapeMask(parent.id)) throw fail();
    seen.add(parent.id); opacity *= parent.opacity; parentId = parent.parentId;
  }
  if (!Number.isFinite(opacity) || opacity <= 0 || opacity > 1) throw fail();
  return { shape: curve, paint, opacity, theme };
}

/** Only the selected editable object is offered. This cannot silently join or
 * delete unrelated artwork and does not compete with native shape hit testing. */
export function readCadFreehandEndpoints(editor: Editor): CadFreehandEndpoint[] {
  try {
    const { shape } = source(editor), transform = editor.getShapePageTransform(shape);
    return shape.props.contours.flatMap((contour, contourIndex) => contour.closed ? [] : (['start', 'end'] as const).flatMap(end => {
      const p = transform.applyToPoint(end === 'start' ? contour.nodes[0] : contour.nodes.at(-1)!);
      return validCadPoint(p) ? [{ shapeId: shape.id, contourIndex, end, point: { x: p.x, y: p.y } }] : [];
    }));
  } catch { return []; }
}

export function nearestCadFreehandEndpoint(editor: Editor, point: CadPoint, tolerance: number): CadFreehandEndpoint | null {
  if (!validCadPoint(point) || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1e6) return null;
  let found: CadFreehandEndpoint | null = null, distance = tolerance;
  for (const endpoint of readCadFreehandEndpoints(editor)) {
    const next = Math.hypot(endpoint.point.x - point.x, endpoint.point.y - point.y);
    if (next <= distance && (!found || next < distance)) { found = endpoint; distance = next; }
  }
  return found;
}

export function captureCadFreehandContinuation(editor: Editor, endpoint: CadFreehandEndpoint): CadFreehandContinuation {
  const { shape, paint, opacity, theme } = source(editor);
  const actual = readCadFreehandEndpoints(editor).find(value => value.shapeId === endpoint.shapeId &&
    value.contourIndex === endpoint.contourIndex && value.end === endpoint.end && samePoint(value.point, endpoint.point));
  if (!actual) throw fail();
  const contour = mapContours([shape.props.contours[endpoint.contourIndex]], point => editor.getShapePageTransform(shape).applyToPoint(point))[0];
  const opposite = endpoint.end === 'start' ? contour.nodes.at(-1)! : contour.nodes[0];
  return { endpoint: structuredClone(actual), oppositePoint: { x: opposite.x, y: opposite.y },
    revision: cadRevision(editor), pageId: editor.getCurrentPageId(), source: structuredClone(shape), paint, opacity, theme };
}

/** Preserve every original segment. Only the previously unused endpoint
 * handle is replaced at the join. Prepending keeps the original direction. */
export function graftCadFreehandContour(original: CadContour, extension: CadContour, end: 'start' | 'end', close: boolean): CadContour {
  if (!validContours([original]) || original.closed || !validContours([extension]) || extension.closed ||
      !['start', 'end'].includes(end) || typeof close !== 'boolean') throw fail('freehand-invalid');
  const existing = structuredClone(original.nodes), added = structuredClone(extension.nodes);
  const anchor = end === 'start' ? existing[0] : existing.at(-1)!;
  if (!samePoint(anchor, added[0])) throw fail('freehand-invalid');
  added[0].x = anchor.x; added[0].y = anchor.y;
  let nodes: CadBezierNode[];
  if (close) {
    const opposite = end === 'start' ? existing.at(-1)! : existing[0];
    if (!samePoint(opposite, added.at(-1)!)) throw fail('freehand-invalid');
    added.at(-1)!.x = opposite.x; added.at(-1)!.y = opposite.y;
    const bridge = end === 'end' ? added : reversed(added), first = existing[0], last = existing.at(-1)!;
    last.outX = bridge[0].outX; last.outY = bridge[0].outY; last.mode = 'corner';
    first.inX = bridge.at(-1)!.inX; first.inY = bridge.at(-1)!.inY; first.mode = 'corner';
    nodes = [...existing, ...bridge.slice(1, -1)];
  } else if (end === 'end') {
    const last = existing.at(-1)!;
    last.outX = added[0].outX; last.outY = added[0].outY; last.mode = 'corner';
    nodes = [...existing, ...added.slice(1)];
  } else {
    const before = reversed(added), first = existing[0];
    first.inX = before.at(-1)!.inX; first.inY = before.at(-1)!.inY; first.mode = 'corner';
    nodes = [...before.slice(0, -1), ...existing];
  }
  const result = { closed: close, nodes };
  if (!validContours([result])) throw fail('freehand-limit');
  return result;
}

function freshSource(editor: Editor, captured: CadFreehandContinuation) {
  if (captured.pageId !== editor.getCurrentPageId() || captured.revision !== cadRevision(editor)) throw fail('stale');
  const current = source(editor);
  if (JSON.stringify(current.shape) !== JSON.stringify(captured.source) || current.theme !== captured.theme) throw fail('stale');
  return current.shape;
}
function capacity(editor: Editor, shape: CadBezierShape, contours: CadContour[]) {
  if (!validContours(contours)) throw fail('freehand-limit');
  const replacement = { ...shape, props: { ...shape.props, contours } };
  if (JSON.stringify(editor.store.getStoreSnapshot()).length - JSON.stringify(shape).length + JSON.stringify(replacement).length > 1_900_000)
    throw fail('freehand-limit');
}

export function prepareCadFreehandContinuation(editor: Editor, captured: CadFreehandContinuation, extension: CadContour, close: boolean): CadFreehandContinuationPlan {
  const shape = freshSource(editor, captured);
  if (!validContours([extension]) || extension.closed) throw fail('freehand-invalid');
  const localExtension = mapContours([extension], point => editor.getPointInShapeSpace(shape, point))[0];
  const contours = structuredClone(shape.props.contours), index = captured.endpoint.contourIndex;
  if (!contours[index]) throw fail('stale');
  contours[index] = graftCadFreehandContour(contours[index], localExtension, captured.endpoint.end, close);
  capacity(editor, shape, contours);
  // Render the complete future shape once inside its original native shape
  // container, preserving translucent joins, dash phase, layers and groups.
  const preview = mapContours(contours, point => editor.getShapePageTransform(shape).applyToPoint(point));
  const previewPaint = structuredClone(captured.paint);
  return { captured, extension: structuredClone(extension), close, contours, preview, previewPaint };
}

/** No completion/tool switch: this is called after the controller removes its
 * preview guards. A continuation is one update and one Undo, never a new ID. */
export function applyCadFreehandContinuation(editor: Editor, plan: CadFreehandContinuationPlan): boolean {
  try {
    const fresh = prepareCadFreehandContinuation(editor, plan.captured, plan.extension, plan.close);
    const shape = freshSource(editor, fresh.captured), expected = { ...shape, props: { ...shape.props, contours: fresh.contours } };
    if (JSON.stringify(shape) === JSON.stringify(expected)) return false;
    return drawingTransaction(editor, () => {
      editor.updateShape({ id: shape.id, type: 'cad-bezier', props: { contours: fresh.contours } });
      if (JSON.stringify(editor.getShape(shape.id)) !== JSON.stringify(expected)) throw fail('failed');
      capacity(editor, expected, fresh.contours);
      editor.setSelectedShapes([shape.id]);
    });
  } catch { return false; }
}
