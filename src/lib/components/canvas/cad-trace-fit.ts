import { nodeAt, validContours, type CadBezierNode, type CadContour } from './cad-curves';
import { validCadPoint, type CadPoint } from './cad-settings';

export interface TraceFitOptions {
  /** Maximum geometric deviation from the sampled pixel boundary, in pixels. */
  tolerance: number;
  preserveCorners: boolean;
  closed?: boolean;
  /** Original input indices, before duplicate removal. Junctions stay exact. */
  forcedCorners?: readonly number[];
  budget?: { remaining: number };
}
export const MAX_TRACE_BOUNDARY_POINTS = 131072;
export const MAX_TRACE_FIT_WORK = 8_000_000;
const EPS = 1e-9, MAX_NODES = 4096, MAX_DEPTH = 24;
type Cubic = [CadPoint, CadPoint, CadPoint, CadPoint];
type Budget = { remaining: number };
const fail = (code: 'geometry' | 'limit') => new Error(code);
const spend = (budget: Budget, count = 1) => {
  if (budget.remaining < count) { budget.remaining = 0; throw fail('limit'); }
  budget.remaining -= count;
};
const distance = (a: CadPoint, b: CadPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const same = (a: CadPoint, b: CadPoint) => distance(a, b) <= EPS;
const dot = (a: CadPoint, b: CadPoint) => a.x * b.x + a.y * b.y;
const minus = (a: CadPoint, b: CadPoint) => ({ x: a.x - b.x, y: a.y - b.y });
const neg = (a: CadPoint) => ({ x: -a.x, y: -a.y });
const mix = (a: CadPoint, b: CadPoint, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const unit = (a: CadPoint): CadPoint => { const n = Math.hypot(a.x, a.y); return n > EPS ? { x: a.x / n, y: a.y / n } : { x: 0, y: 0 }; };
const evaluate = (p: Cubic, t: number): CadPoint => {
  const a = mix(p[0], p[1], t), b = mix(p[1], p[2], t), c = mix(p[2], p[3], t);
  return mix(mix(a, b, t), mix(b, c, t), t);
};
const derivative = (p: Cubic, t: number): CadPoint => {
  const s = 1 - t;
  return { x: 3 * (s * s * (p[1].x - p[0].x) + 2 * s * t * (p[2].x - p[1].x) + t * t * (p[3].x - p[2].x)),
    y: 3 * (s * s * (p[1].y - p[0].y) + 2 * s * t * (p[2].y - p[1].y) + t * t * (p[3].y - p[2].y)) };
};
function segmentDistance2(p: CadPoint, a: CadPoint, b: CadPoint): number {
  const d = minus(b, a), length = dot(d, d), t = length ? Math.max(0, Math.min(1, dot(minus(p, a), d) / length)) : 0;
  const x = p.x - a.x - d.x * t, y = p.y - a.y - d.y * t;
  return x * x + y * y;
}

interface BoxNode {
  first: number; last: number; x0: number; y0: number; x1: number; y1: number;
  left?: BoxNode; right?: BoxNode;
}
/** A range-aware tree over ordered segments avoids an all-pairs Hausdorff
 * scan. Recursive fitting queries the original tree with its current span. */
function segmentTree(points: CadPoint[], first: number, last: number, budget: Budget): BoxNode {
  spend(budget);
  if (last - first === 1) {
    const a = points[first], b = points[last];
    return { first, last, x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
  }
  const middle = (first + last) >> 1;
  const left = segmentTree(points, first, middle, budget), right = segmentTree(points, middle, last, budget);
  return { first, last, x0: Math.min(left.x0, right.x0), y0: Math.min(left.y0, right.y0),
    x1: Math.max(left.x1, right.x1), y1: Math.max(left.y1, right.y1), left, right };
}
function nearestDistance(p: CadPoint, points: CadPoint[], tree: BoxNode, first: number, last: number, limit: number, budget: Budget): number {
  let best = limit * limit, found = false;
  const boxDistance = (node: BoxNode) => Math.max(node.x0 - p.x, 0, p.x - node.x1) ** 2 + Math.max(node.y0 - p.y, 0, p.y - node.y1) ** 2;
  const visit = (node: BoxNode) => {
    spend(budget);
    if (node.last <= first || node.first >= last || boxDistance(node) > best + EPS * EPS) return;
    if (!node.left || !node.right) {
      const value = segmentDistance2(p, points[node.first], points[node.last]);
      if (value <= best + EPS * EPS) { best = Math.min(best, value); found = true; }
      return;
    }
    if (boxDistance(node.left) <= boxDistance(node.right)) { visit(node.left); visit(node.right); }
    else { visit(node.right); visit(node.left); }
  };
  visit(tree);
  return found ? Math.sqrt(best) : Infinity;
}

/** Distance to a polyline is 1-Lipschitz. End distances da/db bound every
 * interior distance by (segmentLength + da + db)/2. Subdivide only uncertain
 * intervals, so acceptance covers continuous edges, not just sampled nodes. */
function certifyPolyline(a: CadPoint[], first: number, last: number, b: CadPoint[], tree: BoxNode,
  bFirst: number, bLast: number, limit: number, budget: Budget): boolean {
  const nearest = (p: CadPoint) => nearestDistance(p, b, tree, bFirst, bLast, limit, budget);
  let da = nearest(a[first]);
  if (!Number.isFinite(da)) return false;
  for (let i = first; i < last; i++) {
    const db = nearest(a[i + 1]);
    if (!Number.isFinite(db)) return false;
    const stack = [{ a: a[i], b: a[i + 1], da, db, depth: 0 }];
    while (stack.length) {
      spend(budget);
      const part = stack.pop()!;
      if ((distance(part.a, part.b) + part.da + part.db) / 2 <= limit + EPS) continue;
      if (part.depth >= 24) return false;
      const middle = mix(part.a, part.b, .5), dm = nearest(middle);
      if (!Number.isFinite(dm)) return false;
      stack.push({ a: middle, b: part.b, da: dm, db: part.db, depth: part.depth + 1 },
        { a: part.a, b: middle, da: part.da, db: dm, depth: part.depth + 1 });
    }
    da = db;
  }
  return true;
}
function flatten(cubic: Cubic, tolerance: number, budget: Budget): CadPoint[] | null {
  const points = [cubic[0]], stack = [{ p: cubic, depth: 0 }];
  while (stack.length) {
    spend(budget);
    const { p, depth } = stack.pop()!;
    if (Math.max(segmentDistance2(p[1], p[0], p[3]), segmentDistance2(p[2], p[0], p[3])) <= tolerance * tolerance) {
      points.push(p[3]); if (points.length > 2048) return null;
      continue;
    }
    if (depth >= MAX_DEPTH) return null;
    const a = mix(p[0], p[1], .5), b = mix(p[1], p[2], .5), c = mix(p[2], p[3], .5), d = mix(a, b, .5), e = mix(b, c, .5), middle = mix(d, e, .5);
    stack.push({ p: [middle, e, c, p[3]], depth: depth + 1 }, { p: [p[0], a, d, middle], depth: depth + 1 });
  }
  return points;
}
function acceptable(cubic: Cubic, points: CadPoint[], tree: BoxNode, first: number, last: number, tolerance: number, budget: Budget): boolean {
  if (cubic.some(p => !validCadPoint(p))) return false;
  const flattenError = Math.min(.01, tolerance / 32), polygon = flatten(cubic, flattenError, budget);
  if (!polygon) return false;
  const limit = tolerance - flattenError, fittedTree = segmentTree(polygon, 0, polygon.length - 1, budget);
  return certifyPolyline(points, first, last, polygon, fittedTree, 0, polygon.length - 1, limit, budget) &&
    certifyPolyline(polygon, 0, polygon.length - 1, points, tree, first, last, limit, budget);
}

function along(points: CadPoint[], index: number, direction: -1 | 1, length: number, closed: boolean,
  first: number, last: number, budget: Budget): CadPoint {
  let previous = points[index], current = index;
  for (let count = 0; count < points.length; count++) {
    spend(budget);
    let next = current + direction;
    if (closed) next = (next + points.length) % points.length;
    else if (next < first || next > last) return previous;
    const point = points[next], size = distance(previous, point);
    if (size >= length && size > EPS) return mix(previous, point, length / size);
    length -= size; previous = point; current = next;
  }
  return previous;
}
function tangent(points: CadPoint[], index: number, span: number, first: number, last: number, budget: Budget): CadPoint {
  const before = along(points, index, -1, span, false, first, last, budget);
  const after = along(points, index, 1, span, false, first, last, budget);
  return unit(minus(after, before));
}
function cornerIndices(points: CadPoint[], closed: boolean, span: number, budget: Budget): number[] {
  const scores = points.map((point, index) => {
    if (!closed && (index === 0 || index === points.length - 1)) return 0;
    const turn = (size: number) => {
      const before = along(points, index, -1, size, closed, 0, points.length - 1, budget);
      const after = along(points, index, 1, size, closed, 0, points.length - 1, budget);
      const a = unit(minus(point, before)), b = unit(minus(after, point));
      return Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
    };
    const small = turn(span), large = turn(span * 3);
    // Genuine cusps retain their turn at both scales. Smooth raster staircases
    // acquire a larger turn as the window grows and must not become corners.
    return small >= Math.PI / 4.5 && Math.abs(large - small) <= Math.PI / 22.5 ? small : 0;
  });
  const result: number[] = [];
  for (let i = 0; i < points.length; i++) {
    if (!scores[i]) continue;
    let selected = true, walked = 0, previous = i;
    for (const direction of [-1, 1]) {
      walked = 0; previous = i;
      for (let count = 1; count < points.length; count++) {
        spend(budget); const raw = i + direction * count;
        if (!closed && (raw < 0 || raw >= points.length)) break;
        const next = (raw + points.length) % points.length;
        walked += distance(points[previous], points[next]); previous = next;
        if (walked > span) break;
        if (scores[next] > scores[i] + EPS || Math.abs(scores[next] - scores[i]) <= EPS && next < i) { selected = false; break; }
      }
      if (!selected) break;
    }
    if (selected) result.push(i);
  }
  return result;
}

function straightRunAnchors(points: CadPoint[], closed: boolean, corners: Set<number>, span: number, budget: Budget): number[] {
  const turns: number[] = [], count = points.length, anchors: number[] = [];
  let perimeter = 0;
  for (let i = 0; i < count - (closed ? 0 : 1); i++) perimeter += distance(points[i], points[(i + 1) % count]);
  for (let i = 0; i < count; i++) {
    spend(budget);
    if (!closed && (i === 0 || i === count - 1)) { turns.push(i); continue; }
    const a = minus(points[i], points[(i - 1 + count) % count]), b = minus(points[(i + 1) % count], points[i]);
    if (Math.abs(a.x * b.y - a.y * b.x) > EPS || dot(a, b) <= 0) turns.push(i);
  }
  for (let k = 0; k < turns.length - (closed ? 0 : 1); k++) {
    const start = turns[k], end = turns[(k + 1) % turns.length], length = distance(points[start], points[end]);
    if (length < Math.max(12, span * 3, perimeter * .1)) continue;
    // A digitized arc has a short flat plateau at its extremum. Inset the
    // line/curve anchors instead of fixing a false cusp at that plateau's end.
    for (const [from, direction] of [[start, 1], [end, -1]]) {
      if (corners.has(from)) continue;
      let best = -1, error = Infinity;
      for (let j = 1; j < count; j++) {
        spend(budget); const i = (from + direction * j + count) % count;
        if (i === start || i === end) break;
        const walked = distance(points[from], points[i]), delta = Math.abs(walked - span);
        if (delta < error) { error = delta; best = i; }
        if (walked >= span) break;
      }
      if (best >= 0) anchors.push(best);
    }
  }
  return anchors;
}

function parameters(points: CadPoint[], first: number, last: number, budget: Budget): number[] {
  const u = [0];
  for (let i = first + 1; i <= last; i++) { spend(budget); u.push(u.at(-1)! + distance(points[i - 1], points[i])); }
  const length = u.at(-1)!;
  return u.map(value => value / length);
}
function generate(points: CadPoint[], first: number, last: number, left: CadPoint, right: CadPoint, u: number[], budget: Budget): Cubic {
  const a = points[first], b = points[last]; let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = first; i <= last; i++) {
    spend(budget); const t = u[i - first], s = 1 - t, b0 = s ** 3, b1 = 3 * s * s * t, b2 = 3 * s * t * t, b3 = t ** 3;
    const l = { x: left.x * b1, y: left.y * b1 }, r = { x: right.x * b2, y: right.y * b2 };
    const delta = { x: points[i].x - a.x * (b0 + b1) - b.x * (b2 + b3), y: points[i].y - a.y * (b0 + b1) - b.y * (b2 + b3) };
    c00 += dot(l, l); c01 += dot(l, r); c11 += dot(r, r); x0 += dot(l, delta); x1 += dot(r, delta);
  }
  const determinant = c00 * c11 - c01 * c01, chord = distance(a, b);
  let alpha = determinant > EPS * EPS ? (x0 * c11 - x1 * c01) / determinant : 0;
  let beta = determinant > EPS * EPS ? (c00 * x1 - c01 * x0) / determinant : 0;
  if (!Number.isFinite(alpha) || !Number.isFinite(beta) || alpha < chord * 1e-6 || beta < chord * 1e-6 || alpha > chord * 4 || beta > chord * 4)
    alpha = beta = chord / 3;
  return [a, { x: a.x + left.x * alpha, y: a.y + left.y * alpha }, { x: b.x + right.x * beta, y: b.y + right.y * beta }, b];
}
function refine(cubic: Cubic, points: CadPoint[], first: number, last: number, u: number[], budget: Budget): number[] | null {
  const next = [0], pools: { value: number; count: number }[] = [];
  for (let i = first + 1; i < last; i++) {
    spend(budget); const t = u[i - first], s = 1 - t, point = evaluate(cubic, t), delta = minus(point, points[i]);
    const d = derivative(cubic, t);
    const dd = { x: 6 * (s * (cubic[2].x - 2 * cubic[1].x + cubic[0].x) + t * (cubic[3].x - 2 * cubic[2].x + cubic[1].x)),
      y: 6 * (s * (cubic[2].y - 2 * cubic[1].y + cubic[0].y) + t * (cubic[3].y - 2 * cubic[2].y + cubic[1].y)) };
    const denominator = dot(d, d) + dot(delta, dd), value = denominator > EPS ? t - dot(delta, d) / denominator : t;
    if (!Number.isFinite(value)) return null;
    pools.push({ value: Math.max(0, Math.min(1, value)), count: 1 });
    // Raster stair vertices can project to the same place on a smooth curve.
    // Isotonic projection retains their order instead of abandoning an entire
    // refinement when two adjacent Newton estimates cross by a fraction.
    while (pools.length > 1 && pools.at(-2)!.value > pools.at(-1)!.value) {
      const b = pools.pop()!, a = pools.pop()!, count = a.count + b.count;
      pools.push({ value: (a.value * a.count + b.value * b.count) / count, count });
    }
  }
  for (const pool of pools) for (let i = 0; i < pool.count; i++) next.push(pool.value);
  return [...next, 1];
}

/** Fit ordered pixel boundaries as editable cubics. Local geometric error is
 * certified in both directions; callers retain responsibility for topology
 * between separate contours and shared color boundaries. No input is mutated. */
export function fitTraceBoundary(input: readonly CadPoint[], options: TraceFitOptions): CadContour {
  if (!options || !Number.isFinite(options.tolerance) || options.tolerance < .01 || options.tolerance > 5 ||
      typeof options.preserveCorners !== 'boolean' || options.closed !== undefined && typeof options.closed !== 'boolean') throw fail('geometry');
  const closed = options.closed ?? true, budget = options.budget ?? { remaining: MAX_TRACE_FIT_WORK };
  if (!Number.isSafeInteger(budget.remaining) || budget.remaining < 0) throw fail('geometry');
  if (!Array.isArray(input) || input.length > MAX_TRACE_BOUNDARY_POINTS) throw fail('limit');
  const points: CadPoint[] = [], indices: number[] = [];
  for (const p of input) {
    spend(budget); if (!validCadPoint(p)) throw fail('geometry');
    if (!points.length || !same(p, points.at(-1)!)) points.push({ x: p.x, y: p.y });
    indices.push(points.length - 1);
  }
  if (closed && points.length > 1 && same(points[0], points.at(-1)!)) {
    const last = points.length - 1; points.pop(); for (let i = 0; i < indices.length; i++) if (indices[i] === last) indices[i] = 0;
  }
  if (points.length < (closed ? 3 : 2)) throw fail('geometry');
  if (closed && Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y; }, 0)) <= EPS) throw fail('geometry');
  if (options.forcedCorners !== undefined && (!Array.isArray(options.forcedCorners) || options.forcedCorners.some(i => !Number.isInteger(i) || i < 0 || i >= input.length))) throw fail('geometry');
  const cornerSpan = Math.max(3, Math.min(8, options.tolerance * 4));
  const span = Math.max(6, Math.min(12, options.tolerance * 8));
  const corners = new Set(options.preserveCorners ? cornerIndices(points, closed, cornerSpan, budget) : []);
  for (const i of options.forcedCorners ?? []) corners.add(indices[i]);
  const anchors = new Set(corners);
  const straightAnchors = new Set(straightRunAnchors(points, closed, corners, span, budget));
  for (const i of straightAnchors) anchors.add(i);
  if (closed && anchors.size < 2) {
    let start = anchors.size ? [...anchors][0] : 0;
    const unbroken = !anchors.size;
    if (unbroken) {
      let minX = Infinity, low = Infinity, high = -Infinity;
      for (const point of points) {
        if (point.x < minX) { minX = point.x; low = high = point.y; }
        else if (point.x === minX) { low = Math.min(low, point.y); high = Math.max(high, point.y); }
      }
      const middle = (low + high) / 2;
      let best = Infinity;
      for (let i = 0; i < points.length; i++) if (points[i].x === minX && Math.abs(points[i].y - middle) < best) { best = Math.abs(points[i].y - middle); start = i; }
    }
    anchors.add(start);
    const lengths = [0];
    for (let i = 1; i <= points.length; i++) { spend(budget); lengths.push(lengths.at(-1)! + distance(points[(start + i - 1) % points.length], points[(start + i) % points.length])); }
    for (const fraction of unbroken ? [.25, .5, .75] : [.5]) {
      const target = lengths.at(-1)! * fraction; let index = 1;
      while (index < points.length - 1 && lengths[index] < target) index++;
      if (Math.abs(lengths[index - 1] - target) < Math.abs(lengths[index] - target)) index--;
      anchors.add((start + index) % points.length);
    }
  } else if (!closed) { anchors.add(0); anchors.add(points.length - 1); corners.add(0); corners.add(points.length - 1); }
  if (anchors.size >= MAX_NODES) throw fail('limit');
  const seam = closed ? Math.min(...anchors) : 0;
  // Grid stair vertices are outliers around a smooth boundary. Move only the
  // fitting samples a bounded fraction of tolerance; every accepted cubic is
  // still certified against the unmodified pixel edges below. Junctions,
  // detected corners and open endpoints are never moved.
  const fitting = points.map((point, i) => {
    spend(budget);
    if (corners.has(i) || straightAnchors.has(i) || !closed && (i === 0 || i === points.length - 1)) return point;
    const before = points[(i - 1 + points.length) % points.length], after = points[(i + 1) % points.length];
    const a = minus(point, before), b = minus(after, point);
    if (Math.abs(a.x * b.y - a.y * b.x) <= EPS && dot(a, b) > 0) return point;
    const delta = { x: (before.x - 2 * point.x + after.x) / 4, y: (before.y - 2 * point.y + after.y) / 4 };
    const length = Math.hypot(delta.x, delta.y), factor = length ? Math.min(1, options.tolerance * .4 / length) : 0;
    return { x: point.x + delta.x * factor, y: point.y + delta.y * factor };
  });
  const ordered = [...fitting.slice(seam), ...fitting.slice(0, seam)], original = [...points.slice(seam), ...points.slice(0, seam)];
  if (closed) { ordered.push(ordered[0]); original.push(original[0]); }
  const mapped = [...anchors].map(i => (i - seam + points.length) % points.length).sort((a, b) => a - b);
  if (closed) mapped.push(points.length);
  const tree = segmentTree(original, 0, original.length - 1, budget), curves: Cubic[] = [];
  const sharedTangent = (index: number) => {
    const original = (index + seam) % points.length;
    // A line anchor's tangent is exact. A shifted pixel turn just beyond its
    // tangent window must not turn a long straight side into a shallow arc.
    const samples = straightAnchors.has(original) ? points : fitting;
    return unit(minus(along(samples, original, 1, span, closed, 0, points.length - 1, budget),
      along(samples, original, -1, span, closed, 0, points.length - 1, budget)));
  };
  for (let part = 0; part < mapped.length - 1; part++) {
    const first = mapped[part], last = mapped[part + 1];
    const left = corners.has((first + seam) % points.length) ? unit(minus(along(ordered, first, 1, span, false, first, last, budget), ordered[first])) : sharedTangent(first);
    const right = corners.has((last + seam) % points.length) ? unit(minus(along(ordered, last, -1, span, false, first, last, budget), ordered[last])) : neg(sharedTangent(last));
    const stack = [{ first, last, left, right, depth: 0 }];
    while (stack.length) {
      spend(budget); const item = stack.pop()!, a = ordered[item.first], b = ordered[item.last], direction = unit(minus(b, a));
      let line = distance(a, b) > EPS && same(a, original[item.first]) && same(b, original[item.last]) &&
        dot(direction, item.left) > 1 - 1e-8 && dot(neg(direction), item.right) > 1 - 1e-8;
      if (line) for (let i = item.first + 1; i < item.last; i++) { spend(budget); if (segmentDistance2(original[i], a, b) > EPS * EPS) { line = false; break; } }
      let result: Cubic | null = line ? [a, a, b, b] : null;
      let u = parameters(ordered, item.first, item.last, budget), split = (item.first + item.last) >> 1;
      let fittedTangent: CadPoint | null = null;
      let fittedPoint: CadPoint | null = null;
      if (!result) for (let attempt = 0; attempt < 8; attempt++) {
        const cubic = generate(ordered, item.first, item.last, item.left, item.right, u, budget);
        if (acceptable(cubic, original, tree, item.first, item.last, options.tolerance, budget)) { result = cubic; break; }
        let worst = -1;
        for (let i = item.first + 1; i < item.last; i++) {
          spend(budget); const value = distance(evaluate(cubic, u[i - item.first]), ordered[i]);
          if (value > worst) { worst = value; split = i; }
        }
        const inset = Math.max(1, Math.floor((item.last - item.first) / 8));
        split = Math.max(item.first + inset, Math.min(item.last - inset, split));
        // A near-fitting smooth parent is a better tangent oracle than a few
        // quantized grid edges. Keep its direction when only the strict error
        // certificate requires a split; both children still need certification.
        fittedTangent = worst <= Math.max(1, options.tolerance * 2) ? unit(derivative(cubic, u[split - item.first])) : null;
        fittedPoint = fittedTangent ? evaluate(cubic, u[split - item.first]) : null;
        const next = refine(cubic, ordered, item.first, item.last, u, budget);
        if (!next) break;
        u = next;
      }
      if (!result && item.last - item.first === 1) {
        // Keep shared directions while shrinking a short span's handles until
        // its footprint fits. Zero-length handles are the exact final fallback.
        for (let scale = 1 / 3; scale >= 1 / 768; scale /= 2) {
          const length = distance(a, b) * scale;
          const cubic: Cubic = [a, { x: a.x + item.left.x * length, y: a.y + item.left.y * length },
            { x: b.x + item.right.x * length, y: b.y + item.right.y * length }, b];
          if (acceptable(cubic, original, tree, item.first, item.last, options.tolerance, budget)) { result = cubic; break; }
        }
        result ??= [a, a, b, b];
      }
      if (result) { curves.push(result); if (curves.length >= MAX_NODES) throw fail('limit'); continue; }
      if (item.depth >= MAX_DEPTH) throw fail('limit');
      split = Math.max(item.first + 1, Math.min(item.last - 1, split));
      const middle = fittedTangent && Math.hypot(fittedTangent.x, fittedTangent.y) > EPS ? fittedTangent : tangent(ordered, split, span, item.first, item.last, budget);
      if (fittedPoint) {
        // A subdivision is an editing anchor, not a requirement to interpolate
        // a noisy grid corner. Project it toward the near-fitting parent while
        // retaining a strict distance allowance from its original raw vertex.
        const raw = original[split], length = distance(raw, fittedPoint);
        ordered[split] = mix(raw, fittedPoint, length ? Math.min(1, options.tolerance * .9 / length) : 0);
      }
      stack.push({ first: split, last: item.last, left: middle, right: item.right, depth: item.depth + 1 },
        { first: item.first, last: split, left: item.left, right: neg(middle), depth: item.depth + 1 });
    }
  }
  const linear = curves.map(p => segmentDistance2(p[1], p[0], p[3]) <= EPS * EPS && segmentDistance2(p[2], p[0], p[3]) <= EPS * EPS);
  for (let i = 0; i < curves.length; i++) {
    if (!linear[i]) continue;
    const p = curves[i], direction = unit(minus(p[3], p[0])), length = distance(p[0], p[3]);
    const previous = i > 0 ? i - 1 : closed ? curves.length - 1 : -1, next = i < curves.length - 1 ? i + 1 : closed ? 0 : -1;
    p[1] = p[0]; p[2] = p[3];
    // Collinear handles retain smooth node editing at a line/curve junction;
    // standalone polygon edges keep zero handles and remain native DXF lines.
    if (previous >= 0 && !linear[previous] && dot(direction, unit(minus(curves[previous][3], curves[previous][2]))) > 1 - 1e-8) p[1] = mix(p[0], p[3], 1 / 3);
    if (next >= 0 && !linear[next] && dot(direction, unit(minus(curves[next][1], curves[next][0]))) > 1 - 1e-8) p[2] = { x: p[3].x - direction.x * length / 3, y: p[3].y - direction.y * length / 3 };
  }
  const nodes: CadBezierNode[] = [nodeAt(curves[0][0])];
  for (const p of curves) {
    const previous = nodes.at(-1)!, next = nodeAt(p[3]);
    previous.outX = p[1].x - p[0].x; previous.outY = p[1].y - p[0].y;
    next.inX = p[2].x - p[3].x; next.inY = p[2].y - p[3].y; nodes.push(next);
  }
  if (closed) { nodes[0].inX = nodes.at(-1)!.inX; nodes[0].inY = nodes.at(-1)!.inY; nodes.pop(); }
  const cornerPoints = new Set([...corners].map(i => `${points[i].x},${points[i].y}`));
  for (const node of nodes) {
    if (cornerPoints.has(`${node.x},${node.y}`)) continue;
    const a = Math.hypot(node.inX, node.inY), b = Math.hypot(node.outX, node.outY);
    if (a > EPS && b > EPS && Math.abs(node.inX * node.outY - node.inY * node.outX) <= a * b * 1e-7 && node.inX * node.outX + node.inY * node.outY < 0) node.mode = 'smooth';
  }
  const contour = { closed, nodes }; if (!validContours([contour])) throw fail('limit');
  return contour;
}
