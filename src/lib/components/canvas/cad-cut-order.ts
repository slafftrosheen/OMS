/**
 * Round 7 · cut order for DXF export.
 *
 * Machines cut entities in file order. A good order:
 *  1. engraving and scoring before cutting (parts are still held by the sheet),
 *  2. holes and inner contours before the outline that contains them
 *     (an outline cut first drops the part before its holes are done),
 *  3. the shortest rapid move to the next start point (nearest neighbour).
 * Pure and deterministic. Containment uses bounding boxes, so a contour counts as
 * "inside" when its box sits inside a closed contour's box — safe for signage
 * letters, holes and frames; never reported as true geometric nesting.
 */
import { curveBounds } from './cad-curves';
import { operationForLayer } from './cad-cut-estimate';
import type { DxfEntity } from './cad-dxf';
import type { CadPoint } from './cad-settings';

export interface Box { minX: number; minY: number; maxX: number; maxY: number }
const EPS = 1e-6;
const MAX_ORDERED = 4000;

const polar = (c: CadPoint, r: number, deg: number): CadPoint =>
  ({ x: c.x + r * Math.cos(deg * Math.PI / 180), y: c.y + r * Math.sin(deg * Math.PI / 180) });

/** Where the tool goes down and where it lifts. Closed contours end where they start. */
export function entityEndpoints(entity: DxfEntity): { start: CadPoint; end: CadPoint } {
  switch (entity.type) {
    case 'polyline': {
      const start = entity.points[0];
      return { start, end: entity.closed ? start : entity.points[entity.points.length - 1] };
    }
    case 'circle': { const p = polar(entity.center, entity.radius, 0); return { start: p, end: p }; }
    case 'ellipse': { const p = { x: entity.center.x + entity.major.x, y: entity.center.y + entity.major.y }; return { start: p, end: p }; }
    case 'arc': return { start: polar(entity.center, entity.radius, entity.start), end: polar(entity.center, entity.radius, entity.end) };
    case 'spline': {
      const nodes = entity.contour.nodes, first = { x: nodes[0].x, y: nodes[0].y };
      const last = nodes[nodes.length - 1];
      return { start: first, end: entity.contour.closed ? first : { x: last.x, y: last.y } };
    }
  }
}

export function entityBox(entity: DxfEntity): Box {
  switch (entity.type) {
    case 'polyline': {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of entity.points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
      return { minX, minY, maxX, maxY };
    }
    case 'circle': case 'arc': {
      const { center: c, radius: r } = entity;
      return { minX: c.x - r, minY: c.y - r, maxX: c.x + r, maxY: c.y + r };
    }
    case 'ellipse': {
      const dx = Math.hypot(entity.major.x, entity.major.y * entity.ratio), dy = Math.hypot(entity.major.y, entity.major.x * entity.ratio);
      return { minX: entity.center.x - dx, minY: entity.center.y - dy, maxX: entity.center.x + dx, maxY: entity.center.y + dy };
    }
    case 'spline': {
      const b = curveBounds([entity.contour]);
      return { minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h };
    }
  }
}

export function isClosedEntity(entity: DxfEntity): boolean {
  return entity.type === 'circle' || entity.type === 'ellipse' ||
    (entity.type === 'polyline' && entity.closed) || (entity.type === 'spline' && entity.contour.closed);
}

const inside = (a: Box, b: Box) => a.minX > b.minX + EPS && a.minY > b.minY + EPS && a.maxX < b.maxX - EPS && a.maxY < b.maxY - EPS;
const dist = (a: CadPoint, b: CadPoint) => Math.hypot(b.x - a.x, b.y - a.y);

/** How many closed contours hold this entity (0 = an outer outline or loose path). Used for reporting. */
export function containmentDepths(entities: readonly DxfEntity[]): number[] {
  const boxes = entities.map(entityBox), closed = entities.map(isClosedEntity);
  return boxes.map((box, i) => boxes.reduce((depth, other, j) => depth + (j !== i && closed[j] && inside(box, other) ? 1 : 0), 0));
}

/** Rapid travel from home through every start / end pair in file order, in model mm. */
export function rapidTravel(entities: readonly DxfEntity[], home?: CadPoint): number {
  let at = home ?? null, total = 0;
  for (const entity of entities) {
    const { start, end } = entityEndpoints(entity);
    if (at) total += dist(at, start);
    at = end;
  }
  return total;
}

const OP_RANK = { engrave: 0, score: 1, cut: 2, skip: 3 } as const;

/** Closed polylines may start at any vertex: pick the one nearest the tool (the pierce point). */
function nearestStart(entity: DxfEntity, from: CadPoint): { index: number; d: number } {
  if (entity.type === 'polyline' && entity.closed) {
    let index = 0, d = Infinity;
    entity.points.forEach((p, i) => { const e = dist(from, p); if (e < d - EPS) { d = e; index = i; } });
    return { index, d };
  }
  return { index: 0, d: dist(from, entityEndpoints(entity).start) };
}
function startAt<T extends DxfEntity>(entity: T, index: number): T {
  if (index === 0 || entity.type !== 'polyline' || !entity.closed) return entity;
  return { ...entity, points: [...entity.points.slice(index), ...entity.points.slice(0, index)] };
}

export interface CutOrderResult<T extends DxfEntity> { entities: T[]; before: number; after: number; reordered: boolean }

/**
 * Engrave → score → cut. Within each step, nearest next start among the entities
 * that are "free": an outline becomes free only once everything inside it is cut,
 * so the route finishes a part (holes, then its outline) before moving on.
 */
export function optimiseCutOrder<T extends DxfEntity>(
  entities: readonly T[], home?: CadPoint, productionNames?: ReadonlyMap<string, string>,
): CutOrderResult<T> {
  if (entities.length < 2 || entities.length > MAX_ORDERED) {
    const travel = rapidTravel(entities, home);
    return { entities: [...entities], before: travel, after: travel, reordered: false };
  }
  const n = entities.length;
  const boxes = entities.map(entityBox), closed = entities.map(isClosedEntity);
  const origin = home ?? { x: Math.min(...boxes.map(b => b.minX)), y: Math.min(...boxes.map(b => b.minY)) };
  const before = rapidTravel(entities, origin);
  const rank = entities.map(entity => {
    const layer = entity.productionLayer ?? '';
    return OP_RANK[operationForLayer(productionNames?.get(layer) ?? layer)];
  });
  // containers[i]: closed outlines (same operation) that hold i; waiting[j]: unfinished entities inside j.
  const containers: number[][] = Array.from({ length: n }, () => []);
  const waiting = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i !== j && closed[j] && rank[i] === rank[j] && inside(boxes[i], boxes[j])) { containers[i].push(j); waiting[j]++; }
  }
  // The outermost outline of each entity: the part it belongs to (itself when loose or outer).
  const part = entities.map((_, i) => containers[i].reduce((outer, j) => outer < 0 || inside(boxes[outer], boxes[j]) ? j : outer, -1));
  const partOf = (i: number) => part[i] < 0 ? i : part[i];
  const order: number[] = [], done = new Array<boolean>(n).fill(false), starts = new Array<number>(n).fill(0);
  let at = origin, focus = -1;
  for (const step of [...new Set(rank)].sort((a, b) => a - b)) {
    let remaining = rank.filter(r => r === step).length;
    while (remaining > 0) {
      // Finish the part in progress first (its remaining holes, then its outline); otherwise go to the nearest start.
      let best = -1, bestD = Infinity, bestFocus = false, bestStart = 0;
      for (let i = 0; i < n; i++) {
        if (done[i] || rank[i] !== step || waiting[i] > 0) continue;
        const inFocus = focus >= 0 && partOf(i) === focus;
        const { d, index } = nearestStart(entities[i], at);
        if ((inFocus && !bestFocus) || (inFocus === bestFocus && d < bestD - EPS)) { best = i; bestD = d; bestFocus = inFocus; bestStart = index; }
      }
      if (best < 0) break; // cannot happen: box containment is acyclic
      done[best] = true; order.push(best); starts[best] = bestStart; remaining--;
      focus = partOf(best) === best ? -1 : partOf(best);
      for (const j of containers[best]) waiting[j]--;
      at = entityEndpoints(startAt(entities[best], bestStart)).end;
    }
  }
  if (order.length !== n) {
    const travel = rapidTravel(entities, origin);
    return { entities: [...entities], before: travel, after: travel, reordered: false };
  }
  const sorted = order.map(i => startAt(entities[i], starts[i]));
  const after = rapidTravel(sorted, origin);
  // Keep the drawing order only when it is already safe (operations in order, holes before outlines) and shorter.
  const safe = entities.every((_, i) => (i === 0 || rank[i - 1] <= rank[i]) && containers[i].every(j => j > i));
  if (safe && after > before + EPS) return { entities: [...entities], before, after: before, reordered: false };
  return { entities: sorted, before, after, reordered: order.some((value, index) => value !== index || starts[value] !== 0) };
}
