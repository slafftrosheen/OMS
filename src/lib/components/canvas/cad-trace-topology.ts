import { flattenContours, nodeAt, validContours, type CadBezierNode, type CadContour } from './cad-curves';
import type { CadPoint } from './cad-settings';
import { fitTraceBoundary } from './cad-trace-fit';
import type { TraceBoundary } from './cad-trace-raster';

interface Chain {
  id: number; points: CadPoint[]; closed: boolean; forcedCorners: number[];
  contour?: CadContour; tolerance: number; straight: boolean;
}
interface Piece { chain: Chain; reverse: boolean; start: CadPoint }
const pointKey = (p: CadPoint) => `${p.x},${p.y}`;
const order = (a: CadPoint, b: CadPoint) => a.x - b.x || a.y - b.y;
const equal = (a: CadPoint, b: CadPoint) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-7;
const edgeKey = (a: CadPoint, b: CadPoint) => order(a, b) < 0 ? `${pointKey(a)}>${pointKey(b)}` : `${pointKey(b)}>${pointKey(a)}`;
const cross = (a: CadPoint, b: CadPoint, c: CadPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const area = (points: CadPoint[]) => points.reduce((sum, p, i) => {
  const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y;
}, 0) / 2;
const reverseNodes = (nodes: CadBezierNode[]) => nodes.slice().reverse().map(p => ({ ...p,
  inX: p.outX, inY: p.outY, outX: p.inX, outY: p.inY }));

/** Canonicalizing entire shared chains, rather than fitting each color's ring
 * independently, makes their cubic handles identical in reverse. No cracks or
 * overlapping fills can appear at a color boundary due to different fits. */
function traceChains(boundaries: TraceBoundary[], tolerance: number) {
  const owners = new Map<string, number[]>(), neighbours = new Map<string, Set<string>>();
  boundaries.forEach((boundary, index) => boundary.points.forEach((p, i, all) => {
    const q = all[(i + 1) % all.length], key = edgeKey(p, q), ids = owners.get(key) ?? [];
    if (!ids.includes(index)) ids.push(index);
    if (ids.length > 2) throw new Error('geometry');
    owners.set(key, ids);
    for (const [a, b] of [[p, q], [q, p]]) {
      const key = pointKey(a), set = neighbours.get(key) ?? new Set(); set.add(pointKey(b)); neighbours.set(key, set);
    }
  }));
  const junctions = new Set([...neighbours].filter(([, values]) => values.size > 2).map(([key]) => key));
  const cache = new Map<string, Chain>(), chains: Chain[] = [];
  const make = (input: CadPoint[], closed: boolean): Piece => {
    let points = input.slice(), reverse = false;
    if (points.length > 1 && equal(points[0], points.at(-1)!)) { points.pop(); closed = true; }
    if (closed) {
      let first = 0;
      for (let i = 1; i < points.length; i++) if (order(points[i], points[first]) < 0) first = i;
      points = [...points.slice(first), ...points.slice(0, first)];
      if (order(points[1], points.at(-1)!) > 0) { points = [points[0], ...points.slice(1).reverse()]; reverse = true; }
    } else if (order(points[0], points.at(-1)!) > 0) { points.reverse(); reverse = true; }
    const key = `${closed ? 'c' : 'o'}:${points.map(pointKey).join(';')}`;
    let chain = cache.get(key);
    if (!chain) {
      chain = { id: chains.length, points, closed, tolerance, straight: false,
        forcedCorners: points.flatMap((p, i) => junctions.has(pointKey(p)) ? [i] : []) };
      cache.set(key, chain); chains.push(chain);
    }
    return { chain, reverse, start: input[0] };
  };
  const rings = boundaries.map(boundary => {
    const points = boundary.points, n = points.length;
    const signatures = points.map((p, i) => owners.get(edgeKey(p, points[(i + 1) % n]))!.join(','));
    const cuts = points.flatMap((p, i) => junctions.has(pointKey(p)) || signatures[i] !== signatures[(i + n - 1) % n] ? [i] : []);
    if (cuts.length < 2) return [make(points, true)];
    return cuts.map((start, i) => {
      const end = cuts[(i + 1) % cuts.length], span = end > start ? points.slice(start, end + 1) : [...points.slice(start), ...points.slice(0, end + 1)];
      return make(span, false);
    });
  });
  return { chains, rings, junctions };
}

function rawContour(chain: Chain): CadContour {
  const points = chain.points, forced = new Set(chain.forcedCorners);
  return { closed: chain.closed, nodes: points.filter((p, i) => {
    if (forced.has(i) || !chain.closed && (i === 0 || i === points.length - 1)) return true;
    const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length];
    return Math.abs(cross(a, p, b)) > 1e-9 || (p.x - a.x) * (b.x - p.x) + (p.y - a.y) * (b.y - p.y) <= 0;
  }).map(nodeAt) };
}
function assemble(pieces: Piece[]): CadContour {
  const nodes: CadBezierNode[] = [];
  for (const piece of pieces) {
    let part = piece.reverse ? reverseNodes(piece.chain.contour!.nodes) : piece.chain.contour!.nodes.map(p => ({ ...p }));
    if (pieces.length === 1 && piece.chain.closed) return { closed: true, nodes: part };
    if (piece.chain.closed) {
      const index = part.findIndex(p => equal(p, piece.start));
      if (index < 0) throw new Error('geometry');
      part = [...part.slice(index), ...part.slice(0, index)];
      part.push({ ...part[0], outX: 0, outY: 0, mode: 'corner' });
    }
    if (!nodes.length) nodes.push(...part);
    else {
      const previous = nodes.at(-1)!, first = part[0];
      if (!equal(previous, first)) throw new Error('geometry');
      previous.outX = first.outX; previous.outY = first.outY; previous.mode = 'corner'; nodes.push(...part.slice(1));
    }
  }
  if (!nodes.length || !equal(nodes[0], nodes.at(-1)!)) throw new Error('geometry');
  const last = nodes.pop()!; nodes[0].inX = last.inX; nodes[0].inY = last.inY; nodes[0].mode = 'corner';
  return { closed: true, nodes };
}

interface Box { minX: number; minY: number; maxX: number; maxY: number }
const bounds = (points: CadPoint[]): Box => points.reduce((box, p) => ({ minX: Math.min(box.minX, p.x), minY: Math.min(box.minY, p.y),
  maxX: Math.max(box.maxX, p.x), maxY: Math.max(box.maxY, p.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
function contains(points: CadPoint[], point: CadPoint, budget: { remaining: number }): boolean {
  let inside = false;
  for (let i = 0; i < points.length; i++) {
    if (--budget.remaining < 0) throw new Error('limit');
    const a = points[i], b = points[(i + 1) % points.length];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
/** A pixel-row interior witness avoids using a concave polygon's centroid,
 * which can lie outside its own boundary. The widest sampled interval is
 * stable under small fits; thin features still have their own interior test. */
function witness(points: CadPoint[]): CadPoint {
  const box = bounds(points), rows = new Set([Math.floor((box.minY + box.maxY) / 2) + .5]);
  for (let i = 0; i < points.length; i += Math.max(1, Math.floor(points.length / 32))) rows.add(Math.min(box.maxY - .5, Math.max(box.minY + .5, Math.floor(points[i].y) + .5)));
  let best: CadPoint | null = null, width = 0;
  for (const y of rows) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if ((a.y > y) !== (b.y > y)) xs.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > width) { width = xs[i + 1] - xs[i]; best = { x: (xs[i] + xs[i + 1]) / 2, y }; }
  }
  if (!best || width <= 0) throw new Error('geometry');
  return best;
}
interface Segment extends Box { a: CadPoint; b: CadPoint; chain: number; index: number; count: number; closed: boolean }
function unsafeIntersection(a: Segment, b: Segment, junctions: Set<string>): boolean {
  const dx = a.b.x - a.a.x, dy = a.b.y - a.a.y, ex = b.b.x - b.a.x, ey = b.b.y - b.a.y;
  const det = dx * ey - dy * ex, qx = b.a.x - a.a.x, qy = b.a.y - a.a.y, epsilon = 1e-8;
  const knownContact = (point: CadPoint) => {
    if (!(equal(point, a.a) || equal(point, a.b)) || !(equal(point, b.a) || equal(point, b.b))) return false;
    const integer = { x: Math.round(point.x), y: Math.round(point.y) };
    return equal(point, integer) && junctions.has(pointKey(integer));
  };
  if (Math.abs(det) > epsilon) {
    const t = (qx * ey - qy * ex) / det, u = (qx * dy - qy * dx) / det;
    if (t < -epsilon || t > 1 + epsilon || u < -epsilon || u > 1 + epsilon) return false;
    return !knownContact({ x: a.a.x + t * dx, y: a.a.y + t * dy });
  }
  if (Math.abs(qx * dy - qy * dx) > epsilon) return false;
  const axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  const lo = Math.max(Math.min(a.a[axis], a.b[axis]), Math.min(b.a[axis], b.b[axis]));
  const hi = Math.min(Math.max(a.a[axis], a.b[axis]), Math.max(b.a[axis], b.b[axis]));
  if (hi < lo - epsilon) return false;
  if (hi - lo > epsilon) return true;
  const point = [a.a, a.b, b.a, b.b].find(p => Math.abs(p[axis] - lo) <= epsilon)!;
  return !point || !knownContact(point);
}

function topologyIssues(chains: Chain[], rings: Piece[][], contours: CadContour[], original: TraceBoundary[], junctions: Set<string>, witnesses: CadPoint[]): Set<number> {
  const bad = new Set<number>(), segments: Segment[] = [], budget = { remaining: 20000000 };
  const flattenTolerance = .02;
  for (const chain of chains) {
    const points = flattenContours([chain.contour!], flattenTolerance, 65536)[0], count = points.length - (chain.closed ? 0 : 1);
    if (segments.length + count > 65536) throw new Error('limit');
    for (let i = 0; i < count; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if (equal(a, b)) continue;
      segments.push({ a, b, chain: chain.id, index: i, count, closed: chain.closed, minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) });
    }
  }
  segments.sort((a, b) => a.minX - b.minX || a.minY - b.minY);
  for (let i = 0; i < segments.length; i++) {
    const a = segments[i];
    for (let j = i + 1; j < segments.length && segments[j].minX <= a.maxX + 1e-8; j++) {
      if (--budget.remaining < 0) throw new Error('limit');
      const b = segments[j];
      if (a.maxY < b.minY - 1e-8 || b.maxY < a.minY - 1e-8) continue;
      if (a.chain === b.chain && (Math.abs(a.index - b.index) === 1 || a.closed && Math.abs(a.index - b.index) === a.count - 1)) continue;
      if (unsafeIntersection(a, b, junctions)) { bad.add(a.chain); bad.add(b.chain); }
    }
  }
  const flats = contours.map(contour => flattenContours([contour], flattenTolerance, 65536)[0]);
  const boxes = flats.map(bounds), rawBoxes = original.map(p => bounds(p.points));
  const mark = (index: number) => rings[index].forEach(piece => bad.add(piece.chain.id));
  for (let i = 0; i < flats.length; i++) {
    if (area(flats[i]) * area(original[i].points) <= 0 || !contains(flats[i], witnesses[i], budget)) mark(i);
    for (let j = 0; j < flats.length; j++) {
      if (i === j) continue;
      const p = witnesses[j], a = boxes[i], b = rawBoxes[i];
      const inBox = p.x >= a.minX && p.x <= a.maxX && p.y >= a.minY && p.y <= a.maxY;
      const inRawBox = p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
      if (!inBox && !inRawBox) continue;
      const before = inRawBox && contains(original[i].points, p, budget), after = inBox && contains(flats[i], p, budget);
      if (before !== after) { mark(i); mark(j); }
    }
  }
  return bad;
}

/** Reject observed changes to component/hole relationships. Retry
 * only affected shared chains at a tighter tolerance, then preserve their raw
 * corners if needed. The worker applies an independent total time limit. */
export function fitTraceBoundaries(boundaries: TraceBoundary[], tolerance: number, preserveCorners: boolean): { contours: CadContour[]; conservative: boolean } {
  const { chains, rings, junctions } = traceChains(boundaries, tolerance), witnesses = boundaries.map(p => witness(p.points));
  const budget = { remaining: 32000000 };
  let conservative = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const chain of chains) if (!chain.contour) chain.contour = chain.straight ? rawContour(chain) : fitTraceBoundary(chain.points, {
      tolerance: chain.tolerance, preserveCorners, closed: chain.closed, forcedCorners: chain.forcedCorners, budget,
    });
    const contours = rings.map(assemble);
    if (!validContours(contours)) throw new Error('limit');
    const bad = topologyIssues(chains, rings, contours, boundaries, junctions, witnesses);
    if (!bad.size) return { contours, conservative };
    conservative = true;
    if (attempt === 3) throw new Error('geometry');
    for (const id of bad) {
      const chain = chains[id]; chain.contour = undefined;
      if (attempt === 2) chain.straight = true;
      else chain.tolerance = Math.max(.025, chain.tolerance / 2);
    }
  }
  throw new Error('geometry');
}
