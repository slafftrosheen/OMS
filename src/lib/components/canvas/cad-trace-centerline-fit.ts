import { flattenContours, nodeAt, validContours, type CadContour } from './cad-curves';
import { fitTraceBoundary, MAX_TRACE_BOUNDARY_POINTS } from './cad-trace-fit';
import { validCadPoint, type CadPoint } from './cad-settings';

export interface CenterlineChain {
  points: CadPoint[];
  closed: boolean;
  /** Attached loops retain the junction even when smooth corners are requested. */
  forcedCorners?: number[];
}
interface Box { minX: number; minY: number; maxX: number; maxY: number }
interface Segment extends Box { a: CadPoint; b: CadPoint; chain: number; index: number; count: number; closed: boolean }
type SegmentTree = Box & ({ segments: Segment[] } | { left: SegmentTree; right: SegmentTree });
interface FitState extends CenterlineChain { tolerance: number; contour?: CadContour; raw: boolean }
interface Budget { remaining: number }
const EPS = 1e-7, MAX_SEGMENTS = 131072;
const key = (p: CadPoint) => `${Math.round(p.x * 1e7)},${Math.round(p.y * 1e7)}`;
const equal = (a: CadPoint, b: CadPoint) => Math.hypot(a.x - b.x, a.y - b.y) < EPS;
const cross = (a: CadPoint, b: CadPoint, c: CadPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const area = (points: CadPoint[]) => points.reduce((sum, p, i) => {
  const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y;
}, 0) / 2;
const spend = (budget: Budget, count = 1) => { budget.remaining -= count; if (budget.remaining < 0) throw new Error('limit'); };
const pointInBox = (p: CadPoint, b: Box) => p.x >= b.minX - EPS && p.x <= b.maxX + EPS && p.y >= b.minY - EPS && p.y <= b.maxY + EPS;
const boxesMeet = (a: Box, b: Box) => a.maxX >= b.minX - EPS && b.maxX >= a.minX - EPS && a.maxY >= b.minY - EPS && b.maxY >= a.minY - EPS;
const bounds = (points: CadPoint[]): Box => points.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y),
  maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

function segments(points: CadPoint[], chain: number, closed: boolean, budget: Budget): Segment[] {
  const result: Segment[] = [], count = points.length - Number(!closed);
  for (let index = 0; index < count; index++) {
    spend(budget);
    const a = points[index], b = points[(index + 1) % points.length];
    if (equal(a, b)) continue;
    result.push({ a, b, chain, index, count, closed, minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
      minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) });
  }
  return result;
}

/** Index both axes so separated horizontal and vertical strokes cost alike.
 * Median partitions bound depth; all construction and lookup work shares the
 * topology budget. The immutable raw hierarchy survives conservative retries. */
function segmentTree(input: Segment[], budget: Budget): SegmentTree {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const segment of input) {
    spend(budget);
    box.minX = Math.min(box.minX, segment.minX); box.minY = Math.min(box.minY, segment.minY);
    box.maxX = Math.max(box.maxX, segment.maxX); box.maxY = Math.max(box.maxY, segment.maxY);
  }
  if (input.length <= 16) return { ...box, segments: input };
  const horizontal = box.maxX - box.minX >= box.maxY - box.minY;
  input.sort((a, b) => {
    spend(budget);
    return horizontal ? a.minX + a.maxX - b.minX - b.maxX : a.minY + a.maxY - b.minY - b.maxY;
  });
  const middle = input.length >>> 1;
  spend(budget, input.length);
  return { ...box, left: segmentTree(input.slice(0, middle), budget), right: segmentTree(input.slice(middle), budget) };
}

/** A contact is legal only at a shared, original graph vertex. Fractional
 * junction anchors from a contracted pixel cluster are valid too. */
function unsafeIntersection(a: Segment, b: Segment, contacts: Map<string, CadPoint>): boolean {
  const dx = a.b.x - a.a.x, dy = a.b.y - a.a.y, ex = b.b.x - b.a.x, ey = b.b.y - b.a.y;
  const det = dx * ey - dy * ex, qx = b.a.x - a.a.x, qy = b.a.y - a.a.y;
  const known = (p: CadPoint) => {
    const original = contacts.get(key(p));
    return !!original && equal(p, original) && (equal(p, a.a) || equal(p, a.b)) && (equal(p, b.a) || equal(p, b.b));
  };
  if (Math.abs(det) > 1e-8) {
    const t = (qx * ey - qy * ex) / det, u = (qx * dy - qy * dx) / det;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return false;
    return !known({ x: a.a.x + t * dx, y: a.a.y + t * dy });
  }
  if (Math.abs(qx * dy - qy * dx) > EPS) return false;
  const axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  const lo = Math.max(Math.min(a.a[axis], a.b[axis]), Math.min(b.a[axis], b.b[axis]));
  const hi = Math.min(Math.max(a.a[axis], a.b[axis]), Math.max(b.a[axis], b.b[axis]));
  if (hi < lo - EPS) return false;
  if (hi - lo > EPS) return true;
  const p = [a.a, a.b, b.a, b.b].find(p => Math.abs(p[axis] - lo) <= EPS);
  return !p || !known(p);
}

function intersectsOriginal(a: Segment, tree: SegmentTree, contacts: Map<string, CadPoint>, budget: Budget): boolean {
  const pending = [tree];
  while (pending.length) {
    spend(budget);
    const node = pending.pop()!;
    if (!boxesMeet(a, node)) continue;
    if ('segments' in node) {
      for (const b of node.segments) {
        spend(budget);
        if (a.chain !== b.chain && boxesMeet(a, b) && unsafeIntersection(a, b, contacts)) return true;
      }
    } else pending.push(node.left, node.right);
  }
  return false;
}

function classify(points: CadPoint[], point: CadPoint, budget: Budget): -1 | 0 | 1 {
  let inside = false;
  for (let i = 0; i < points.length; i++) {
    spend(budget);
    const a = points[i], b = points[(i + 1) % points.length];
    if (Math.abs(cross(a, b, point)) < EPS && point.x >= Math.min(a.x, b.x) - EPS && point.x <= Math.max(a.x, b.x) + EPS &&
        point.y >= Math.min(a.y, b.y) - EPS && point.y <= Math.max(a.y, b.y) + EPS) return 0;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < a.x + (point.y - a.y) * (b.x - a.x) / (b.y - a.y)) inside = !inside;
  }
  return inside ? 1 : -1;
}
function representative(points: CadPoint[], closed: boolean): CadPoint {
  let length = -1, result = points[0];
  for (let i = 0; i < points.length - Number(!closed); i++) {
    const a = points[i], b = points[(i + 1) % points.length], size = Math.hypot(b.x - a.x, b.y - a.y);
    if (size > length) { length = size; result = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  }
  return result;
}

function exactContour(chain: CenterlineChain): CadContour {
  const forced = new Set(chain.forcedCorners), points = chain.points;
  return { closed: chain.closed, nodes: points.filter((point, i) => {
    if (forced.has(i) || !chain.closed && (i === 0 || i === points.length - 1)) return true;
    const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length];
    return Math.abs(cross(a, point, b)) > 1e-10 || (point.x - a.x) * (b.x - point.x) + (point.y - a.y) * (b.y - point.y) <= 0;
  }).map(nodeAt) };
}

function topologyIssues(states: FitState[], rawTree: SegmentTree, contacts: Map<string, CadPoint>, budget: Budget): Set<number> {
  const bad = new Set<number>(), fitted: Segment[] = [];
  const polygons = states.map(state => state.raw ? state.contour!.nodes.map(p => ({ x: p.x, y: p.y }))
    : flattenContours([state.contour!], .01, 65536)[0]);
  polygons.forEach((points, i) => {
    fitted.push(...segments(points, i, states[i].closed, budget));
    if (fitted.length > MAX_SEGMENTS) throw new Error('limit');
  });
  fitted.sort((a, b) => a.minX - b.minX || a.minY - b.minY);
  for (let i = 0; i < fitted.length; i++) {
    const a = fitted[i];
    for (let j = i + 1; j < fitted.length && fitted[j].minX <= a.maxX + EPS; j++) {
      spend(budget);
      const b = fitted[j];
      if (!boxesMeet(a, b) || a.chain === b.chain && (Math.abs(a.index - b.index) === 1 || a.closed && Math.abs(a.index - b.index) === a.count - 1)) continue;
      if (unsafeIntersection(a, b, contacts)) { bad.add(a.chain); bad.add(b.chain); }
    }
  }
  // Compare fitted curves with the other *original* chains too. Two close
  // branches must not exchange sides while ending with no mutual crossing.
  for (const a of fitted) if (intersectsOriginal(a, rawTree, contacts, budget)) bad.add(a.chain);
  const rawBoxes = states.map(s => bounds(s.points)), fitBoxes = polygons.map(bounds);
  const rawWitnesses = states.map(s => representative(s.points, s.closed)), fitWitnesses = polygons.map((p, i) => representative(p, states[i].closed));
  for (let i = 0; i < states.length; i++) {
    if (!states[i].closed) continue;
    if (area(states[i].points) * area(polygons[i]) <= 0) bad.add(i);
    for (let j = 0; j < states.length; j++) {
      spend(budget);
      if (i === j) continue;
      const before = pointInBox(rawWitnesses[j], rawBoxes[i]) ? classify(states[i].points, rawWitnesses[j], budget) : -1;
      const after = pointInBox(fitWitnesses[j], fitBoxes[i]) ? classify(polygons[i], fitWitnesses[j], budget) : -1;
      if (before !== after) { bad.add(i); bad.add(j); }
    }
  }
  return bad;
}

/** Fits skeleton chains with exact shared junctions. The existing fitter bounds
 * deviation from each raw centerline in both directions; this guard checks
 * observed crossings and loop relationships at a 0.01 px flattening tolerance.
 * Retry only affected chains, then retain their exact pixel graph if necessary.
 * This is not a proof of topology between arbitrarily close analytic curves. */
export function fitCenterlineChains(input: CenterlineChain[], tolerance: number, preserveCorners: boolean): { contours: CadContour[]; conservative: boolean } {
  if (!Array.isArray(input) || !input.length || input.length > 512 || input.reduce((n, chain) => n + (chain?.points?.length ?? 0), 0) > MAX_TRACE_BOUNDARY_POINTS)
    throw new Error('limit');
  if (!Number.isFinite(tolerance) || tolerance < .01 || tolerance > 5 || typeof preserveCorners !== 'boolean') throw new Error('geometry');
  const owners = new Map<string, { point: CadPoint; chain: number; shared: boolean }>();
  input.forEach((chain, id) => {
    if (!chain || typeof chain.closed !== 'boolean' || !Array.isArray(chain.points) || chain.points.length < (chain.closed ? 3 : 2) ||
        chain.points.some((p, i) => !validCadPoint(p) || i > 0 && equal(p, chain.points[i - 1])) ||
        chain.closed && (equal(chain.points[0], chain.points.at(-1)!) || Math.abs(area(chain.points)) < EPS) ||
        chain.forcedCorners !== undefined && (!Array.isArray(chain.forcedCorners) || chain.forcedCorners.some(i => !Number.isInteger(i) || i < 0 || i >= chain.points.length))) throw new Error('geometry');
    chain.points.forEach(point => {
      const code = key(point), previous = owners.get(code);
      if (previous) { if (previous.chain !== id) previous.shared = true; }
      else owners.set(code, { point, chain: id, shared: false });
    });
  });
  const contacts = new Map([...owners].filter(([, value]) => value.shared).map(([code, value]) => [code, value.point]));
  const states: FitState[] = input.map(chain => ({ ...chain, points: chain.points.map(p => ({ ...p })), tolerance, raw: false,
    forcedCorners: [...new Set([...(chain.forcedCorners ?? []), ...chain.points.flatMap((p, i) => contacts.has(key(p)) ? [i] : [])])] }));
  const fitBudget = { remaining: 32000000 }, topologyBudget = { remaining: 20000000 };
  const rawSegments = states.flatMap((state, i) => segments(state.points, i, state.closed, topologyBudget));
  if (rawSegments.length > MAX_SEGMENTS) throw new Error('limit');
  const rawTree = segmentTree(rawSegments, topologyBudget);
  let conservative = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const state of states) if (!state.contour) {
      const exact = exactContour(state);
      state.contour = state.raw || !state.closed && exact.nodes.length === 2 ? exact : fitTraceBoundary(state.points, {
        tolerance: state.tolerance, preserveCorners, closed: state.closed, forcedCorners: state.forcedCorners, budget: fitBudget,
      });
    }
    const contours = states.map(state => state.contour!);
    if (!validContours(contours)) throw new Error('limit');
    const bad = topologyIssues(states, rawTree, contacts, topologyBudget);
    if (!bad.size) return { contours, conservative };
    if (attempt === 3) throw new Error('geometry');
    conservative = true;
    for (const index of bad) {
      const state = states[index]; state.contour = undefined;
      if (attempt === 2) state.raw = true;
      else state.tolerance = Math.max(.01, state.tolerance / 2);
    }
  }
  throw new Error('geometry');
}
