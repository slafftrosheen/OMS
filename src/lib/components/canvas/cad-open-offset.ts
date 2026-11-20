import { arcContour, contourSegments, mapContours, nodeAt, type CadContour } from './cad-curves';
import { CadOperationError } from './cad-plans';
import type { CadPoint } from './cad-settings';

const dot = (a: CadPoint, b: CadPoint) => a.x * b.x + a.y * b.y;
const cross = (a: CadPoint, b: CadPoint) => a.x * b.y - a.y * b.x;
const sub = (a: CadPoint, b: CadPoint) => ({ x: a.x - b.x, y: a.y - b.y });
const shift = (point: CadPoint, axis: CadPoint, distance: number) => ({
  x: point.x + axis.x * distance, y: point.y + axis.y * distance
});
// Left of a directed segment, accounting for the downward canvas Y axis.
const normal = (direction: CadPoint) => ({ x: direction.y, y: -direction.x });

export function offsetOpenPolyline(
  contour: CadContour, distance: number, join: 'round' | 'miter' | 'square', tolerance: number
): CadContour {
  if (contour.closed) throw new CadOperationError('offset-open');
  const directions = Array.from(contourSegments(contour), ([a, c1, c2, b]) => {
    const delta = sub(b, a), length = Math.hypot(delta.x, delta.y);
    if (length <= 1e-8) throw new CadOperationError('offset-open');
    const direction = { x: delta.x / length, y: delta.y / length };
    if ([c1, c2].some(point => {
      const local = sub(point, a), along = dot(local, direction);
      return Math.abs(cross(local, direction)) > 1e-7 || along < -1e-7 || along > length + 1e-7;
    })) throw new CadOperationError('offset-open');
    return direction;
  });
  if (directions.length === 1) {
    return mapContours([contour], point => shift(point, normal(directions[0]), distance))[0];
  }

  const corners = contour.nodes.map((point, index) => {
    const previous = directions[index - 1], next = directions[index];
    if (!previous || !next) return [nodeAt(shift(point, normal(next ?? previous), distance))];
    const cosine = dot(previous, next), sine = cross(previous, next);
    if (1 + cosine < 1e-10) throw new CadOperationError('offset-collapse');
    const n1 = normal(previous), n2 = normal(next);
    const miter = { x: n1.x + n2.x, y: n1.y + n2.y };
    if (sine * distance <= 0 || join === 'miter' && 2 / (1 + cosine) <= 4) {
      return [nodeAt(shift(point, miter, distance / (1 + cosine)))];
    }
    const angle = Math.atan2(sine, cosine), radius = Math.abs(distance);
    const a = shift(point, n1, distance), b = shift(point, n2, distance);
    if (join === 'round') {
      const direction = Math.sign(distance);
      const start = Math.atan2(n1.y * direction, n1.x * direction);
      const maxStep = Math.min(Math.PI / 2, Math.pow(10000 * tolerance / radius, 1 / 6));
      return arcContour(point.x, point.y, radius, radius, start, angle, maxStep).nodes;
    }
    // Square joins also limit miters at acute exterior corners.
    const extension = radius * Math.tan(Math.abs(angle) / 4);
    return [nodeAt(shift(a, previous, extension)), nodeAt(shift(b, next, -extension))];
  });
  for (const [index, direction] of directions.entries()) {
    // A large inward offset can consume a source segment. Avoid producing a
    // backwards cut between adjacent joints.
    if (dot(sub(corners[index + 1][0], corners[index].at(-1)!), direction) <= 1e-8)
      throw new CadOperationError('offset-collapse');
  }
  return { closed: false, nodes: corners.flat() };
}
