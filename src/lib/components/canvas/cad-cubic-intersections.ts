import { cubicAt, splitCubic } from './cad-curves';
import { bernsteinRoots } from './cad-bernstein-roots';
import { validCadPoint, type CadPoint } from './cad-settings';

export const MAX_CUBIC_CUBIC_SNAP_PAIRS = 64;
export const MAX_CUBIC_CUBIC_SNAP_STEPS = 8192;
export interface CubicIntersectionBudget { remaining: number }
const ROUNDING = 64 * Number.EPSILON;
const distance = (a: CadPoint, b: CadPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a: CadPoint, b: CadPoint) => a.x * b.y - a.y * b.x;
const subtract = (a: CadPoint, b: CadPoint) => ({ x: a.x - b.x, y: a.y - b.y });

function part(points: CadPoint[], lo: number, hi: number): CadPoint[] {
  if (lo > hi) return part(points, hi, lo).reverse();
  const left = hi < 1 ? splitCubic(points, hi)[0] : points;
  return lo > 0 ? splitCubic(left, lo / hi)[1] : left;
}
function parametersAt(points: CadPoint[], point: CadPoint, epsilon: number): number[] {
  const spread = (axis: 'x' | 'y') => Math.max(...points.map(p => p[axis])) - Math.min(...points.map(p => p[axis]));
  const axis = spread('x') >= spread('y') ? 'x' : 'y';
  return bernsteinRoots(points.map(p => p[axis] - point[axis]), epsilon).filter(t => distance(cubicAt(points, t), point) <= epsilon * 4);
}
/** Two shared endpoint locations delimit any ordinary affine reparameterized
 * common span, including a reversed or partially overlapping split cubic. */
function overlaps(a: CadPoint[], b: CadPoint[], epsilon: number): boolean {
  const matches: Array<{ t: number; u: number }> = [];
  for (const t of [0, 1]) for (const u of parametersAt(b, a[t * 3], epsilon)) matches.push({ t, u });
  for (const u of [0, 1]) for (const t of parametersAt(a, b[u * 3], epsilon)) matches.push({ t, u });
  for (let i = 0; i < matches.length; i++) for (let j = i + 1; j < matches.length; j++) {
    const p = matches[i], q = matches[j];
    if (Math.abs(p.t - q.t) < 1e-8 || Math.abs(p.u - q.u) < 1e-8) continue;
    const aa = part(a, p.t, q.t), bb = part(b, p.u, q.u);
    if (aa.every((point, k) => distance(point, bb[k]) <= epsilon * 8)) return true;
  }
  return false;
}
function hullsOverlap(a: CadPoint[], b: CadPoint[], epsilon: number): boolean {
  for (const axis of ['x', 'y'] as const) {
    if (Math.min(...a.map(p => p[axis])) > Math.max(...b.map(p => p[axis])) + epsilon
      || Math.min(...b.map(p => p[axis])) > Math.max(...a.map(p => p[axis])) + epsilon) return false;
  }
  // A separating projection of the control hulls also separates the curves.
  // Include all control-point chords; no tessellated segments are intersected.
  for (const points of [a, b]) for (let i = 0; i < 3; i++) for (let j = i + 1; j < 4; j++) {
    const delta = subtract(points[j], points[i]), length = Math.hypot(delta.x, delta.y);
    if (length <= ROUNDING) continue;
    const project = (p: CadPoint) => cross(subtract(p, points[i]), delta) / length;
    const aa = a.map(project), bb = b.map(project);
    if (Math.min(...aa) > Math.max(...bb) + epsilon || Math.min(...bb) > Math.max(...aa) + epsilon) return false;
  }
  return true;
}
function derivatives(p: CadPoint[], t: number) {
  const d = p.slice(1).map((q, i) => ({ x: 3 * (q.x - p[i].x), y: 3 * (q.y - p[i].y) }));
  const first = { x: (1 - t) ** 2 * d[0].x + 2 * t * (1 - t) * d[1].x + t * t * d[2].x,
    y: (1 - t) ** 2 * d[0].y + 2 * t * (1 - t) * d[1].y + t * t * d[2].y };
  const second = { x: 2 * ((1 - t) * (d[1].x - d[0].x) + t * (d[2].x - d[1].x)),
    y: 2 * ((1 - t) * (d[1].y - d[0].y) + t * (d[2].y - d[1].y)) };
  return { first, second };
}
function refine(a: CadPoint[], b: CadPoint[], startT: number, startU: number, contact: boolean) {
  let t = startT, u = startU;
  for (let step = 0; step < 32; step++) {
    const aa = cubicAt(a, t), bb = cubicAt(b, u), da = derivatives(a, t), db = derivatives(b, u);
    let f = aa.x - bb.x, g = aa.y - bb.y, at = da.first.x, au = -db.first.x, bt = da.first.y, bu = -db.first.y;
    if (contact) {
      const axis = Math.abs(da.first.x) + Math.abs(db.first.x) >= Math.abs(da.first.y) + Math.abs(db.first.y) ? 'x' : 'y';
      f = aa[axis] - bb[axis]; g = cross(da.first, db.first);
      at = da.first[axis]; au = -db.first[axis]; bt = cross(da.second, db.first); bu = cross(da.first, db.second);
    }
    const determinant = at * bu - au * bt;
    if (Math.abs(determinant) <= Number.EPSILON * Math.max(Math.abs(at * bu), Math.abs(au * bt), Number.MIN_VALUE)) break;
    const dt = (f * bu - au * g) / determinant, du = (at * g - f * bt) / determinant;
    const nextT = t - dt, nextU = u - du;
    if (!Number.isFinite(nextT + nextU) || nextT < -ROUNDING || nextT > 1 + ROUNDING || nextU < -ROUNDING || nextU > 1 + ROUNDING) break;
    t = Math.max(0, Math.min(1, nextT)); u = Math.max(0, Math.min(1, nextU));
    if (Math.max(Math.abs(dt), Math.abs(du)) <= ROUNDING) break;
  }
  return { t, u, point: cubicAt(a, t), residual: distance(cubicAt(a, t), cubicAt(b, u)) };
}

/** Isolated intersections of two original cubics. Subdivision and control-hull
 * separation isolate parameter pairs, then Newton refinement verifies BOTH
 * original curves. Contact refinement uses a common coordinate and parallel
 * tangents, avoiding position drift from a nearly singular crossing Jacobian.
 * Coincident spans and exhausted/ill-conditioned pairs supply no targets. */
export function cubicCubicIntersections(first: CadPoint[], second: CadPoint[], budget: CubicIntersectionBudget = { remaining: MAX_CUBIC_CUBIC_SNAP_STEPS }): CadPoint[] {
  if (first.length !== 4 || second.length !== 4 || ![...first, ...second].every(validCadPoint)) return [];
  const all = [...first, ...second], minX = Math.min(...all.map(p => p.x)), minY = Math.min(...all.map(p => p.y));
  const scale = Math.max(Math.max(...all.map(p => p.x)) - minX, Math.max(...all.map(p => p.y)) - minY);
  if (scale === 0 || !Number.isFinite(scale)) return [];
  const epsilon = Math.max(1e-12, ROUNDING * Math.max(scale, ...all.flatMap(p => [Math.abs(p.x), Math.abs(p.y)])) / scale);
  if (epsilon > 1e-6) return [];
  const local = (p: CadPoint) => ({ x: (p.x - minX) / scale, y: (p.y - minY) / scale });
  const a = first.map(local), b = second.map(local);
  if ([a, b].some(p => p.every(q => distance(q, p[0]) <= epsilon))) return [];
  if (overlaps(a, b, epsilon)) return [];
  const pending = [{ a, b, t0: 0, t1: 1, u0: 0, u1: 1 }], candidates: Array<{ t: number; u: number; point: CadPoint }> = [];
  // Preserve finite endpoints even when the crossing Jacobian is singular,
  // as for two adjacent pieces of the same original curve.
  const add = (t: number, u: number) => {
    const point = cubicAt(a, t);
    if (!candidates.some(q => distance(q.point, point) <= epsilon * 16)) candidates.push({ t, u, point });
  };
  for (const t of [0, 1]) for (const u of parametersAt(b, a[t * 3], epsilon)) add(t, u);
  for (const u of [0, 1]) for (const t of parametersAt(a, b[u * 3], epsilon)) add(t, u);
  // Below this parameter width, a quadratic contact's separation is already
  // at rounding tolerance. Further subdivision floods the queue with boxes
  // representing that same contact; refine against the original curves instead.
  const parameterTolerance = Math.max(1e-8, Math.sqrt(epsilon));
  let remaining = 4096;
  while (pending.length) {
    if (--remaining < 0 || --budget.remaining < 0) return [];
    const span = pending.pop()!;
    if (!hullsOverlap(span.a, span.b, epsilon)) continue;
    if (Math.max(span.t1 - span.t0, span.u1 - span.u0) <= parameterTolerance) {
      const t = (span.t0 + span.t1) / 2, u = (span.u0 + span.u1) / 2;
      let root = refine(a, b, t, u, false);
      const da = derivatives(a, root.t).first, db = derivatives(b, root.u).first;
      if (Math.abs(cross(da, db)) <= 1e-4 * Math.hypot(da.x, da.y) * Math.hypot(db.x, db.y)) {
        const contact = refine(a, b, t, u, true);
        if (contact.residual <= epsilon * 4) root = contact;
      }
      if (root.residual <= epsilon * 4 && !candidates.some(q => distance(q.point, root.point) <= epsilon * 16)) candidates.push(root);
      if (candidates.length > 9) return [];
      continue;
    }
    if (span.t1 - span.t0 >= span.u1 - span.u0) {
      const [left, right] = splitCubic(span.a), mid = (span.t0 + span.t1) / 2;
      pending.push({ ...span, a: right, t0: mid }, { ...span, a: left, t1: mid });
    } else {
      const [left, right] = splitCubic(span.b), mid = (span.u0 + span.u1) / 2;
      pending.push({ ...span, b: right, u0: mid }, { ...span, b: left, u1: mid });
    }
  }
  return candidates.sort((p, q) => p.t - q.t).map(root => cubicAt(first, root.t)).filter(validCadPoint);
}
