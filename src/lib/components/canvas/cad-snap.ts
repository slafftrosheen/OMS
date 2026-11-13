import { atom, type Editor, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { validCadPoint, type CadPoint } from './cad-settings';
import { readCadSnapSettings } from './cad-snap-settings';
import { contourSegments, cubicAt, splitCubic, type CadContour } from './cad-curves';
import { cubicLength } from './cad-measurements';
import { ellipseTangentPoints, perpendicularSegmentPoint } from './cad-construction-snaps';
import { MAX_SNAP_INTERSECTION_SOURCES, snapIntersections, type SnapIntersectionSource } from './cad-intersections';
export { lineSnapIntersection } from './cad-intersections';

export type CadSnapKind = 'endpoints' | 'midpoints' | 'centers' | 'quadrants' | 'intersections' | 'perpendicular' | 'tangent' | 'nearest' | 'grid';
export interface CadSnapResult { point: CadPoint; kind: CadSnapKind }
const indicators = new WeakMap<Editor, ReturnType<typeof atom<CadSnapResult | null>>>();
export function cadSnapIndicator(editor: Editor) {
  let value = indicators.get(editor);
  if (!value) { value = atom<CadSnapResult | null>('CAD snap target', null); indicators.set(editor, value); }
  return value;
}
export function clearCadSnap(editor: Editor) {
  cadSnapIndicator(editor).set(null);
  // Never remove a native move/resize guide that replaced our point marker.
  if (editor.snaps?.getIndicators().some(value => value.id === 'oms-cad-snap')) editor.snaps.clearIndicators();
}
const distance = (a: CadPoint, b: CadPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a: CadPoint, b: CadPoint): CadPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const subtract = (a: CadPoint, b: CadPoint) => ({ x: a.x - b.x, y: a.y - b.y });
function nearby(point: CadPoint, points: CadPoint[], tolerance: number) {
  return point.x >= Math.min(...points.map(p => p.x)) - tolerance && point.x <= Math.max(...points.map(p => p.x)) + tolerance
    && point.y >= Math.min(...points.map(p => p.y)) - tolerance && point.y <= Math.max(...points.map(p => p.y)) + tolerance;
}
export function nearestLinePoint(point: CadPoint, a: CadPoint, b: CadPoint): CadPoint {
  const d = subtract(b, a), size = d.x * d.x + d.y * d.y;
  const t = size ? Math.max(0, Math.min(1, ((point.x - a.x) * d.x + (point.y - a.y) * d.y) / size)) : 0;
  return { x: a.x + d.x * t, y: a.y + d.y * t };
}
/** A point on the original cubic, with bounded search. Flattened drawing
 * vertices are never presented as endpoints or manufactured intersections. */
export function nearestCubicPoint(point: CadPoint, points: CadPoint[]): CadPoint {
  let best = points[0], bestDistance = distance(point, best), bestT = 0;
  for (let i = 1; i <= 48; i++) {
    const p = cubicAt(points, i / 48), delta = distance(point, p);
    if (delta < bestDistance) { best = p; bestDistance = delta; bestT = i / 48; }
  }
  let lo = Math.max(0, bestT - 1 / 48), hi = Math.min(1, bestT + 1 / 48);
  for (let i = 0; i < 40; i++) {
    const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
    if (distance(point, cubicAt(points, a)) < distance(point, cubicAt(points, b))) hi = b; else lo = a;
  }
  const refined = cubicAt(points, (lo + hi) / 2);
  return distance(point, refined) < bestDistance ? refined : best;
}
function cubicMidpoint(points: CadPoint[]): CadPoint {
  const budget = { remaining: 20000 }, tolerance = Math.max(0.001, distance(points[0], points[3]) * 1e-6);
  let remaining = cubicLength(points, tolerance, budget) / 2, current = points;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2, [a, b] = splitCubic(current), left = cubicLength(a, tolerance, budget);
    if (left < remaining) { remaining -= left; lo = t; current = b; }
    else { hi = t; current = a; }
  }
  return cubicAt(points, (lo + hi) / 2);
}
const midpoints = new WeakMap<object, Map<number, CadPoint>>();

/** Geometric snaps are shared by every CAD drawing tool. Discrete targets win
 * over nearest-edge and grid fallback; each category remains independently off. */
export function findCadSnap(editor: Editor, point: CadPoint, exclude: TLShapeId | null, anchor?: CadPoint | null): CadSnapResult | null {
  if (!validCadPoint(point) || editor.user.getIsSnapMode() === !!editor.inputs.ctrlKey) return null;
  const settings = readCadSnapSettings(editor), tolerance = settings.tolerance / editor.getZoomLevel();
  const constructionAnchor = anchor && validCadPoint(anchor) ? anchor : null;
  if (!Number.isFinite(tolerance) || tolerance <= 0) return null;
  let best: CadSnapResult | null = null, bestDistance = tolerance;
  const near: CadPoint[] = [], intersections: SnapIntersectionSource[] = [];
  const offer = (candidate: CadPoint, kind: CadSnapKind) => {
    if (!validCadPoint(candidate)) return;
    const delta = distance(point, candidate);
    if (delta <= bestDistance) { best = { point: { x: candidate.x, y: candidate.y }, kind }; bestDistance = delta; }
  };
  for (const shape of editor.getCurrentPageShapesSorted()) {
    if (shape.id === exclude || shape.opacity === 0 || ['group', 'order-details', 'order-address', 'profile-7st', 'cad-dimension'].includes(shape.type)) continue;
    // Clipped artwork has a different visible boundary. Do not target hidden nodes.
    if (editor.getShapeMask?.(shape.id) || (shape.meta.omsVectorPaint as any)?.clips?.length) continue;
    const p = shape.props as Record<string, any>;
    const analytic = shape.type === 'cad-ellipse' || shape.type === 'cad-arc' || shape.type === 'geo' && p.geo === 'ellipse';
    const bounds = editor.getShapePageBounds(shape);
    // Native page bounds use sampled vertices and can undershoot a rotated
    // ellipse. Its exact analytic envelope is checked below instead.
    if (!analytic && bounds && !nearby(point, [{ x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.maxY }], tolerance)) continue;
    const matrix = editor.getShapePageTransform(shape);
    const world = (q: CadPoint) => matrix.applyToPoint(q);
    const offerLocal = (q: CadPoint, kind: CadSnapKind) => offer(world(q), kind);
    const segment = (a: CadPoint, b: CadPoint) => {
      const aa = world(a), bb = world(b);
      if (!nearby(point, [aa, bb], tolerance)) return;
      if (settings.midpoints) offer(middle(aa, bb), 'midpoints');
      if (settings.perpendicular && constructionAnchor) {
        const foot = perpendicularSegmentPoint(constructionAnchor, aa, bb);
        if (foot) offer(foot, 'perpendicular');
      }
      if (settings.intersections && intersections.length < MAX_SNAP_INTERSECTION_SOURCES) intersections.push({ kind: 'line', a: aa, b: bb });
      if (settings.nearest) near.push(nearestLinePoint(point, aa, bb));
    };
    const path = (points: CadPoint[], closed: boolean) => {
      if (settings.endpoints) points.forEach(q => offerLocal(q, 'endpoints'));
      for (let i = 0; i < points.length - (closed ? 0 : 1); i++) segment(points[i], points[(i + 1) % points.length]);
    };
    if (shape.type === 'cad-bezier') {
      let index = 0, cache = midpoints.get(shape.props);
      if (!cache) { cache = new Map(); midpoints.set(shape.props, cache); }
      for (const contour of p.contours as CadContour[]) {
        if (settings.endpoints) contour.nodes.forEach(q => offerLocal(q, 'endpoints'));
        for (const local of contourSegments(contour)) {
          const key = index++, points = local.map(world);
          if (!nearby(point, points, tolerance)) continue;
          if (distance(local[0], local[1]) < 1e-9 && distance(local[2], local[3]) < 1e-9) { segment(local[0], local[3]); continue; }
          if (settings.midpoints) {
            try { if (!cache.has(key)) cache.set(key, cubicMidpoint(local)); offerLocal(cache.get(key)!, 'midpoints'); } catch { /* Bounded integration refuses pathological curves. */ }
          }
          if (settings.nearest) near.push(nearestCubicPoint(point, points));
        }
      }
    } else if (shape.type === 'cad-path') path(p.points, p.closed);
    else if (shape.type === 'line' && p.spline === 'line') path(Object.values(p.points).sort((a: any, b: any) => a.index.localeCompare(b.index)) as CadPoint[], false);
    else if (analytic) {
      const native = shape.type === 'geo', arc = shape.type === 'cad-arc';
      const width = native ? Math.max(1, p.w) : p.w, height = native ? Math.max(1, p.h + (p.growY ?? 0)) : p.h;
      const cx = arc ? 0 : width / 2, cy = arc ? 0 : height / 2;
      const rx = arc ? p.radius : width / 2, ry = arc ? p.radius : height / 2;
      const start = arc ? p.startAngle : 0, end = arc ? p.endAngle : 360;
      const at = (angle: number) => ({ x: cx + rx * Math.cos(angle * Math.PI / 180), y: cy - ry * Math.sin(angle * Math.PI / 180) });
      const center = world({ x: cx, y: cy }), rotation = matrix.rotation();
      const c = Math.cos(rotation), s = Math.sin(rotation), w = Math.hypot(rx * c, ry * s), h = Math.hypot(rx * s, ry * c);
      if (!nearby(point, [{ x: center.x - w, y: center.y - h }, { x: center.x + w, y: center.y + h }], tolerance)) continue;
      if (settings.intersections && intersections.length < MAX_SNAP_INTERSECTION_SOURCES) {
        intersections.push({ kind: 'ellipse', ellipse: { center, rx, ry, rotation, start, end } });
      }
      if (settings.centers) offerLocal({ x: cx, y: cy }, 'centers');
      if (settings.endpoints && arc) { offerLocal(at(start), 'endpoints'); offerLocal(at(end), 'endpoints'); }
      if (settings.midpoints && arc) offerLocal(at((start + end) / 2), 'midpoints');
      if (settings.quadrants) for (let angle = Math.ceil(start / 90) * 90; angle <= end; angle += 90) offerLocal(at(angle), 'quadrants');
      if (settings.tangent && constructionAnchor) {
        const localAnchor = matrix.clone().invert().applyToPoint(constructionAnchor);
        for (const tangent of ellipseTangentPoints(localAnchor, { x: cx, y: cy }, rx, ry, start, end)) offerLocal(tangent, 'tangent');
      }
      if (settings.nearest) {
        let nearest = world(at(start)), value = start;
        for (let i = 1; i <= 48; i++) { const angle = start + (end - start) * i / 48, q = world(at(angle)); if (distance(point, q) < distance(point, nearest)) { nearest = q; value = angle; } }
        let lo = Math.max(start, value - (end - start) / 48), hi = Math.min(end, value + (end - start) / 48);
        for (let i = 0; i < 40; i++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (distance(point, world(at(a))) < distance(point, world(at(b)))) hi = b; else lo = a; }
        const q = world(at((lo + hi) / 2)); near.push(distance(point, q) < distance(point, nearest) ? q : nearest);
      }
    } else if (shape.type === 'geo' && ['rectangle', 'triangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star'].includes(p.geo)) {
      const geometry = editor.getShapeGeometry(shape) as any;
      path((geometry.children?.[0] ?? geometry).vertices, true);
      if (settings.centers) offerLocal({ x: p.w / 2, y: p.h / 2 }, 'centers');
    } else if (settings.centers && ['image', 'text'].includes(shape.type)) {
      const box = editor.getShapeGeometry(shape).bounds; offerLocal({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, 'centers');
    }
  }
  if (settings.intersections) for (let i = 0; i < intersections.length; i++) for (let j = i + 1; j < intersections.length; j++) {
    for (const intersection of snapIntersections(intersections[i], intersections[j])) offer(intersection, 'intersections');
  }
  if (best) return best;
  if (settings.nearest) near.forEach(q => offer(q, 'nearest'));
  if (best) return best;
  if (settings.grid) offer({ x: Math.round(point.x / settings.gridSpacing) * settings.gridSpacing, y: Math.round(point.y / settings.gridSpacing) * settings.gridSpacing }, 'grid');
  return best;
}

export function snapCadPoint(editor: Editor, point: CadPoint, exclude: TLShapeId | null, anchor?: CadPoint | null): CadPoint {
  const result = findCadSnap(editor, point, exclude, anchor);
  if (!result) { clearCadSnap(editor); return { x: point.x, y: point.y }; }
  cadSnapIndicator(editor).set(result);
  editor.snaps?.setIndicators([{ id: 'oms-cad-snap', type: 'points', points: [result.point] }]);
  return result.point;
}

/** Node editing passes local handle positions; targets live in page space. */
export function snapCadHandle(editor: Editor, shape: TLShape, point: CadPoint): CadPoint {
  const matrix = editor.getShapePageTransform(shape);
  return matrix.clone().invert().applyToPoint(snapCadPoint(editor, matrix.applyToPoint(point), shape.id));
}
