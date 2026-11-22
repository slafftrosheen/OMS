import { nodeAt, type CadContour } from './cad-curves';
import { CadOperationError } from './cad-plans';
import type { CadPoint } from './cad-settings';

/** Interpolate the fit points with a chord-length cubic. Endpoints use natural
 * boundary conditions unless a recorded tangent supplies their direction. */
export function fitOpenCubic(points: CadPoint[], start?: CadPoint, end?: CadPoint): CadContour {
  if (points.length < 2) throw new CadOperationError('spline-fit-points');
  const spans = points.slice(1).map((point, i) => {
    const x = point.x - points[i].x, y = point.y - points[i].y;
    const length = Math.hypot(x, y);
    if (!Number.isFinite(length) || length === 0) throw new CadOperationError('spline-fit-points');
    return { length, x: x / length, y: y / length };
  });
  const last = points.length - 1;
  const upper = new Float64Array(points.length);
  const dx = new Float64Array(points.length), dy = new Float64Array(points.length);
  for (let i = 0; i <= last; i++) {
    const before = spans[Math.max(0, i - 1)], after = spans[Math.min(i, last - 1)];
    const tangent = i === 0 ? start : i === last ? end : undefined;
    const magnitude = tangent ? Math.hypot(tangent.x, tangent.y) : 0;
    if (!Number.isFinite(magnitude)) throw new CadOperationError('spline-fit-points');
    if (tangent && magnitude > 0) {
      dx[i] = tangent.x / magnitude; dy[i] = tangent.y / magnitude;
      continue;
    }
    const scale = Math.max(before.length, after.length);
    const fraction = before.length / scale;
    const other = after.length / scale;
    const weight = fraction / (fraction + other);
    const lower = i === 0 ? 0 : i === last ? 1 : 1 - weight;
    const higher = i === last ? 0 : i === 0 ? 1 : weight;
    const pivot = i === 0 ? 2 : 2 - lower * upper[i - 1];
    upper[i] = higher / pivot;
    const prevX = i === 0 ? 0 : lower * dx[i - 1];
    const prevY = i === 0 ? 0 : lower * dy[i - 1];
    dx[i] = (3 * ((1 - weight) * before.x + weight * after.x) - prevX) / pivot;
    dy[i] = (3 * ((1 - weight) * before.y + weight * after.y) - prevY) / pivot;
  }
  for (let i = last - 1; i >= 0; i--) {
    dx[i] -= upper[i] * dx[i + 1];
    dy[i] -= upper[i] * dy[i + 1];
  }
  const nodes = points.map(nodeAt);
  for (const [i, { length }] of spans.entries()) {
    const third = length / 3;
    nodes[i].outX = third * dx[i]; nodes[i].outY = third * dy[i];
    nodes[i + 1].inX = -third * dx[i + 1]; nodes[i + 1].inY = -third * dy[i + 1];
  }
  return { closed: false, nodes };
}
