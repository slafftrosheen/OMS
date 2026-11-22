import { CAD_CURVE_NODE_LIMIT, nodeAt, type CadContour } from "./cad-curves";
import type { CadPoint } from "./cad-settings";
import { CadOperationError } from "./cad-plans";

type HPoint = [number, number, number];
export interface SplineContours {
  contours: CadContour[];
  approximated: boolean;
}
const MAX_DEGREE = 16;
const MAX_CONTOURS = 512;
export const MAX_CUBIC_CHAIN_CONTROLS = 3 * CAD_CURVE_NODE_LIMIT + 1;

/** A clamped cubic chain stores three extra controls per segment, but only
 * one extra editable anchor. This is also the layout used by OMS DXF export. */
export function isExpandedCubicChain(
  controlCount: number, knots: number[], degree: number, weights?: number[],
): boolean {
  if (degree !== 3 || controlCount <= CAD_CURVE_NODE_LIMIT || controlCount > MAX_CUBIC_CHAIN_CONTROLS ||
      (controlCount - 1) % 3 !== 0 || knots.length !== controlCount + 4 ||
      (weights?.length && (weights.length !== controlCount || weights[0] <= 0 || weights.some(w => w !== weights[0]))))
    return false;
  for (let i = 0; i < knots.length;) {
    const size = i === 0 || i === controlCount ? 4 : 3;
    if (!Number.isFinite(knots[i]) || (i > 0 && knots[i] <= knots[i - 1]) || knots[i] !== knots[i + size - 1])
      return false;
    i += size;
  }
  return true;
}
const fail = (code: string, message: string): never => {
  const error = new CadOperationError(code);
  error.message = message;
  throw error;
};
const blend = (a: HPoint, b: HPoint): HPoint => [
  a[0] * 0.5 + b[0] * 0.5,
  a[1] * 0.5 + b[1] * 0.5,
  a[2] * 0.5 + b[2] * 0.5,
];
const point = (p: HPoint): CadPoint => {
  const result = { x: p[0] / p[2], y: p[1] / p[2] };
  if (!(p[2] > 0) || !Number.isFinite(result.x) || !Number.isFinite(result.y))
    fail("spline-weights", "Spline weights exceed the supported numeric range.");
  return result;
};

/** Ratios are normalized locally: global knot scaling can erase narrow valid spans.
 * All arguments here lie inside [start, end]. Halving also handles a range that
 * overflows when finite knots have opposite signs. */
function fraction(value: number, start: number, end: number): number {
  if (value === start) return 0;
  if (value === end) return 1;
  const width = end - start;
  return Number.isFinite(width)
    ? (value - start) / width
    : (value * 0.5 - start * 0.5) / (end * 0.5 - start * 0.5);
}

/** Convert the basis restricted to one nonzero knot span into Bernstein form.
 * Cox recursion times a linear polynomial raises each Bernstein basis by one
 * degree. This works directly on the active domain, without assuming clamped
 * knots, inserting knots globally, or extending a periodic curve artificially. */
function bezierSpan(controls: HPoint[], knots: number[], degree: number, span: number): HPoint[] {
  const low = knots[span], high = knots[span + 1];
  let basis = new Map<number, number[]>([[span, [1]]]);
  for (let d = 1; d <= degree; d++) {
    const next = new Map<number, number[]>();
    for (let i = span - d; i <= span; i++) {
      const coefficients = Array<number>(d + 1).fill(0);
      const add = (source: number[] | undefined, a: number, b: number) => {
        if (!source) return;
        for (let j = 0; j <= d; j++) {
          if (j < d) coefficients[j] += (1 - j / d) * a * source[j];
          if (j > 0) coefficients[j] += (j / d) * b * source[j - 1];
        }
      };
      const left = basis.get(i), right = basis.get(i + 1);
      if (left) add(left, fraction(low, knots[i], knots[i + d]), fraction(high, knots[i], knots[i + d]));
      if (right) add(right, fraction(-low, -knots[i + d + 1], -knots[i + 1]), fraction(-high, -knots[i + d + 1], -knots[i + 1]));
      next.set(i, coefficients);
    }
    basis = next;
  }
  const result: HPoint[] = Array.from({ length: degree + 1 }, () => [0, 0, 0]);
  for (const [i, coefficients] of basis) {
    for (let j = 0; j <= degree; j++) {
      const factor = coefficients[j], control = controls[i];
      result[j][0] += factor * control[0];
      result[j][1] += factor * control[1];
      result[j][2] += factor * control[2];
    }
  }
  return result;
}

function chordDistance(p: CadPoint, a: CadPoint, b: CadPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const ux = dx / length, uy = dy / length;
  const along = Math.max(0, Math.min(length, (p.x - a.x) * ux + (p.y - a.y) * uy));
  return Math.hypot(p.x - a.x - along * ux, p.y - a.y - along * uy);
}

/** A closed DXF outline can store each cubic as an independently clamped
 * span. Join only an ordered chain with identical junctions. Existing loops
 * and genuine discontinuities keep their separate contours. */
function joinClosedSplineChain(contours: CadContour[]): void {
  const same = (a: CadPoint, b: CadPoint) => a.x === b.x && a.y === b.y;
  if (contours.length < 2 || contours.some(({ nodes }, i) => {
    const end = nodes[nodes.length - 1];
    const next = contours[i + 1];
    return same(nodes[0], end) || (next !== undefined && !same(end, next.nodes[0]));
  })) return;

  const [first, ...rest] = contours;
  for (const { nodes: [start, ...tail] } of rest) {
    const seam = first.nodes[first.nodes.length - 1];
    seam.outX = start.outX;
    seam.outY = start.outY;
    first.nodes.push(...tail);
  }
  contours.length = 1;
}

/** Editable exact cubics for polynomial degree 1-3; conservative bounded
 * polylines for positive rational and higher-degree curves. Repeated knots of
 * multiplicity degree+1 delimit separate spans, with an opt-in for closed
 * DXF chains whose spans already meet. */
export function splineContours(
  controls: CadPoint[],
  weights: number[] | undefined,
  knots: number[],
  degree: number,
  closed: boolean,
  tolerance: number,
  options: { joinCoincidentClosedSpans?: boolean } = {},
): SplineContours {
  if (!Number.isInteger(degree) || degree < 1 || degree > MAX_DEGREE)
    fail("spline-degree", "Spline degree must be between 1 and 16.");
  const expandedCubic = isExpandedCubicChain(controls.length, knots, degree, weights);
  const nodeBudget = CAD_CURVE_NODE_LIMIT + Number(expandedCubic && closed);
  if (controls.length < degree + 1 || (controls.length > CAD_CURVE_NODE_LIMIT && !expandedCubic) ||
      controls.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    fail("spline-control-points", "Spline control points are missing, invalid, or too numerous.");
  if (!(tolerance > 0) || !Number.isFinite(tolerance))
    fail("spline-limit", "Spline approximation tolerance must be a positive finite number.");
  if (knots.length !== controls.length + degree + 1 ||
      knots.some((v, i) => !Number.isFinite(v) || (i > 0 && v < knots[i - 1])))
    fail("spline-knots", "Spline knots must be finite, ordered, and match its degree and control points.");
  const multiplicities = new Map<number, number>();
  for (const value of knots) {
    const count = (multiplicities.get(value) || 0) + 1;
    if (count > degree + 1) fail("spline-knots", "A spline knot is repeated more than degree + 1 times.");
    multiplicities.set(value, count);
  }
  if (!(knots[controls.length] > knots[degree]))
    fail("spline-knots", "Spline knots have an empty active parameter range.");
  const w = weights?.length ? weights : controls.map(() => 1);
  if (w.length !== controls.length || w.some((v) => !Number.isFinite(v) || v <= 0))
    fail("spline-weights", "Spline weights must be positive finite values, one per control point.");
  const largestWeight = Math.max(...w);
  const normalizedWeights = w.map((v) => v / largestWeight);
  if (normalizedWeights.some((v) => v < Number.MIN_VALUE / Number.EPSILON))
    fail("spline-weights", "Spline weight ratios exceed the supported numeric range.");
  const homogeneous: HPoint[] = controls.map((p, i) => [
    p.x * normalizedWeights[i], p.y * normalizedWeights[i], normalizedWeights[i],
  ]);
  const exact = degree <= 3 && w.every((v) => v === w[0]);
  const contours: CadContour[] = [];
  let contour: CadContour | undefined, nodeCount = 0, subdivisions = 0;
  const append = (p: CadPoint) => {
    if (++nodeCount > nodeBudget)
      fail("spline-limit", "Spline exceeds the editable node limit at this tolerance.");
    const node = nodeAt(p);
    contour!.nodes.push(node);
    return node;
  };
  const approximate = (polygon: HPoint[], depth: number) => {
    const projected = polygon.map(point), start = projected[0], end = projected[degree];
    if (projected.every((p) => chordDistance(p, start, end) <= tolerance)) {
      append(end);
      return;
    }
    if (depth >= 32 || ++subdivisions > CAD_CURVE_NODE_LIMIT * 4)
      fail("spline-limit", "Spline cannot meet the requested tolerance within its subdivision limit.");
    const left: HPoint[] = [polygon[0]], right: HPoint[] = [polygon[degree]];
    let row = polygon;
    while (row.length > 1) {
      row = row.slice(1).map((p, i) => blend(row[i], p));
      left.push(row[0]);
      right.unshift(row[row.length - 1]);
    }
    approximate(left, depth + 1);
    approximate(right, depth + 1);
  };
  for (let span = degree; span < controls.length; span++) {
    if (knots[span] === knots[span + 1]) continue;
    const polygon = bezierSpan(homogeneous, knots, degree, span);
    if (!contour || multiplicities.get(knots[span]) === degree + 1) {
      if (contours.length >= MAX_CONTOURS)
        fail("spline-limit", "Spline exceeds the editable contour limit.");
      contour = { closed: false, nodes: [] };
      contours.push(contour);
      append(point(polygon[0]));
    }
    if (exact) {
      const p = polygon.map(point), first = contour.nodes[contour.nodes.length - 1];
      const last = append(p[degree]);
      if (degree === 2) {
        first.outX = (p[1].x - first.x) * (2 / 3);
        first.outY = (p[1].y - first.y) * (2 / 3);
        last.inX = (p[1].x - last.x) * (2 / 3);
        last.inY = (p[1].y - last.y) * (2 / 3);
      } else if (degree === 3) {
        first.outX = p[1].x - first.x;
        first.outY = p[1].y - first.y;
        last.inX = p[2].x - last.x;
        last.inY = p[2].y - last.y;
      }
    } else approximate(polygon, 0);
  }
  if (closed) {
    if (exact && options.joinCoincidentClosedSpans) joinClosedSplineChain(contours);
    // Closing a DXF entity must never draw a straight bridge between distant
    // endpoints. Only a numerically coincident seam can be merged.
    const scale = Math.max(1, ...controls.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)]));
    const seamTolerance = Math.min(tolerance, 1e-7, Math.max(1e-10, scale * Number.EPSILON * 32));
    for (const c of contours) {
      const first = c.nodes[0], last = c.nodes[c.nodes.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) > seamTolerance)
        fail("spline-closure", "Closed spline endpoints do not meet.");
      // A single cubic may be a complete loop; split it to keep the two-node
      // minimum of editable OMS contours while preserving its exact shape.
      if (c.nodes.length === 2) {
        const a = first, b = last;
        const q0 = { x: a.x + a.outX * 0.5, y: a.y + a.outY * 0.5 };
        const q2 = { x: b.x + b.inX * 0.5, y: b.y + b.inY * 0.5 };
        const q1 = { x: (a.x + a.outX) * 0.5 + (b.x + b.inX) * 0.5, y: (a.y + a.outY) * 0.5 + (b.y + b.inY) * 0.5 };
        const r0 = { x: q0.x * 0.5 + q1.x * 0.5, y: q0.y * 0.5 + q1.y * 0.5 };
        const r1 = { x: q1.x * 0.5 + q2.x * 0.5, y: q1.y * 0.5 + q2.y * 0.5 };
        const middle = nodeAt({ x: r0.x * 0.5 + r1.x * 0.5, y: r0.y * 0.5 + r1.y * 0.5 });
        a.outX *= 0.5; a.outY *= 0.5; b.inX *= 0.5; b.inY *= 0.5;
        middle.inX = r0.x - middle.x; middle.inY = r0.y - middle.y;
        middle.outX = r1.x - middle.x; middle.outY = r1.y - middle.y;
        c.nodes.splice(1, 0, middle);
      }
      first.inX = last.x + last.inX - first.x;
      first.inY = last.y + last.inY - first.y;
      c.nodes.pop();
      c.closed = true;
    }
  }
  return { contours, approximated: !exact };
}

/** Compatibility for single-edge consumers (for example HATCH boundaries).
 * A discontinuous spline needs a multi-contour consumer, never a hidden bridge. */
export function rationalSplineContour(
  controls: CadPoint[], weights: number[], knots: number[],
  degree: number, closed: boolean, tolerance: number,
): CadContour {
  const result = splineContours(controls, weights, knots, degree, closed, tolerance);
  if (result.contours.length !== 1)
    fail("spline-knots", "Discontinuous spline requires separate contours.");
  return result.contours[0];
}
