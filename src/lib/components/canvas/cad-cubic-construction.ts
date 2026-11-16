import { cubicAt } from './cad-curves';
import { bernsteinRoots } from './cad-bernstein-roots';
import { validCadPoint, type CadPoint } from './cad-settings';

/** Shared by both construction categories, per pointer query, after proximity filtering. */
export const MAX_CUBIC_CONSTRUCTION_SOURCES = 64;
const ROUNDING = 64 * Number.EPSILON;
const CHOOSE3 = [1, 3, 3, 1], CHOOSE2 = [1, 2, 1], CHOOSE5 = [1, 5, 10, 10, 5, 1];
const dot = (a: CadPoint, b: CadPoint) => a.x * b.x + a.y * b.y;
const cross = (a: CadPoint, b: CadPoint) => a.x * b.y - a.y * b.x;

/** Isolated feet / tangent contacts on the original finite cubic.
 * (B-A)·B' and (B-A)×B' are degree-five Bernstein polynomials.
 * Coordinates are translated/scaled before multiplication. Derivative roots
 * retain even-multiplicity contacts, then a direct geometric residual check
 * rejects numerical false roots. No tessellation or pointer-distance epsilon.
 * Cusps, zero-length connections and non-isolated collinear tangency are omitted. */
export function cubicConstructionPoints(anchor: CadPoint, points: CadPoint[], kind: 'perpendicular' | 'tangent'): CadPoint[] {
  if (points.length !== 4 || ![anchor, ...points].every(validCadPoint) || !['perpendicular', 'tangent'].includes(kind)) return [];
  const origin = points[0], delta = { x: anchor.x - origin.x, y: anchor.y - origin.y };
  const local = points.map(p => ({ x: p.x - origin.x, y: p.y - origin.y }));
  const scale = Math.max(Math.abs(delta.x), Math.abs(delta.y), ...local.flatMap(p => [Math.abs(p.x), Math.abs(p.y)]));
  if (!Number.isFinite(scale) || scale === 0) return [];
  const q = local.map(p => ({ x: (p.x - delta.x) / scale, y: (p.y - delta.y) / scale }));
  const derivative = local.slice(1).map((p, i) => ({ x: 3 * (p.x - local[i].x) / scale, y: 3 * (p.y - local[i].y) / scale }));
  const magnitude = Math.max(...derivative.map(p => Math.hypot(p.x, p.y)));
  const extent = Math.max(scale, ...[anchor, ...points].flatMap(p => [Math.abs(p.x), Math.abs(p.y)]));
  const coordinateError = ROUNDING * extent / scale;
  if (magnitude <= 6 * coordinateError) return [];
  const operation = kind === 'perpendicular' ? dot : cross, coefficients = Array(6).fill(0) as number[];
  let productMagnitude = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const weight = CHOOSE3[i] * CHOOSE2[j] / CHOOSE5[i+j];
    coefficients[i+j] += weight * operation(q[i], derivative[j]);
    productMagnitude = Math.max(productMagnitude, Math.abs(q[i].x * derivative[j].x) + Math.abs(q[i].y * derivative[j].y),
      Math.abs(q[i].x * derivative[j].y) + Math.abs(q[i].y * derivative[j].x));
  }
  const qMagnitude = Math.max(...q.map(p => Math.hypot(p.x, p.y)));
  const error = ROUNDING * productMagnitude + coordinateError * (magnitude + 6 * qMagnitude + 6 * coordinateError);
  const results: CadPoint[] = [];
  for (const t of bernsteinRoots(coefficients, error)) {
    const u = 1 - t, d = { x: u*u*derivative[0].x + 2*u*t*derivative[1].x + t*t*derivative[2].x,
      y: u*u*derivative[0].y + 2*u*t*derivative[1].y + t*t*derivative[2].y };
    const connection = cubicAt(q, t);
    if (Math.hypot(d.x, d.y) <= 6 * coordinateError || Math.hypot(connection.x, connection.y) * scale < 1e-6 ||
        Math.abs(operation(connection, d)) > error * 2) continue;
    const point = cubicAt(points, t);
    if (validCadPoint(point) && !results.some(p => Math.hypot(p.x-point.x, p.y-point.y) <= ROUNDING * extent * 2)) results.push(point);
  }
  return results;
}
