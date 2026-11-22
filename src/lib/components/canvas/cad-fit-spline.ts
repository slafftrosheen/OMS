import { nodeAt, type CadContour } from './cad-curves';
import { CadOperationError } from './cad-plans';
import type { CadPoint } from './cad-settings';

function chordSpans(points: CadPoint[], closed: boolean) {
  return points.slice(closed ? 0 : 1).map((_, i) => {
    const next = points[(i + 1) % points.length];
    const x = next.x - points[i].x, y = next.y - points[i].y;
    const length = Math.hypot(x, y);
    if (!Number.isFinite(length) || length === 0) throw new CadOperationError('spline-fit-points');
    return { length, x: x / length, y: y / length };
  });
}

function chordWeight(before: number, after: number) {
  const scale = Math.max(before, after);
  return (before / scale) / (before / scale + after / scale);
}

function fittedContour(points: CadPoint[], spans: ReturnType<typeof chordSpans>,
  dx: Float64Array, dy: Float64Array, closed: boolean): CadContour {
  const nodes = points.map(nodeAt);
  for (const [i, { length }] of spans.entries()) {
    const next = (i + 1) % nodes.length;
    const third = length / 3;
    nodes[i].outX = third * dx[i]; nodes[i].outY = third * dy[i];
    nodes[next].inX = -third * dx[next]; nodes[next].inY = -third * dy[next];
  }
  return { closed, nodes };
}

/** Interpolate the fit points with a chord-length cubic. Endpoints use natural
 * boundary conditions unless a recorded tangent supplies their direction. */
export function fitOpenCubic(points: CadPoint[], start?: CadPoint, end?: CadPoint): CadContour {
  if (points.length < 2) throw new CadOperationError('spline-fit-points');
  const spans = chordSpans(points, false);
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
    const weight = chordWeight(before.length, after.length);
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
  return fittedContour(points, spans, dx, dy, false);
}

/** A cyclic chord-length cubic shares derivatives across the closing seam. */
export function fitClosedCubic(points: CadPoint[]): CadContour {
  const first = points[0], last = points.at(-1);
  if (first && last && first.x === last.x && first.y === last.y) points = points.slice(0, -1);
  if (new Set(points.map(p => `${p.x},${p.y}`)).size < 3) throw new CadOperationError('spline-fit-points');
  const spans = chordSpans(points, true);
  const count = spans.length;
  const equations = spans.map((after, i) => {
    const prev = (i + count - 1) % count, next = (i + 1) % count;
    const before = spans[prev], weight = chordWeight(before.length, after.length);
    return { prev, next, weight,
      x: 3 * ((1 - weight) * before.x + weight * after.x),
      y: 3 * ((1 - weight) * before.y + weight * after.y) };
  });
  let dx = new Float64Array(count), dy = new Float64Array(count);
  let nextX = new Float64Array(count), nextY = new Float64Array(count);
  // The diagonal is 2 and the off-diagonal weights sum to 1, so each sweep
  // halves the error bound. This avoids a dense solve for large fit lists.
  for (let step = 0; step < 48; step++) {
    for (let i = 0; i < count; i++) {
      const { prev, next, weight, x, y } = equations[i];
      nextX[i] = (x - (1 - weight) * dx[prev] - weight * dx[next]) / 2;
      nextY[i] = (y - (1 - weight) * dy[prev] - weight * dy[next]) / 2;
    }
    [dx, nextX] = [nextX, dx];
    [dy, nextY] = [nextY, dy];
  }
  return fittedContour(points, spans, dx, dy, true);
}
