import { nodeAt, type CadContour } from "./cad-curves";
import type { CadPoint } from "./cad-settings";
import { CadOperationError } from "./cad-plans";
type HPoint = [number, number, number];
const blend = (a: HPoint, b: HPoint, t: number): HPoint =>
  a.map((v, i) => v * (1 - t) + b[i] * t) as HPoint;
const point = (p: HPoint): CadPoint => ({ x: p[0] / p[2], y: p[1] / p[2] });
/** Positive-weight, clamped rational B-splines. Convex-hull subdivision bounds
 * each polyline segment's geometric deviation, rather than guessing from samples. */
export function rationalSplineContour(
  controls: CadPoint[],
  weights: number[],
  knots: number[],
  degree: number,
  closed: boolean,
  tolerance: number,
): CadContour {
  if (
    !Number.isInteger(degree) ||
    degree < 1 ||
    degree > 5 ||
    controls.length < degree + 1 ||
    controls.length > 4096 ||
    weights.length !== controls.length ||
    knots.length !== controls.length + degree + 1 ||
    !Number.isFinite(tolerance) ||
    tolerance <= 0 ||
    controls.some((p) => ![p.x, p.y].every(Number.isFinite)) ||
    weights.some((w) => !Number.isFinite(w) || w <= 0) ||
    knots.some((k, i) => !Number.isFinite(k) || (i > 0 && k < knots[i - 1]))
  )
    throw new CadOperationError("unsupported");
  let p: HPoint[] = controls.map((p, i) => [
      p.x * weights[i],
      p.y * weights[i],
      weights[i],
    ]),
    u = [...knots];
  const low = u[degree],
    high = u[p.length];
  if (
    !(high > low) ||
    u.slice(0, degree + 1).some((k) => k !== low) ||
    u.slice(-degree - 1).some((k) => k !== high)
  )
    throw new CadOperationError("unsupported");
  for (const value of [...new Set(u.filter((k) => k > low && k < high))]) {
    let multiplicity = u.filter((k) => k === value).length;
    if (multiplicity > degree) throw new CadOperationError("unsupported");
    while (multiplicity < degree) {
      const k = u.findIndex((v) => v > value) - 1,
        q: HPoint[] = [];
      for (let i = 0; i <= k - degree; i++) q[i] = p[i];
      for (let i = k - multiplicity; i < p.length; i++) q[i + 1] = p[i];
      for (let i = k - degree + 1; i <= k - multiplicity; i++)
        q[i] = blend(p[i - 1], p[i], (value - u[i]) / (u[i + degree] - u[i]));
      p = q;
      u.splice(k + 1, 0, value);
      multiplicity++;
      if (p.length > 16000) throw new CadOperationError("limit");
    }
  }
  const nodes = [nodeAt(point(p[0]))];
  const distance = (p: CadPoint, a: CadPoint, b: CadPoint) => {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      d = dx * dx + dy * dy,
      t = d
        ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / d))
        : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  const subdivide = (c: HPoint[], depth: number) => {
    const points = c.map(point),
      a = points[0],
      b = points.at(-1)!;
    if (points.every((p) => distance(p, a, b) <= tolerance)) {
      if (nodes.length >= 4096) throw new CadOperationError("limit");
      if (Math.hypot(nodes.at(-1)!.x - b.x, nodes.at(-1)!.y - b.y) > 1e-10)
        nodes.push(nodeAt(b));
      return;
    }
    if (depth >= 24) throw new CadOperationError("limit");
    const left = [c[0]],
      right = [c.at(-1)!];
    let row = c;
    while (row.length > 1) {
      row = row.slice(0, -1).map((v, i) => blend(v, row[i + 1], 0.5));
      left.push(row[0]);
      right.unshift(row.at(-1)!);
    }
    subdivide(left, depth + 1);
    subdivide(right, depth + 1);
  };
  for (let i = 0; i < p.length - 1; i += degree)
    subdivide(p.slice(i, i + degree + 1), 0);
  if (closed) {
    if (
      Math.hypot(nodes[0].x - nodes.at(-1)!.x, nodes[0].y - nodes.at(-1)!.y) >
      tolerance
    )
      throw new CadOperationError("unsupported");
    nodes.pop();
  }
  return { closed, nodes };
}
