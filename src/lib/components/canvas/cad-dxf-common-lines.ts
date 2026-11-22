import { nodeAt, type CadBezierNode } from './cad-curves';
import type { DxfEntity } from './cad-dxf';
import type { CadPoint } from './cad-settings';

// Model-space roundoff tolerances, independent of curve flattening.
const MATCH_MM = 1e-6;
const SLOPE_TOLERANCE = 1e-8;
const MAX_COMPARISONS = 2_000_000;
const MAX_SPLIT_INTERVALS = 100_000;

type Axis = 'x' | 'y';
type Interval = [number, number];
type Edge = { entity: number; segment: number; a: CadPoint; b: CadPoint; rgb?: string };
type Line = { axis: Axis; slope: number; offset: number };
type Group = { line: Line; anchor: CadPoint; edges: Edge[] };
type Cut = { axis: Axis; intervals: Interval[] };

const other = (axis: Axis): Axis => axis === 'x' ? 'y' : 'x';
const copyPoint = ({ x, y }: CadPoint) => ({ x, y });

function straightEdges(entities: DxfEntity[]) {
  const contours = new Map<number, CadBezierNode[]>();
  const edges: Edge[] = [];
  let extent = 0;
  for (const [entity, source] of entities.entries()) {
    const nodes = source.type === 'polyline' && source.closed ? source.points.map(nodeAt)
      : source.type === 'spline' && source.contour.closed ? source.contour.nodes : undefined;
    if (!nodes) continue;
    contours.set(entity, nodes);
    for (const [segment, a] of nodes.entries()) {
      const b = nodes[(segment + 1) % nodes.length];
      if (a.outX || a.outY || b.inX || b.inY ||
          Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= MATCH_MM) continue;
      edges.push({ entity, segment, a, b, rgb: source.rgb });
      extent = Math.max(extent, Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y));
    }
  }
  return { contours, edges, extent };
}

function lineParameters({ a, b }: Edge): Line[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const main: Axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
  const describe = (axis: Axis): Line => {
    const slope = (b[other(axis)] - a[other(axis)]) / (b[axis] - a[axis]);
    return { axis, slope, offset: a[other(axis)] - slope * a[axis] };
  };
  // An alternate bounded slope keeps nearly diagonal lines in the same group
  // when rounding makes different spans choose different dominant axes.
  return Math.min(Math.abs(dx), Math.abs(dy)) * 2 >= Math.max(Math.abs(dx), Math.abs(dy))
    ? [describe(main), describe(other(main))] : [describe(main)];
}

function pointOnLine(group: Group, position: number): CadPoint {
  const { line: { axis, slope }, anchor } = group;
  const secondary = anchor[other(axis)] + (position - anchor[axis]) * slope;
  return axis === 'x' ? { x: position, y: secondary } : { x: secondary, y: position };
}

function groupEdges(edges: Edge[], extent: number) {
  const offsetStep = 4 * MATCH_MM + 2 * SLOPE_TOLERANCE * extent;
  const groups: Group[] = [], buckets = new Map<string, Array<{ group: Group; slope: number }>>();
  let comparisons = 0;
  for (const edge of edges) {
    const lines = lineParameters(edge);
    const bucketKey = (axis: Axis, s: number, d: number) => `${axis}:${s}:${d}:${edge.rgb ?? ''}`;
    const accepted = lines.some(({ axis, slope, offset }) => {
      const s = Math.floor(slope / SLOPE_TOLERANCE), d = Math.floor(offset / offsetStep);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        for (const entry of buckets.get(bucketKey(axis, s + i, d + j)) ?? []) {
          if (++comparisons > MAX_COMPARISONS) throw new RangeError('DXF common-line comparison limit');
          if (Math.abs(slope - entry.slope) > SLOPE_TOLERANCE) continue;
          const { group } = entry, main = group.line.axis, secondary = other(main);
          if ([edge.a, edge.b].every(p => Math.abs(pointOnLine(group, p[main])[secondary] - p[secondary]) <= MATCH_MM)) {
            group.edges.push(edge);
            return true;
          }
        }
      }
      return false;
    });
    if (accepted) continue;
    const group = { line: lines[0], anchor: edge.a, edges: [edge] };
    groups.push(group);
    for (const { axis, slope, offset } of lines) {
      const key = bucketKey(axis, Math.floor(slope / SLOPE_TOLERANCE), Math.floor(offset / offsetStep));
      const entries = buckets.get(key) ?? [];
      entries.push({ group, slope });
      buckets.set(key, entries);
    }
  }
  return groups.filter(group => group.edges.some(edge => edge.entity !== group.edges[0].entity));
}

/** Sweep overlapping spans once. Track distinct contours separately from
 * edge count so a self-overlapping contour cannot create a shared cut. */
function visitSharedIntervals(group: Group, visit: (from: number, to: number, active: ReadonlyMap<number, number>, passes: number) => void) {
  const axis = group.line.axis;
  const events = group.edges.flatMap(({ a, b, entity }) => [
    { position: Math.min(a[axis], b[axis]), entity, delta: 1 },
    { position: Math.max(a[axis], b[axis]), entity, delta: -1 },
  ]).sort((a, b) => a.position - b.position);
  const active = new Map<number, number>();
  let previous = events[0].position, activeEdges = 0;
  for (let i = 0; i < events.length;) {
    const { position } = events[i];
    if (active.size > 1) visit(previous, position, active, activeEdges - 1);
    // Endpoints close enough to represent the same junction share one event.
    while (i < events.length && events[i].position - position <= MATCH_MM) {
      const { entity, delta } = events[i++];
      const count = (active.get(entity) ?? 0) + delta;
      if (count) active.set(entity, count);
      else active.delete(entity);
      activeEdges += delta;
    }
    previous = position;
  }
}

/** Scan the same shared sections as export without constructing cut paths.
 * The contour indices are available during the callback. */
export function visitDxfCommonLines(
  entities: DxfEntity[],
  visit: (section: { from: CadPoint; to: CadPoint; duplicatePasses: number }, contours: Iterable<number>) => void,
) {
  const { edges, extent } = straightEdges(entities);
  for (const group of groupEdges(edges, extent)) {
    visitSharedIntervals(group, (from, to, active, passes) => visit({
      from: pointOnLine(group, from), to: pointOnLine(group, to), duplicatePasses: passes,
    }, active.keys()));
  }
}

function overlapIntervals(start: number, end: number, coverage: Interval[]): Interval[] {
  const lo = Math.min(start, end), hi = Math.max(start, end);
  let left = 0, right = coverage.length;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (coverage[mid][1] <= lo) left = mid + 1;
    else right = mid;
  }
  const intervals: Interval[] = [];
  for (let i = left; i < coverage.length && coverage[i][0] < hi; i++) {
    let from = Math.max(lo, coverage[i][0]), to = Math.min(hi, coverage[i][1]);
    if (to - from <= MATCH_MM && (from > lo || to < hi)) continue;
    if (from - lo <= MATCH_MM) from = lo;
    if (hi - to <= MATCH_MM) to = hi;
    intervals.push(start < end ? [from, to] : [to, from]);
  }
  return start < end ? intervals : intervals.reverse();
}

function openRuns(source: CadBezierNode[], cuts: Map<number, Cut>, rgb?: string): DxfEntity[] {
  const nodes: CadBezierNode[] = [], removed: number[] = [];
  for (const [segment, a] of source.entries()) {
    nodes.push(a);
    const cut = cuts.get(segment);
    if (!cut) continue;
    const b = source[(segment + 1) % source.length], axis = cut.axis;
    const insert = (position: number) => {
      const t = (position - a[axis]) / (b[axis] - a[axis]);
      nodes.push(nodeAt({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }));
    };
    for (const [from, to] of cut.intervals) {
      if (from !== a[axis]) insert(from);
      removed.push(nodes.length - 1);
      if (to !== b[axis]) insert(to);
    }
  }
  const size = nodes.length, runs: DxfEntity[] = [];
  for (const [i, cut] of removed.entries()) {
    const start = (cut + 1) % size, end = removed[(i + 1) % removed.length];
    const intervening = (end - start + size) % size;
    if (!intervening) continue;
    const run = Array.from({ length: intervening + 1 }, (_, offset) => ({ ...nodes[(start + offset) % size] }));
    run[0].inX = run[0].inY = 0;
    run[intervening].outX = run[intervening].outY = 0;
    const curved = run.some(n => n.inX || n.inY || n.outX || n.outY);
    runs.push(curved
      ? { type: 'spline', contour: { nodes: run, closed: false }, rgb }
      : { type: 'polyline', points: run.map(copyPoint), closed: false, rgb });
  }
  return runs;
}

/** Keep one line over intervals used by multiple closed contours on the
 * same cutting color. Preserve unshared runs and their existing curve handles. */
export function buildDxfCommonLines(entities: DxfEntity[]) {
  const { contours, edges, extent } = straightEdges(entities);
  const shared: DxfEntity[] = [];
  const cuts = new Map<number, Map<number, Cut>>();
  let passesRemoved = 0, intervalsProcessed = 0;
  for (const group of groupEdges(edges, extent)) {
    const coverage: Interval[] = [];
    visitSharedIntervals(group, (from, to, _active, passes) => {
      shared.push({ type: 'polyline', points: [pointOnLine(group, from), pointOnLine(group, to)],
        closed: false, rgb: group.edges[0].rgb, commonLine: true });
      passesRemoved += passes;
      const last = coverage.at(-1);
      if (last?.[1] === from) last[1] = to;
      else coverage.push([from, to]);
    });
    if (!coverage.length) continue;
    const axis = group.line.axis;
    for (const { a, b, entity, segment } of group.edges) {
      const intervals = overlapIntervals(a[axis], b[axis], coverage);
      if (!intervals.length) continue;
      intervalsProcessed += intervals.length;
      if (intervalsProcessed > MAX_SPLIT_INTERVALS) throw new RangeError('DXF common-line split limit');
      const bySegment = cuts.get(entity) ?? new Map();
      bySegment.set(segment, { axis, intervals });
      cuts.set(entity, bySegment);
    }
  }
  if (!shared.length) return { entities, sharedEdges: 0, passesRemoved: 0 };
  return {
    entities: [...shared, ...entities.flatMap((entity, i) => {
      const segments = cuts.get(i);
      return segments ? openRuns(contours.get(i)!, segments, entity.rgb) : [entity];
    })],
    sharedEdges: shared.length, passesRemoved,
  };
}
