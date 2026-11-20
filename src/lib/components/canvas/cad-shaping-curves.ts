import { cubicPoints, nodeAt, splitCubic, type CadContour } from './cad-curves';
import type { CadPoint } from './cad-settings';

export type PolygonPoint = { X: number; Y: number };
export type Polygon = PolygonPoint[];
type Bounds = { left: number; right: number; top: number; bottom: number };
type Span = {
  contour: CadContour;
  index: number;
  controls: CadPoint[];
  bounds: Bounds;
  halves: Bounds[];
  samples: Polygon;
};
type Candidate = { span: Span; reverse: boolean };
const RESTORATION_COMPARISON_LIMIT = 250000;

const box = (points: CadPoint[]): Bounds => ({
  left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
  top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y))
});
const separated = (a: Bounds, b: Bounds, margin: number) =>
  a.right + margin < b.left || b.right + margin < a.left ||
  a.bottom + margin < b.top || b.bottom + margin < a.top;
const key = (p: PolygonPoint) => `${p.X},${p.Y}`;
const edge = (a: PolygonPoint, b: PolygonPoint) => `${key(a)}:${key(b)}`;
const same = (a: PolygonPoint, b: PolygonPoint) => a.X === b.X && a.Y === b.Y;

export function shapingSpan(
  contour: CadContour, index: number, samples: Polygon, toClipSpace: (p: CadPoint) => CadPoint
): Span {
  const controls = cubicPoints(contour.nodes[index], contour.nodes[(index + 1) % contour.nodes.length]).map(toClipSpace);
  return { contour, index, controls, bounds: box(controls), halves: splitCubic(controls).map(box), samples };
}

function monotoneAlongChord([a, b, c, d]: CadPoint[]) {
  const x = d.x - a.x, y = d.y - a.y;
  const length = x * x + y * y;
  const t1 = (b.x - a.x) * x + (b.y - a.y) * y;
  const t2 = (c.x - a.x) * x + (c.y - a.y) * y;
  return length > 0 && t1 >= 0 && t1 <= t2 && t2 <= length;
}

/** Adjacent source spans may share an endpoint. A separating axis through that
 * endpoint guarantees the interiors stay on opposite sides of the join. */
function cleanJoin(a: Span, b: Span): boolean {
  if (a.contour !== b.contour) return false;
  const count = a.contour.nodes.length;
  const join = (a.index + 1) % count === b.index ? a.controls[3]
    : (b.index + 1) % count === a.index ? b.controls[3] : null;
  if (!join) return false;
  const halfspaces = (minA: number, maxA: number, minB: number, maxB: number, at: number) =>
    minA < at && maxA <= at && minB >= at && maxB > at ||
    minB < at && maxB <= at && minA >= at && maxA > at;
  return halfspaces(a.bounds.left, a.bounds.right, b.bounds.left, b.bounds.right, join.x) ||
    halfspaces(a.bounds.top, a.bounds.bottom, b.bounds.top, b.bounds.bottom, join.y);
}

/** The polygon result stays authoritative at cuts, contacts and ambiguous
 * edges. Reuse only entire matched spans with clearance from nearby inputs.
 * Mixed joins stay on the clip grid. Joins between adjacent spans from the
 * same source retain the original anchor and edit mode. */
export function restoreShapingCurves(
  polygons: Polygon[], spans: Span[], clearance: number, toPage: (p: PolygonPoint) => CadPoint
): { contours: CadContour[]; restored: number } {
  if (!spans.length) return {
    contours: polygons.map(path => ({ closed: true, nodes: path.map(point => nodeAt(toPage(point))) })),
    restored: 0
  };
  const candidates = new Map<string, Candidate | null>();
  const add = (id: string, candidate: Candidate) => candidates.set(id, candidates.has(id) ? null : candidate);
  const boundaryEdges = new Set<string>();
  for (const path of polygons) path.forEach((point, i) => boundaryEdges.add(edge(point, path[(i + 1) % path.length])));

  // Clipper works with up to 50,000 vertices. Bound the optional restoration
  // cost separately so dense artwork can still use the existing polygon path.
  let comparisons = 0;
  for (const span of spans) {
    if (comparisons >= RESTORATION_COMPARISON_LIMIT) break;
    const points = span.samples, [a, b, c, d] = span.controls;
    if (points.length < 2 || same(points[0], points.at(-1)!) ||
        b.x === a.x && b.y === a.y && c.x === d.x && c.y === d.y ||
        !monotoneAlongChord(span.controls)) continue;
    const forward = edge(points[0], points[1]), reverse = edge(points.at(-1)!, points.at(-2)!);
    if (!boundaryEdges.has(forward) && !boundaryEdges.has(reverse)) continue;
    const clear = spans.every(other => {
      if (other === span) return true;
      if (++comparisons > RESTORATION_COMPARISON_LIMIT) return false;
      return separated(span.bounds, other.bounds, clearance) || cleanJoin(span, other) ||
        span.halves.every(first => other.halves.every(second => separated(first, second, clearance)));
    });
    if (!clear) continue;
    if (boundaryEdges.has(forward)) add(forward, { span, reverse: false });
    if (boundaryEdges.has(reverse)) add(reverse, { span, reverse: true });
  }

  let restored = 0;
  const contours: CadContour[] = polygons.map(path => {
    const nodes = path.map(point => nodeAt(toPage(point)));
    const usedEdges = new Set<number>(), interiors = new Set<number>();
    const starts = new Map<number, Candidate>(), ends = new Map<number, Candidate>();
    for (let i = 0; i < path.length; i++) {
      if (usedEdges.has(i)) continue;
      const candidate = candidates.get(edge(path[i], path[(i + 1) % path.length]));
      if (!candidate) continue;
      const { span, reverse } = candidate, last = span.samples.length - 1;
      if (last >= path.length || !span.samples.every((_, j) => {
        const k = (i + j) % path.length;
        return same(path[k], span.samples[reverse ? last - j : j]) && (j === last || !usedEdges.has(k));
      })) continue;
      const endIndex = (i + last) % path.length;
      starts.set(i, candidate); ends.set(endIndex, candidate);
      const start = nodes[i], end = nodes[endIndex];
      const control = (index: number) => {
        const point = span.controls[index];
        return toPage({ X: point.x, Y: point.y });
      };
      const out = control(reverse ? 2 : 1), incoming = control(reverse ? 1 : 2);
      start.outX = out.x - start.x; start.outY = out.y - start.y;
      end.inX = incoming.x - end.x; end.inY = incoming.y - end.y;
      for (let j = 0; j < last; j++) {
        const k = (i + j) % path.length;
        usedEdges.add(k);
        if (j > 0) interiors.add(k);
      }
      restored++;
    }
    for (const [index, { span, reverse }] of starts) {
      const incoming = ends.get(index);
      if (!incoming || incoming.reverse !== reverse || incoming.span.contour !== span.contour) continue;
      const count = span.contour.nodes.length;
      const sourceIndex = reverse ? (span.index + 1) % count : span.index;
      const arrival = reverse ? incoming.span.index : (incoming.span.index + 1) % count;
      if (sourceIndex !== arrival) continue;
      const node = span.contour.nodes[sourceIndex];
      nodes[index] = reverse ? { ...node, inX: node.outX, inY: node.outY, outX: node.inX, outY: node.inY } : { ...node };
    }
    return { closed: true, nodes: nodes.filter((_, index) => !interiors.has(index)) };
  });
  return { contours, restored };
}
