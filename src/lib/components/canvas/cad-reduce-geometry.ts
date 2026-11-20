import { cubicPoints, mix, splitCubic, type CadContour } from './cad-curves';
import { CAD_MAX_COORDINATE } from './cad-limits';
import type { CadPoint } from './cad-settings';

type Cubic = CadPoint[];
type Span = {
  contour: number;
  start: number;
  end: number;
  points: Cubic;
  bounds: Bounds;
  error: number;
  merged: boolean;
};
type Fit = { points: Cubic; error: number; axis: CadPoint; pad: number; hull: Cubic; exact: boolean };
type Bounds = { left: number; right: number; top: number; bottom: number };

const MIN_TANGENT_COS = Math.cos(15 * Math.PI / 180);
const MAX_CLEARANCE_CHECKS = 8_000_000;
const sub = (a: CadPoint, b: CadPoint) => ({ x: a.x - b.x, y: a.y - b.y });
const length = (v: CadPoint) => Math.hypot(v.x, v.y);
const dot = (a: CadPoint, b: CadPoint) => a.x * b.x + a.y * b.y;
const straight = ([a, b, c, d]: Cubic) => a.x === b.x && a.y === b.y && c.x === d.x && c.y === d.y;
const linear = (points: Cubic) => {
  const a = points[0], d = points[3];
  return straight(points) ? [a, mix(a, d, 1 / 3), mix(a, d, 2 / 3), d] : points;
};
const boundsOf = (points: Cubic): Bounds => ({
  left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
  top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y))
});
const separate = (a: Bounds, b: Bounds, pad: number) =>
  a.right + pad < b.left || b.right + pad < a.left || a.bottom + pad < b.top || b.bottom + pad < a.top;

function monotone(points: Cubic, axis: CadPoint) {
  const [a, b, c, d] = points.map(p => dot(sub(p, points[0]), axis));
  return a <= b && b <= c && c <= d && a < d;
}

/** The difference is also a cubic. Its Bézier control hull bounds the distance
 * between corresponding points in both directions, including between samples. */
function differenceBound(control: Cubic, tolerance: number, depth = 0): number {
  const upper = Math.max(...control.map(length));
  if (upper <= tolerance) return upper;
  if (depth === 7 || length(control[0]) > tolerance || length(control[3]) > tolerance) return Infinity;
  const [left, right] = splitCubic(control, .5);
  const a = differenceBound(left, tolerance, depth + 1);
  return Number.isFinite(a) ? Math.max(a, differenceBound(right, tolerance, depth + 1)) : Infinity;
}

function fitPair(first: Span, second: Span, tolerance: number): Fit | null {
  const left = linear(first.points), right = linear(second.points);
  const a = left[0], join = left[3], d = right[3], chord = sub(d, a), distance = length(chord);
  if (distance < 1e-9) return null;
  const axis = { x: chord.x / distance, y: chord.y / distance };
  if (!monotone(left, axis) || !monotone(right, axis)) return null;
  // With collapsed controls the next control point gives the endpoint tangent.
  const incoming = sub(join, left.slice(0, 3).reverse().find(p => p.x !== join.x || p.y !== join.y)!);
  const outgoing = sub(right.slice(1).find(p => p.x !== join.x || p.y !== join.y)!, join);
  if (dot(incoming, outgoing) < MIN_TANGENT_COS * length(incoming) * length(outgoing)) return null;

  const previous = Math.max(first.error, second.error);
  const pad = 128 * Number.EPSILON * Math.max(1, ...[...left, ...right].flatMap(p => [Math.abs(p.x), Math.abs(p.y)]));
  const budget = tolerance - previous - pad;
  if (budget <= 0) return null;
  const linearPair = straight(first.points) && straight(second.points);
  if (linearPair && (a.x === join.x && join.x === d.x || a.y === join.y && join.y === d.y)) {
    const points = [a, a, d, d];
    return { points, error: previous, axis, pad, hull: points, exact: true };
  }
  const compare = ([start, outgoing, incoming, end]: Cubic, t: number) => {
    // Certify the actual controls reconstructed from stored relative handles.
    const points = [start, mix(start, outgoing, 1), mix(end, incoming, 1), end];
    const coordinates = [points[1], points[2], sub(points[1], start), sub(points[2], end)];
    if (coordinates.some(p => Math.abs(p.x) > CAD_MAX_COORDINATE || Math.abs(p.y) > CAD_MAX_COORDINATE)) return null;
    const curve = linear(points);
    if (t <= 0 || t >= 1 || !monotone(curve, axis)) return null;
    const [l, r] = splitCubic(curve, t);
    const leftError = differenceBound(l.map((p, i) => sub(p, left[i])), budget);
    if (!Number.isFinite(leftError)) return null;
    const error = Math.max(leftError, differenceBound(r.map((p, i) => sub(p, right[i])), budget));
    if (!Number.isFinite(error)) return null;
    const bound = previous + error + pad;
    return bound <= tolerance ? { points, error: bound, axis, pad, hull: [...left, ...right, ...points], exact: false } : null;
  };

  if (linearPair) {
    const line = compare([a, a, d, d], dot(sub(join, a), axis) / distance);
    if (line) return line;
  }
  const tangent = length(incoming) / (length(incoming) + length(outgoing));
  const chordRatio = length(sub(join, a)) / (length(sub(join, a)) + length(sub(d, join)));
  for (const t of new Set([tangent, chordRatio])) {
    if (t < 1e-6 || t > 1 - 1e-6) continue;
    // Invert the first and last de Casteljau interpolants. This recovers an
    // exact split cubic and preserves the direction of the surviving tangents.
    const result = compare([a, mix(a, left[1], 1 / t), mix(d, right[2], 1 / (1 - t)), d], t);
    if (result) return result;
  }
  return null;
}

function clearance(
  first: Span, second: Span, fit: Fit, active: Set<Span>,
  budget: { checks: number }
): boolean {
  const hull = boundsOf(fit.hull);
  const origin = first.points[0], end = second.points[3];
  const local = (p: CadPoint) => {
    const v = sub(p, origin), { x, y } = fit.axis;
    return { x: x * v.x + y * v.y, y: x * v.y - y * v.x };
  };
  const projectedHull = boundsOf(fit.hull.map(local));
  for (const other of active) {
    if (other === first || other === second) continue;
    if (++budget.checks > MAX_CLEARANCE_CHECKS) return false;
    if (separate(hull, other.bounds, fit.pad)) continue;
    if (other.contour === first.contour) {
      // An adjacent segment may share only the unmodified endpoint. The
      // monotone run stays strictly between the two endpoint planes inside.
      if (other.end === first.start && other.points.every(p => dot(sub(p, origin), fit.axis) <= 0)) continue;
      if (other.start === second.end && other.points.every(p => dot(sub(p, end), fit.axis) >= 0)) continue;
    }
    const disjoint = (points: Cubic) =>
      separate(hull, boundsOf(points), fit.pad) || separate(projectedHull, boundsOf(points.map(local)), fit.pad);
    if (separate(projectedHull, boundsOf(other.points.map(local)), fit.pad) ||
        splitCubic(other.points, .5).every(disjoint)) continue;
    return false;
  }
  return true;
}

/** Each merge stays inside a hull that is clear of unrelated curve boundaries.
 * A monotone path through that hull keeps counters and self-contacts stable.
 * Retain the closed seam and the two endpoints of every open contour. */
export function reduceCadGeometry(
  source: CadContour[], tolerance: number, eligible: (contour: number, node: number) => boolean
) {
  const active = new Set<Span>();
  const rings = source.map((contour, ci) => {
    const count = contour.nodes.length;
    return Array.from({ length: count - Number(!contour.closed) }, (_, start) => {
      const end = (start + 1) % count;
      const points = cubicPoints(contour.nodes[start], contour.nodes[end]);
      const span: Span = { contour: ci, start, end, points, bounds: boundsOf(points), error: 0, merged: false };
      active.add(span);
      return span;
    });
  });
  const budget = { checks: 0 };
  let removed = 0;
  for (const [ci, initial] of rings.entries()) {
    const minimum = source[ci].closed ? 3 : 1;
    let spans = initial;
    // Pair runs in passes to avoid repeatedly merging a long prefix with one
    // tiny span. The per-operation clearance budget caps dense compound paths.
    while (spans.length > minimum && budget.checks < MAX_CLEARANCE_CHECKS) {
      const next: Span[] = [];
      let available = spans.length - minimum;
      for (let i = 0; i < spans.length; i++) {
        const first = spans[i], second = spans[i + 1];
        const fit = second && available && eligible(ci, first.end) && budget.checks < MAX_CLEARANCE_CHECKS
          ? fitPair(first, second, tolerance) : null;
        if (!fit || !fit.exact && !clearance(first, second, fit, active, budget)) { next.push(first); continue; }
        const merged: Span = {
          contour: ci, start: first.start, end: second.end, points: fit.points,
          bounds: boundsOf(fit.points), error: fit.error, merged: true
        };
        active.delete(first); active.delete(second); active.add(merged);
        next.push(merged); i++; available--; removed++;
      }
      if (next.length === spans.length) break;
      spans = next;
    }
    rings[ci] = spans;
  }

  let error = 0;
  const indices: number[][] = [];
  const contours = rings.map((spans, ci) => {
    const contour = source[ci], nodes = structuredClone(contour.nodes);
    for (const span of spans) {
      error = Math.max(error, span.error);
      if (!span.merged) continue;
      const a = nodes[span.start], b = nodes[span.end];
      const out = sub(span.points[1], a), incoming = sub(span.points[2], b);
      if (a.mode === 'symmetric' && (a.outX !== out.x || a.outY !== out.y)) a.mode = 'smooth';
      if (b.mode === 'symmetric' && (b.inX !== incoming.x || b.inY !== incoming.y)) b.mode = 'smooth';
      a.outX = out.x; a.outY = out.y;
      b.inX = incoming.x; b.inY = incoming.y;
    }
    const survivors = spans.map(span => span.start);
    if (!contour.closed) survivors.push(nodes.length - 1);
    indices.push(survivors);
    return { closed: contour.closed, nodes: survivors.map(index => nodes[index]) };
  });
  return { contours, indices, removed, error, limited: budget.checks >= MAX_CLEARANCE_CHECKS };
}
