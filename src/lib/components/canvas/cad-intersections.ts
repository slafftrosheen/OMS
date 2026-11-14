import { validCadPoint, type CadPoint } from './cad-settings';
import { lineCubicIntersections } from './cad-bezier-intersections';
import { cubicAt, splitCubic } from './cad-curves';
import { bernsteinRoots } from './cad-bernstein-roots';

/** World-space analytic ellipse. Rotation follows the canvas (Y down); arc
 * angles follow CAD (Y up) in the ellipse's own axes. */
export interface SnapEllipse {
  center: CadPoint;
  rx: number;
  ry: number;
  rotation: number;
  start: number;
  end: number;
}
export type SnapIntersectionSource =
  | { kind: 'line'; a: CadPoint; b: CadPoint }
  | { kind: 'cubic'; points: CadPoint[] }
  | { kind: 'ellipse'; ellipse: SnapEllipse };
export const MAX_SNAP_INTERSECTION_SOURCES = 256;
export const MAX_CUBIC_ELLIPSE_SNAP_PAIRS = 128;
const ROUNDING = 64 * Number.EPSILON;
const cross = (a: CadPoint, b: CadPoint) => a.x * b.y - a.y * b.x;
const subtract = (a: CadPoint, b: CadPoint) => ({ x: a.x - b.x, y: a.y - b.y });

export function lineSnapIntersection(a: CadPoint, b: CadPoint, c: CadPoint, d: CadPoint): CadPoint | null {
  const r = subtract(b, a), s = subtract(d, c), denominator = cross(r, s);
  if (Math.abs(denominator) <= 1e-12 * Math.max(1, Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y))) return null;
  const offset = subtract(c, a), t = cross(offset, s) / denominator, u = cross(offset, r) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  const point = { x: a.x + r.x * t, y: a.y + r.y * t };
  return validCadPoint(point) ? point : null;
}

function validEllipse(e: SnapEllipse) {
  return validCadPoint(e.center) && [e.rx, e.ry, e.rotation, e.start, e.end].every(Number.isFinite)
    && e.rx > 0 && e.ry > 0 && e.end > e.start && e.end - e.start <= 360 + 1e-8;
}
function normalizedPoint(point: CadPoint, e: SnapEllipse): CadPoint {
  const dx = point.x - e.center.x, dy = point.y - e.center.y, c = Math.cos(e.rotation), s = Math.sin(e.rotation);
  return { x: (c * dx + s * dy) / e.rx, y: (-s * dx + c * dy) / e.ry };
}
function onArc(point: CadPoint, e: SnapEllipse) {
  const sweep = e.end - e.start;
  if (sweep >= 360 - 1e-8) return true;
  const local = normalizedPoint(point, e), angle = Math.atan2(-local.y, local.x) * 180 / Math.PI;
  const delta = ((angle - e.start) % 360 + 360) % 360;
  return delta <= sweep + 1e-8 || 360 - delta <= 1e-8;
}

/** Intersect the finite segment with the original ellipse, not a tessellation.
 * Closest approach on a normalized unit circle avoids subtracting large
 * quadratic discriminant terms for long lines crossing small circles. */
export function lineEllipseIntersections(a: CadPoint, b: CadPoint, e: SnapEllipse): CadPoint[] {
  if (![a, b].every(validCadPoint) || !validEllipse(e)) return [];
  const p = normalizedPoint(a, e), q = normalizedPoint(b, e), dx = q.x - p.x, dy = q.y - p.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length === 0) return [];
  const ux = dx / length, uy = dy / length, along = -(p.x * ux + p.y * uy);
  const offset = p.x * uy - p.y * ux, squared = 1 - offset * offset;
  if (!Number.isFinite(squared) || squared < -ROUNDING) return [];
  const half = Math.sqrt(Math.max(0, squared));
  const roots = half === 0 ? [along] : [along - half, along + half];
  const result: CadPoint[] = [];
  for (const root of roots) {
    const t = root / length;
    if (t < -ROUNDING || t > 1 + ROUNDING) continue;
    const clamped = Math.max(0, Math.min(1, t));
    const point = { x: a.x + (b.x - a.x) * clamped, y: a.y + (b.y - a.y) * clamped };
    if (validCadPoint(point) && onArc(point, e)) result.push(point);
  }
  return result;
}

/** Circle/circle intersections, filtered against BOTH visible arc sweeps.
 * Coincident circles have no isolated crossing. Noncircular ellipse pairs
 * deliberately return no targets instead of using polygon approximations. */
export function circleIntersections(a: SnapEllipse, b: SnapEllipse): CadPoint[] {
  if (!validEllipse(a) || !validEllipse(b) || a.rx !== a.ry || b.rx !== b.ry) return [];
  const dx = b.center.x - a.center.x, dy = b.center.y - a.center.y, d = Math.hypot(dx, dy);
  if (d === 0 || !Number.isFinite(d)) return [];
  const r = a.rx, s = b.rx, epsilon = ROUNDING * Math.max(r, s, d);
  if (d > r + s + epsilon || d < Math.abs(r - s) - epsilon) return [];
  const along = (d * d + (r - s) * (r + s)) / (2 * d), squared = (r - along) * (r + along);
  if (squared < -epsilon * Math.max(r, s, d)) return [];
  const h = Math.sqrt(Math.max(0, squared)), ux = dx / d, uy = dy / d;
  const base = { x: a.center.x + ux * along, y: a.center.y + uy * along };
  return (h === 0 ? [base] : [
    { x: base.x - uy * h, y: base.y + ux * h },
    { x: base.x + uy * h, y: base.y - ux * h },
  ]).filter(point => validCadPoint(point) && onArc(point, a) && onArc(point, b));
}

/** Intersect the original cubic with an analytic ellipse, retaining only the
 * visible arc sweep. Squaring cubic Bernstein coordinates produces a degree-6
 * polynomial. Large control hulls are subdivided before forming coefficients
 * to keep tiny ellipses / long curves from losing their roots to cancellation.
 * Subdivision preserves the cubic exactly; no polygon crossings are used. */
export function cubicEllipseIntersections(points: CadPoint[], e: SnapEllipse): CadPoint[] {
  if (points.length !== 4 || !points.every(validCadPoint) || !validEllipse(e)) return [];
  const normalized = points.map(point => normalizedPoint(point, e));
  if (!normalized.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) return [];
  const worldScale = Math.max(e.rx, e.ry, Math.abs(e.center.x), Math.abs(e.center.y), ...points.flatMap(p => [Math.abs(p.x), Math.abs(p.y)]));
  const epsilon = ROUNDING * worldScale, normalizedError = epsilon / Math.min(e.rx, e.ry);
  // Refuse geometry below meaningful world-coordinate precision.
  if (!Number.isFinite(normalizedError) || normalizedError > 1e-4) return [];
  const pending = [{ points: normalized, lo: 0, hi: 1, depth: 0 }], parameters: number[] = [];
  const choose3 = [1, 3, 3, 1], choose6 = [1, 6, 15, 20, 15, 6, 1];
  let remaining = 512;
  while (pending.length) {
    if (--remaining < 0) return [];
    const span = pending.pop()!, p = span.points;
    const margin = 8 * normalizedError + ROUNDING;
    if (Math.min(...p.map(q => q.x)) > 1 + margin || Math.max(...p.map(q => q.x)) < -1 - margin
      || Math.min(...p.map(q => q.y)) > 1 + margin || Math.max(...p.map(q => q.y)) < -1 - margin) continue;
    if (p.some(q => Math.max(Math.abs(q.x), Math.abs(q.y)) > 4)) {
      if (span.depth >= 48) return [];
      const [left, right] = splitCubic(p), mid = (span.lo + span.hi) / 2, depth = span.depth + 1;
      pending.push({ points: right, lo: mid, hi: span.hi, depth }, { points: left, lo: span.lo, hi: mid, depth });
      continue;
    }
    const coefficients = Array<number>(7).fill(-1);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
      coefficients[i + j] += choose3[i] * choose3[j] / choose6[i + j] * (p[i].x * p[j].x + p[i].y * p[j].y);
    for (const t of bernsteinRoots(coefficients, 16 * normalizedError)) parameters.push(span.lo + (span.hi - span.lo) * t);
  }
  const result: CadPoint[] = [];
  for (const t of parameters.sort((a, b) => a - b)) {
    const point = cubicAt(points, t), local = normalizedPoint(point, e);
    if (!validCadPoint(point) || Math.abs(Math.hypot(local.x, local.y) - 1) > 16 * normalizedError + ROUNDING
      || !onArc(point, e) || result.some(q => Math.hypot(q.x - point.x, q.y - point.y) <= 16 * epsilon)) continue;
    result.push(point);
  }
  return result;
}

export function snapIntersections(a: SnapIntersectionSource, b: SnapIntersectionSource): CadPoint[] {
  if (a.kind === 'line' && b.kind === 'line') {
    const point = lineSnapIntersection(a.a, a.b, b.a, b.b); return point ? [point] : [];
  }
  if (a.kind === 'line' && b.kind === 'ellipse') return lineEllipseIntersections(a.a, a.b, b.ellipse);
  if (a.kind === 'ellipse' && b.kind === 'line') return lineEllipseIntersections(b.a, b.b, a.ellipse);
  if (a.kind === 'line' && b.kind === 'cubic') return lineCubicIntersections(a.a, a.b, b.points);
  if (a.kind === 'cubic' && b.kind === 'line') return lineCubicIntersections(b.a, b.b, a.points);
  if (a.kind === 'cubic' && b.kind === 'ellipse') return cubicEllipseIntersections(a.points, b.ellipse);
  if (a.kind === 'ellipse' && b.kind === 'cubic') return cubicEllipseIntersections(b.points, a.ellipse);
  if (a.kind === 'ellipse' && b.kind === 'ellipse') return circleIntersections(a.ellipse, b.ellipse);
  return [];
}
