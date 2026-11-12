import type { Editor } from '@tldraw/tldraw';
import { arcContour, cubicAt, cubicPoints, curveBounds, flattenContours, mapContours, nodeAt, validContours, type CadContour } from './cad-curves';
import { cadMmPerPixel, validateCadSettings, CAD_MAX_COORDINATE, type CadPoint, type CadSettings } from './cad-settings';
import { assertCadEditable, cadRevision, CadOperationError, makeCadPlan, type CadPlan } from './cad-plans';
import { cadSelectedShapes } from './cad-editing';
import { getSelectedCadNode, selectCadNode, setCadNodeEditing, type CadNodeSelection } from './cad-node-selection';
import { drawingTransaction } from './drawing-commands';
import type { CadBezierShape } from './shapes/CadBezierShape';

export type CadCornerKind = 'fillet' | 'chamfer';
export const NODE_FILLET_TOLERANCE_MM = 0.005;
interface NodeCornerGeometry { contours: CadContour[]; region: CadPoint[] }
export interface CadNodeCornerPlan extends CadPlan {
  nodeEdit: CadNodeSelection & { localContours: CadContour[] };
  originalContours: CadContour[];
  previewBounds: ReturnType<typeof curveBounds>;
}

/** Error of a unit circular cubic. Its squared radial error is proportional to
 * t²(1-t)²(2t-1)², whose maxima are at (3 ± √3)/6. Include roundoff margin. */
function radialError(angle: number): number {
  const a = Math.abs(angle) / 2, c = Math.cos(a), s = Math.sin(a), k = 4 / 3 * Math.tan(a / 2);
  const p = cubicAt([{ x: c, y: -s }, { x: c + k * s, y: -s + k * c },
    { x: c + k * s, y: s - k * c }, { x: c, y: s }], (3 - Math.sqrt(3)) / 6);
  return Math.max(0, Math.hypot(p.x, p.y) - 1) + 32 * Number.EPSILON;
}

function pointSegmentDistance(p: CadPoint, a: CadPoint, b: CadPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
const cross = (a: CadPoint, b: CadPoint, p: CadPoint) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
function segmentDistance(a: CadPoint, b: CadPoint, c: CadPoint, d: CadPoint): number {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y, denominator = rx * sy - ry * sx;
  if (denominator) {
    const qx = c.x - a.x, qy = c.y - a.y;
    const t = (qx * sy - qy * sx) / denominator, u = (qx * ry - qy * rx) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}
function meetsTriangle(a: CadPoint, b: CadPoint, triangle: CadPoint[], tolerance: number): boolean {
  const inside = (p: CadPoint) => {
    const signs = triangle.map((q, i) => cross(q, triangle[(i + 1) % 3], p));
    return signs.every(s => s >= 0) || signs.every(s => s <= 0);
  };
  return inside(a) || inside(b) || triangle.some((p, i) => segmentDistance(a, b, p, triangle[(i + 1) % 3]) <= tolerance);
}

/** The replacement stays inside the corner triangle. Conservatively require
 * that entire edit region to be clear of other segments, including hole paths.
 * Curves use bounded flattening and a matching clearance margin. */
function requireClearCorner(contours: CadContour[], ci: number, ni: number, region: CadPoint[], tolerance: number): void {
  const minX = Math.min(...region.map(p => p.x)) - tolerance, maxX = Math.max(...region.map(p => p.x)) + tolerance;
  const minY = Math.min(...region.map(p => p.y)) - tolerance, maxY = Math.max(...region.map(p => p.y)) + tolerance;
  let remaining = 50_000;
  for (const [index, contour] of contours.entries()) {
    for (let i = 0; i < contour.nodes.length - (contour.closed ? 0 : 1); i++) {
      if (index === ci && (i === ni || i === (ni + contour.nodes.length - 1) % contour.nodes.length)) continue;
      const a = contour.nodes[i], b = contour.nodes[(i + 1) % contour.nodes.length], controls = cubicPoints(a, b);
      if (controls.every(p => p.x < minX) || controls.every(p => p.x > maxX) ||
          controls.every(p => p.y < minY) || controls.every(p => p.y > maxY)) continue;
      let points: CadPoint[];
      try { points = a.outX || a.outY || b.inX || b.inY ? flattenContours([{ closed: false, nodes: [a, b] }], tolerance, remaining)[0] : [a, b]; }
      catch { throw new CadOperationError('limit'); }
      remaining -= points.length;
      if (remaining < 0) throw new CadOperationError('limit');
      for (let j = 1; j < points.length; j++)
        if (meetsTriangle(points[j - 1], points[j], region, tolerance)) throw new CadOperationError('corner-intersection');
    }
  }
}

/** Replace just one corner between straight adjacent segments. Other anchors,
 * controls, contour ordering and winding remain byte-for-byte unchanged. */
export function cornerAtNode(contours: CadContour[], ci: number, ni: number, amount: number, kind: CadCornerKind, tolerance: number): NodeCornerGeometry {
  if (!validContours(contours) || !Number.isInteger(ci) || !Number.isInteger(ni) ||
      !Number.isFinite(amount) || amount <= 0 || amount > CAD_MAX_COORDINATE || !['fillet', 'chamfer'].includes(kind) ||
      !Number.isFinite(tolerance) || tolerance <= 0) throw new CadOperationError('corner-size');
  const contour = contours[ci], p = contour?.nodes[ni];
  if (!p || contour.nodes.length < 3 || !contour.closed && (ni === 0 || ni === contour.nodes.length - 1))
    throw new CadOperationError('corner-node');
  const previous = contour.nodes[(ni + contour.nodes.length - 1) % contour.nodes.length], next = contour.nodes[(ni + 1) % contour.nodes.length];
  if (previous.outX || previous.outY || p.inX || p.inY || p.outX || p.outY || next.inX || next.inY)
    throw new CadOperationError('corner-neighbours');
  const before = Math.hypot(previous.x - p.x, previous.y - p.y), after = Math.hypot(next.x - p.x, next.y - p.y);
  if (before < 1e-8 || after < 1e-8) throw new CadOperationError('corner-node');
  const u = { x: (previous.x - p.x) / before, y: (previous.y - p.y) / before };
  const v = { x: (next.x - p.x) / after, y: (next.y - p.y) / after };
  const dot = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y)), turn = -u.x * v.y + u.y * v.x;
  if (Math.abs(turn) < 1e-8) throw new CadOperationError('corner-node');
  const angle = Math.acos(dot), cut = kind === 'chamfer' ? amount : amount / Math.tan(angle / 2);
  if (!Number.isFinite(cut) || cut < 1e-8 || cut >= Math.min(before, after) - 1e-8) throw new CadOperationError('corner-size');
  const a = nodeAt({ x: p.x + u.x * cut, y: p.y + u.y * cut }), b = nodeAt({ x: p.x + v.x * cut, y: p.y + v.y * cut });
  const region = [{ x: p.x, y: p.y }, { x: a.x, y: a.y }, { x: b.x, y: b.y }];
  requireClearCorner(contours, ci, ni, region, Math.min(tolerance / 5, cut / 1000));
  let replacement = [a, b];
  if (kind === 'fillet') {
    const sign = Math.sign(turn), cx = u.x * cut + u.y * sign * amount, cy = u.y * cut - u.x * sign * amount;
    const sweep = Math.atan2(turn, -dot), start = Math.atan2(u.y * cut - cy, u.x * cut - cx);
    let count = Math.ceil(Math.abs(sweep) / (Math.PI / 2));
    while (amount * radialError(sweep / count) > tolerance) {
      count *= 2;
      if (count > 1024) throw new CadOperationError('limit');
    }
    replacement = arcContour(cx, cy, amount, amount, start, sweep, Math.abs(sweep) / count).nodes
      .map(node => ({ ...node, x: node.x + p.x, y: node.y + p.y }));
    // Anchor tangent points exactly on the requested straight edges.
    Object.assign(replacement[0], { x: a.x, y: a.y });
    Object.assign(replacement.at(-1)!, { x: b.x, y: b.y });
  }
  const result = structuredClone(contours);
  result[ci].nodes.splice(ni, 1, ...replacement);
  if (!validContours(result)) throw new CadOperationError('limit');
  return { contours: result, region };
}

export function prepareNodeCorner(editor: Editor, settings: CadSettings, amountMm: number, kind: CadCornerKind): CadNodeCornerPlan {
  if (!validateCadSettings(settings)) throw new CadOperationError('geometry');
  const selected = getSelectedCadNode(editor);
  let shapes;
  try { shapes = cadSelectedShapes(editor); }
  catch (error) { if ((error as CadOperationError).code === 'unsupported') throw new CadOperationError('corner-source'); throw error; }
  if (!selected || shapes.length !== 1 || shapes[0].id !== selected.shapeId) throw new CadOperationError('corner-node');
  const shape = shapes[0] as CadBezierShape, factor = cadMmPerPixel(settings);
  if (editor.getBindingsInvolvingShape(shape.id).length) throw new CadOperationError('corner-source');
  const result = cornerAtNode(shape.props.contours, selected.contourIndex, selected.nodeIndex, amountMm / factor, kind, NODE_FILLET_TOLERANCE_MM / factor);
  const matrix = editor.getShapePageTransform(shape), page = (p: CadPoint) => matrix.applyToPoint(p);
  const contours = mapContours(result.contours, page);
  const originalContours = mapContours(shape.props.contours, page);
  const previewBounds = curveBounds([{ closed: true, nodes: result.region.map(p => nodeAt(page(p))) }]);
  return { ...makeCadPlan(editor, settings, contours, { name: kind, sourceIds: [shape.id],
    fillRule: shape.props.fillRule, warnings: kind === 'fillet' ? ['node-corner-approximation'] : [] }),
    nodeEdit: { ...selected, localContours: result.contours }, originalContours, previewBounds };
}

/** In-place mutation retains parent, object identity, opacity, paint and order.
 * Both the document revision and the transient node selection fence the review. */
export function applyNodeCorner(editor: Editor, plan: CadNodeCornerPlan): boolean {
  try {
    const edit = plan.nodeEdit;
    if (!edit || !validContours(edit.localContours) || !validContours(plan.contours)) return false;
    assertCadEditable(editor, [edit.shapeId]);
    editor.complete(); editor.setCurrentTool('select');
    const selected = getSelectedCadNode(editor), shapes = cadSelectedShapes(editor);
    if (plan.revision !== cadRevision(editor) || !selected || selected.shapeId !== edit.shapeId ||
        selected.contourIndex !== edit.contourIndex || selected.nodeIndex !== edit.nodeIndex ||
        shapes.length !== 1 || shapes[0].id !== edit.shapeId || editor.getBindingsInvolvingShape(shapes[0].id).length) return false;
    if (editor.store) {
      const currentSize = JSON.stringify(editor.store.getStoreSnapshot()).length;
      const oldSize = JSON.stringify((shapes[0] as CadBezierShape).props.contours).length;
      if (currentSize - oldSize + JSON.stringify(edit.localContours).length > 1_900_000) return false;
    }
    const success = drawingTransaction(editor, () => {
      editor.updateShapes([{ id: shapes[0].id, type: 'cad-bezier', props: { contours: edit.localContours } }]);
    });
    if (success) { selectCadNode(editor, edit.contourIndex, edit.nodeIndex); setCadNodeEditing(editor, true); }
    return success;
  } catch { return false; }
}
