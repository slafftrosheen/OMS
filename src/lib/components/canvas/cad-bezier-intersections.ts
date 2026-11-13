import { cubicAt } from './cad-curves';
import { validCadPoint, type CadPoint } from './cad-settings';

const ROUNDING = 64 * Number.EPSILON;

/** Real derivative roots partition a cubic into at most three monotone spans. */
function criticalParameters(d: number[]): number[] {
  const a = 3 * (-d[0] + 3 * d[1] - 3 * d[2] + d[3]);
  const b = 6 * (d[0] - 2 * d[1] + d[2]), c = 3 * (d[1] - d[0]);
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
  if (scale === 0) return [];
  if (Math.abs(a) <= ROUNDING * scale) return Math.abs(b) <= ROUNDING * scale ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  // The second root uses the product of roots to avoid cancellation.
  const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant));
  return q === 0 ? [-b / (2 * a)] : [q / a, c / q];
}

function scalarAt(d: number[], t: number): number {
  const mix = (a: number, b: number) => a + (b - a) * t;
  return mix(mix(mix(d[0], d[1]), mix(d[1], d[2])), mix(mix(d[1], d[2]), mix(d[2], d[3])));
}

/** Finite line / original cubic intersections, including tangent contacts.
 * Signed distances are a scalar Bernstein cubic. Isolating its roots avoids
 * tessellation-dependent crossings and closed-form cubic cancellation. Work
 * is bounded by two derivative roots and 64 bisections per monotone span.
 * Collinear overlaps have no isolated intersection and produce no targets. */
export function lineCubicIntersections(a: CadPoint, b: CadPoint, points: CadPoint[]): CadPoint[] {
  if (points.length !== 4 || ![a, b, ...points].every(validCadPoint)) return [];
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  if (length === 0 || !Number.isFinite(length)) return [];
  const ux = dx / length, uy = dy / length;
  const signedDistance = (p: CadPoint) => (p.x - a.x) * uy - (p.y - a.y) * ux;
  const raw = points.map(signedDistance), scale = Math.max(...raw.map(Math.abs));
  // Translated tiny artwork also carries world-coordinate rounding error.
  const extent = Math.max(length, ...[a, b, ...points].flatMap(p => [Math.abs(p.x), Math.abs(p.y), Math.hypot(p.x - a.x, p.y - a.y)]));
  const epsilon = ROUNDING * extent;
  if (scale <= epsilon) return [];
  const d = raw.map(value => value / scale);
  const cuts = [0, ...criticalParameters(d).filter(t => t > 0 && t < 1), 1].sort((a, b) => a - b);
  const zero = Math.max(ROUNDING, epsilon / scale);
  const roots: number[] = [];
  const add = (t: number) => { if (!roots.some(root => Math.abs(root - t) <= ROUNDING)) roots.push(t); };
  // Checking the critical points explicitly retains even-multiplicity roots.
  for (const t of cuts) if (Math.abs(scalarAt(d, t)) <= zero) add(t);
  for (let i = 1; i < cuts.length; i++) {
    let lo = cuts[i - 1], hi = cuts[i], left = scalarAt(d, lo);
    const right = scalarAt(d, hi);
    if (Math.abs(left) <= zero || Math.abs(right) <= zero || (left < 0) === (right < 0)) continue;
    for (let step = 0; step < 64; step++) {
      const mid = (lo + hi) / 2, value = scalarAt(d, mid);
      if (value === 0 || mid === lo || mid === hi) { lo = hi = mid; break; }
      if ((value < 0) === (left < 0)) { lo = mid; left = value; } else hi = mid;
    }
    add((lo + hi) / 2);
  }
  const result: CadPoint[] = [];
  for (const t of roots.sort((a, b) => a - b)) {
    const point = cubicAt(points, t), along = (point.x - a.x) * ux + (point.y - a.y) * uy;
    if (along < -epsilon || along > length + epsilon || Math.abs(signedDistance(point)) > epsilon * 2) continue;
    if (validCadPoint(point) && !result.some(p => Math.hypot(p.x - point.x, p.y - point.y) <= epsilon)) result.push(point);
  }
  return result;
}
