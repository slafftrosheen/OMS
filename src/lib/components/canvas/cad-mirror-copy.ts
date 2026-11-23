import type { Editor, TLLineShape, TLShape, TLShapeId } from '@tldraw/tldraw';
import { transformAppearance, type VectorMatrix } from './cad-appearance';
import { CAD_PLAN_GEOMETRY_LIMITS, curvePathData, mapContours, type CadContour } from './cad-curves';
import { convertedCurvePaint, shapeCadContours } from './cad-editing';
import { assertCadEditable, CadOperationError, makeCadPlan, type CadPlan } from './cad-plans';
import { cadMmPerPixel, readCadSettings, validCadPoint, type CadPoint } from './cad-settings';
import { sourceCurveResult } from './cad-source-result';
import type { CadBezierShape } from './shapes/CadBezierShape';
import type { CadPathShape } from './shapes/CadShapes';

export type MirrorCopyAxis = { guideId: TLShapeId } | { start: CadPoint; end: CadPoint };
export interface MirrorCopyPlan {
  drawing: CadPlan;
  start: CadPoint;
  end: CadPoint;
  outline: string;
}

export function mirrorReflection(start: CadPoint, end: CadPoint): (point: CadPoint) => CadPoint {
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!validCadPoint(start) || !validCadPoint(end) || length < 1e-7) throw new CadOperationError('mirrorAxis');
  const ux = dx / length, uy = dy / length;
  return ({ x, y }) => {
    const along = (x - start.x) * ux + (y - start.y) * uy;
    return { x: 2 * (start.x + along * ux) - x, y: 2 * (start.y + along * uy) - y };
  };
}

function straightSegment(shape: TLShape): readonly CadPoint[] | undefined {
  if (shape.type === 'cad-path') {
    const { closed, points } = (shape as CadPathShape).props;
    return !closed && points.length === 2 ? points : undefined;
  }
  if (shape.type === 'line') {
    const props = (shape as TLLineShape).props;
    if (props.spline !== 'line') return;
    const points = Object.values(props.points).sort((a, b) => a.index < b.index ? -1 : a.index > b.index ? 1 : 0);
    if (points.length === 2) return points;
  }
  if (shape.type === 'cad-bezier') {
    const contours = (shape as CadBezierShape).props.contours;
    if (contours.length !== 1) return;
    const [contour] = contours;
    const [first, last] = contour.nodes;
    if (!contour.closed && contour.nodes.length === 2 && !first.outX && !first.outY && !last.inX && !last.inY) return contour.nodes;
  }
}

export function isMirrorGuide(shape: TLShape): boolean {
  return !!straightSegment(shape);
}

function resolveAxis(editor: Editor, axis: MirrorCopyAxis, selected: TLShapeId[]): [CadPoint, CadPoint] {
  if (!('guideId' in axis)) return [axis.start, axis.end];
  const guide = editor.getShape(axis.guideId);
  const points = guide && selected.includes(guide.id) && straightSegment(guide);
  if (!guide || !points) throw new CadOperationError('mirrorGuide');
  const transform = editor.getShapePageTransform(guide);
  return [transform.applyToPoint(points[0]), transform.applyToPoint(points[1])];
}

function insideOnlyGroups(editor: Editor, shape: TLShape): boolean {
  let parent = shape.parentId;
  const visited = new Set<string>();
  while (parent !== editor.getCurrentPageId()) {
    if (visited.has(parent)) return false;
    visited.add(parent);
    const group = editor.getShape(parent as TLShapeId);
    if (group?.type !== 'group') return false;
    parent = group.parentId;
  }
  return true;
}

export function prepareMirrorCopy(editor: Editor, axis: MirrorCopyAxis): MirrorCopyPlan {
  const settings = readCadSettings(editor);
  if (!settings) throw new CadOperationError('mirrorDocument');
  const selected = [...editor.getSelectedShapeIds()];
  const [start, end] = resolveAxis(editor, axis, selected);
  const reflect = mirrorReflection(start, end);
  const ids = 'guideId' in axis ? selected.filter(id => id !== axis.guideId) : selected;
  if (!ids.length) throw new CadOperationError('mirrorSelection');
  if (ids.length > 200) throw new CadOperationError('mirrorLimit');
  try { assertCadEditable(editor, ids); } catch { throw new CadOperationError('mirrorProtected'); }

  const contours: CadContour[] = [];
  const tolerance = 0.005 / cadMmPerPixel(settings);
  let nodeCount = 0;
  const shapes = ids.map(id => {
    const source = editor.getShape(id);
    if (!source || source.type === 'group' || !insideOnlyGroups(editor, source) ||
        editor.getShapeMask(id) || editor.getBindingsInvolvingShape(id).length) throw new CadOperationError('mirrorProtected');
    const world = editor.getShapePageTransform(source);
    const origin = world.point(), reflectedOrigin = reflect(origin);
    const position = editor.getPointInParentSpace(source, reflectedOrigin);
    if (!validCadPoint(position)) throw new CadOperationError('mirrorBounds');
    const shift = { x: reflectedOrigin.x - origin.x, y: reflectedOrigin.y - origin.y };
    const toResult = (point: CadPoint) => editor.getPointInShapeSpace(source, { x: point.x - shift.x, y: point.y - shift.y });
    const local = (point: CadPoint) => toResult(reflect(world.applyToPoint(point)));
    const zero = local({ x: 0, y: 0 }), x = local({ x: 1, y: 0 }), y = local({ x: 0, y: 1 });
    const appearanceMatrix: VectorMatrix = [x.x - zero.x, x.y - zero.y, y.x - zero.x, y.y - zero.y, zero.x, zero.y];
    const original = shapeCadContours(editor, source, tolerance);
    nodeCount += original.reduce((total, contour) => total + contour.nodes.length, 0);
    if (nodeCount > CAD_PLAN_GEOMETRY_LIMITS.maxNodes ||
        contours.length + original.length > CAD_PLAN_GEOMETRY_LIMITS.maxContours) throw new CadOperationError('mirrorLimit');
    const reflected = mapContours(original, reflect);
    contours.push(...reflected);
    const paint = transformAppearance(convertedCurvePaint(editor, source), appearanceMatrix);
    const rule = source.type === 'cad-bezier' ? (source as CadBezierShape).props.fillRule ?? 'evenodd' : 'evenodd';
    return { ...sourceCurveResult(editor, source, mapContours(reflected, toResult), rule, paint, 'local'), x: position.x, y: position.y };
  });
  const drawing = makeCadPlan(editor, settings, contours, { sourceIds: ids, shapes, name: 'Mirrored curve' });
  return { drawing, start, end, outline: curvePathData(contours) };
}
