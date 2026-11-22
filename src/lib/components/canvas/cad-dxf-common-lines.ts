import { nodeAt, type CadBezierNode } from './cad-curves';
import type { DxfEntity } from './cad-dxf';
import type { CadPoint } from './cad-settings';

// One nanometre in model-space millimetres absorbs rotation and inverse
// transform roundoff without using the curve flattening tolerance.
const MATCH_MM = 1e-6;
type IndexedPoint = { point: CadPoint; id: number };
type Edge = { entity: number; segment: number };
type MatchedEdge = { a: CadPoint; b: CadPoint; rgb?: string; uses: Edge[] };

const near = (a: CadPoint, b: CadPoint) => Math.abs(a.x - b.x) <= MATCH_MM && Math.abs(a.y - b.y) <= MATCH_MM;
const copyPoint = ({ x, y }: CadPoint) => ({ x, y });

function indexEndpoints() {
  const cells = new Map<string, IndexedPoint>();
  const exact = new Map<string, number>();
  let nextId = 0;
  return (point: CadPoint) => {
    const key = `${point.x},${point.y}`;
    const cached = exact.get(key);
    if (cached !== undefined) return cached;
    const x = Math.floor(point.x / MATCH_MM), y = Math.floor(point.y / MATCH_MM);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const entry = cells.get(`${x + dx},${y + dy}`);
      if (entry && near(point, entry.point)) {
        exact.set(key, entry.id);
        return entry.id;
      }
    }
    cells.set(`${x},${y}`, { point, id: nextId });
    exact.set(key, nextId);
    return nextId++;
  };
}

function openRuns(nodes: CadBezierNode[], cuts: number[], rgb?: string): DxfEntity[] {
  const size = nodes.length;
  cuts.sort((a, b) => a - b);
  const runs: DxfEntity[] = [];
  for (const [i, cut] of cuts.entries()) {
    const start = (cut + 1) % size, end = cuts[(i + 1) % cuts.length];
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

/** Coalesce complete straight edges between closed contours on the same
 * cutting color. Curves, isolated outlines and open artwork keep their
 * geometry. The resulting file has separate shared lines and perimeter runs. */
export function buildDxfCommonLines(entities: DxfEntity[]) {
  const indexPoint = indexEndpoints();
  const contours = new Map<number, CadBezierNode[]>();
  const matches = new Map<string, MatchedEdge[]>();
  for (const [entity, source] of entities.entries()) {
    const nodes = source.type === 'polyline' && source.closed ? source.points.map(nodeAt)
      : source.type === 'spline' && source.contour.closed ? source.contour.nodes : undefined;
    if (!nodes) continue;
    contours.set(entity, nodes);
    for (const [segment, first] of nodes.entries()) {
      const last = nodes[(segment + 1) % nodes.length];
      if (first.outX || first.outY || last.inX || last.inY || near(first, last)) continue;
      const firstId = indexPoint(first), lastId = indexPoint(last);
      if (firstId === lastId) continue;
      const [a, b] = firstId < lastId ? [first, last] : [last, first];
      const key = `${Math.min(firstId, lastId)}:${Math.max(firstId, lastId)}:${source.rgb ?? ''}`;
      const bucket = matches.get(key) ?? [];
      // The spatial index only proposes matches. Compare the actual endpoints
      // to the exported edge so a chain of near points cannot bridge a gap.
      const match = bucket.find(edge => near(a, edge.a) && near(b, edge.b));
      if (match) match.uses.push({ entity, segment });
      else {
        bucket.push({ a, b, rgb: source.rgb, uses: [{ entity, segment }] });
        matches.set(key, bucket);
      }
    }
  }
  const shared: DxfEntity[] = [];
  const cuts = new Map<number, number[]>();
  let passesRemoved = 0;
  for (const bucket of matches.values()) for (const edge of bucket) {
    if (edge.uses.every(use => use.entity === edge.uses[0].entity)) continue;
    shared.push({ type: 'polyline', points: [copyPoint(edge.a), copyPoint(edge.b)], closed: false, rgb: edge.rgb, commonLine: true });
    passesRemoved += edge.uses.length - 1;
    for (const { entity, segment } of edge.uses) {
      const cut = cuts.get(entity) ?? [];
      cut.push(segment);
      cuts.set(entity, cut);
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
