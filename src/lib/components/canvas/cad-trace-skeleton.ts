import { traceLuminance, validTraceRasterInput, type TraceRasterInput } from './cad-trace-background';
import { MAX_TRACE_BOUNDARY_POINTS } from './cad-trace-options';
import type { CenterlineChain } from './cad-trace-centerline-fit';
import type { CadPoint } from './cad-settings';

export interface CenterlineComponent {
  chains: CenterlineChain[];
  /** Length of the complete pixel graph, before junction normalization. */
  length: number;
}
export interface CenterlineSkeleton {
  components: CenterlineComponent[];
  isolatedDots: number;
}
interface Budget { remaining: number }
interface RasterTopology { components: number; holes: number }
interface GraphComponent { pixels: number[]; edges: number; length: number }
const MAX_WORK = 32000000, MAX_ITERATIONS = 512, MAX_COMPONENTS = 4096;
const spend = (budget: Budget, count = 1) => {
  budget.remaining -= count;
  if (budget.remaining < 0) throw new Error('limit');
};

// Guo–Hall's two parallel deletion predicates, generated from the eight
// clockwise binary neighbors N, NE, E, SE, S, SW, W, NW. Each subiteration
// reads an unchanged mask and applies all its deletions together.
const DELETE = [new Uint8Array(256), new Uint8Array(256)];
for (let phase = 0; phase < 2; phase++) for (let code = 0; code < 256; code++) {
  const p = Array.from({ length: 8 }, (_, i) => (code >> i) & 1);
  let transitions = 0;
  for (let i = 0; i < 8; i += 2) transitions += Number(!p[i] && !!(p[(i + 1) % 8] || p[(i + 2) % 8]));
  const neighbors = Math.min((p[7] | p[0]) + (p[1] | p[2]) + (p[3] | p[4]) + (p[5] | p[6]),
    (p[0] | p[1]) + (p[2] | p[3]) + (p[4] | p[5]) + (p[6] | p[7]));
  const blocked = phase ? (p[0] | p[1] | Number(!p[3])) & p[2] : (p[4] | p[5] | Number(!p[7])) & p[6];
  DELETE[phase][code] = Number(transitions === 1 && neighbors >= 2 && neighbors <= 3 && !blocked);
}

/** Foreground uses eight-connectivity; background uses four-connectivity.
 * Counting both independently prevents thinning from dropping a tiny counter
 * or joining components. The padded border belongs to the outside background. */
function rasterTopology(mask: Uint8Array, stride: number, queue: Uint32Array, visited: Uint8Array, budget: Budget): RasterTopology {
  visited.fill(0);
  const offsets = [-stride, -stride + 1, 1, stride + 1, stride, stride - 1, -1, -stride - 1];
  let components = 0, backgrounds = 0;
  spend(budget, mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (visited[start]) continue;
    const ink = mask[start];
    if (ink) components++; else backgrounds++;
    if (components > MAX_COMPONENTS || backgrounds > MAX_COMPONENTS + 1) throw new Error('limit');
    let read = 0, write = 1;
    queue[0] = start; visited[start] = 1;
    while (read < write) {
      spend(budget);
      const pixel = queue[read++], x = pixel % stride;
      for (let direction = 0; direction < 8; direction += ink ? 1 : 2) {
        if (x === 0 && direction >= 5 || x === stride - 1 && direction >= 1 && direction <= 3) continue;
        const next = pixel + offsets[direction];
        if (next < 0 || next >= mask.length || visited[next] || mask[next] !== ink) continue;
        visited[next] = 1; queue[write++] = next;
      }
    }
  }
  return { components, holes: backgrounds - 1 };
}

function thin(mask: Uint8Array, active: Uint32Array, count: number, removed: Uint32Array, offsets: number[], budget: Budget): number {
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let changed = 0;
    for (let phase = 0; phase < 2; phase++) {
      let keep = 0, take = 0;
      spend(budget, count);
      for (let i = 0; i < count; i++) {
        const pixel = active[i];
        let code = 0;
        for (let direction = 0; direction < 8; direction++) code |= mask[pixel + offsets[direction]] << direction;
        if (DELETE[phase][code]) removed[take++] = pixel;
        else active[keep++] = pixel;
      }
      for (let i = 0; i < take; i++) mask[removed[i]] = 0;
      changed += take; count = keep;
    }
    if (!changed) return count;
  }
  // A still-changing skeleton is not an approximate result: it is unfinished.
  throw new Error('limit');
}

function pixelGraph(mask: Uint8Array, active: Uint32Array, stride: number, offsets: number[], budget: Budget): Map<number, number[]> {
  const graph = new Map<number, number[]>();
  spend(budget, active.length);
  for (const pixel of active) {
    const neighbors: number[] = [];
    for (let direction = 0; direction < 8; direction++) {
      const next = pixel + offsets[direction];
      if (!mask[next]) continue;
      // A diagonal beside an orthogonal connection adds a triangular cycle
      // that is not a hole in the binary image.
      if (direction % 2 && (mask[pixel + offsets[(direction + 7) % 8]] || mask[pixel + offsets[(direction + 1) % 8]])) continue;
      // A full 2x2 foreground cell likewise has no hole. Remove its right
      // vertical edge; the three other sides supply the local spanning tree.
      // Adjacent cells remove distinct edges and retain their leftmost side.
      if ((direction === 0 || direction === 4) && mask[pixel - 1] && mask[next - 1]) continue;
      neighbors.push(next);
    }
    graph.set(pixel, neighbors);
  }
  return graph;
}

function graphComponents(graph: Map<number, number[]>, stride: number, budget: Budget): GraphComponent[] {
  const seen = new Set<number>(), result: GraphComponent[] = [];
  for (const start of graph.keys()) {
    if (seen.has(start)) continue;
    const pixels = [start]; seen.add(start);
    let edges = 0, length = 0;
    for (let i = 0; i < pixels.length; i++) {
      spend(budget);
      const pixel = pixels[i];
      for (const next of graph.get(pixel)!) {
        if (pixel < next) {
          edges++;
          length += next - pixel === 1 || next - pixel === stride ? 1 : Math.SQRT2;
        }
        if (!seen.has(next)) { seen.add(next); pixels.push(next); }
      }
    }
    pixels.sort((a, b) => a - b);
    result.push({ pixels, edges, length });
  }
  return result;
}

/** Only isolated, fully filled 2x2 cells are normalized. Their three graph
 * edges are a tree, so contraction removes no real cycle. The shared anchor
 * is the center of that filled square. Larger/ambiguous junction clusters
 * retain their exact pixel graph instead of risking a topology change. */
function junctions(mask: Uint8Array, graph: Map<number, number[]>, stride: number, budget: Budget): Map<number, number> {
  const cells = new Set<number>();
  for (const pixel of graph.keys()) {
    spend(budget);
    if (mask[pixel + 1] && mask[pixel + stride] && mask[pixel + stride + 1]) cells.add(pixel);
  }
  const owners = new Map<number, number>();
  for (const cell of cells) {
    let isolated = true;
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
      if ((x || y) && cells.has(cell + y * stride + x)) isolated = false;
    }
    if (!isolated) continue;
    for (const pixel of [cell, cell + 1, cell + stride, cell + stride + 1]) owners.set(pixel, cell);
  }
  // Do not contract a cell if that would merge two distinct exterior edges.
  // Such parallel edges can encode a small real loop outside the filled cell.
  const edges = new Set<string>(), unsafe = new Set<number>();
  for (const [pixel, neighbors] of graph) for (const next of neighbors) {
    if (pixel >= next) continue;
    spend(budget);
    const a = owners.get(pixel) ?? pixel, b = owners.get(next) ?? next;
    if (a === b) continue;
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (edges.has(key)) {
      const left = owners.get(pixel), right = owners.get(next);
      if (left !== undefined) unsafe.add(left);
      if (right !== undefined) unsafe.add(right);
    }
    edges.add(key);
  }
  for (const [pixel, cell] of owners) if (unsafe.has(cell)) owners.delete(pixel);
  return owners;
}

function componentChains(component: GraphComponent, graph: Map<number, number[]>, owners: Map<number, number>, stride: number, budget: Budget): CenterlineChain[] {
  const normalized = new Map<number, number[]>();
  const id = (pixel: number) => owners.get(pixel) ?? pixel;
  for (const pixel of component.pixels) {
    spend(budget);
    const vertex = id(pixel), neighbors = normalized.get(vertex) ?? [];
    for (const next of graph.get(pixel)!) {
      const target = id(next);
      if (target !== vertex && !neighbors.includes(target)) neighbors.push(target);
    }
    normalized.set(vertex, neighbors);
  }
  let edgeCount = 0;
  for (const neighbors of normalized.values()) { neighbors.sort((a, b) => a - b); edgeCount += neighbors.length; }
  if (edgeCount / 2 - normalized.size !== component.edges - component.pixels.length) throw new Error('geometry');
  const point = (vertex: number): CadPoint => ({
    x: vertex % stride - .5 + Number(owners.has(vertex)) * .5,
    y: Math.floor(vertex / stride) - .5 + Number(owners.has(vertex)) * .5,
  });
  const used = new Set<string>(), result: CenterlineChain[] = [];
  const edge = (a: number, b: number) => a < b ? `${a},${b}` : `${b},${a}`;
  function walk(start: number, next: number) {
    const vertices = [start];
    let previous = start, current = next;
    used.add(edge(start, next));
    while (true) {
      spend(budget);
      vertices.push(current);
      const neighbors = normalized.get(current)!;
      if (current === start || neighbors.length !== 2) break;
      const target = neighbors[0] === previous ? neighbors[1] : neighbors[0];
      const code = edge(current, target);
      if (used.has(code)) throw new Error('geometry');
      used.add(code); previous = current; current = target;
    }
    const closed = current === start;
    if (closed) vertices.pop();
    if (vertices.length < (closed ? 3 : 2)) throw new Error('geometry');
    result.push({ points: vertices.map(point), closed,
      ...(closed && normalized.get(start)!.length !== 2 ? { forcedCorners: [0] } : {}) });
  }
  for (const [vertex, neighbors] of normalized) if (neighbors.length !== 2) {
    for (const next of neighbors) if (!used.has(edge(vertex, next))) walk(vertex, next);
  }
  for (const [vertex, neighbors] of normalized) for (const next of neighbors) {
    if (!used.has(edge(vertex, next))) walk(vertex, next);
  }
  if (used.size !== edgeCount / 2) throw new Error('geometry');
  return result;
}

/** Binary stroke skeleton at working resolution, not variable-width recovery.
 * White and invisible pixels are absent regardless of outline background scope.
 * Work and topology bounds reject difficult inputs rather than returning a
 * partially thinned graph. Inputs and their RGBA storage are never modified. */
export function readCenterlineSkeleton(input: TraceRasterInput, threshold: number): CenterlineSkeleton {
  if (!validTraceRasterInput(input)) throw new Error('limit');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 255) throw new Error('geometry');
  const { width, height, data } = input, stride = width + 2, budget = { remaining: MAX_WORK };
  const mask = new Uint8Array(stride * (height + 2)), active = new Uint32Array(width * height);
  const scratch = new Uint32Array(mask.length), visited = new Uint8Array(mask.length);
  const offsets = [-stride, -stride + 1, 1, stride + 1, stride, stride - 1, -1, -stride - 1];
  let count = 0;
  spend(budget, width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    if (data[offset + 3] && traceLuminance(data, offset) < threshold) {
      const pixel = (y + 1) * stride + x + 1;
      mask[pixel] = 1; active[count++] = pixel;
    }
  }
  if (!count) return { components: [], isolatedDots: 0 };
  let boundary = 0;
  spend(budget, count);
  for (let i = 0; i < count; i++) {
    const pixel = active[i];
    for (let direction = 0; direction < 8; direction += 2) boundary += Number(!mask[pixel + offsets[direction]]);
    if (boundary > MAX_TRACE_BOUNDARY_POINTS) throw new Error('limit');
  }
  const before = rasterTopology(mask, stride, scratch, visited, budget);
  count = thin(mask, active, count, scratch, offsets, budget);
  if (count > MAX_TRACE_BOUNDARY_POINTS) throw new Error('limit');
  const after = rasterTopology(mask, stride, scratch, visited, budget);
  if (after.components !== before.components || after.holes !== before.holes) throw new Error('geometry');
  const graph = pixelGraph(mask, active.subarray(0, count), stride, offsets, budget);
  const rawComponents = graphComponents(graph, stride, budget);
  const cycles = rawComponents.reduce((sum, component) => sum + component.edges - component.pixels.length + 1, 0);
  if (rawComponents.length !== after.components || cycles !== after.holes) throw new Error('geometry');
  const owners = junctions(mask, graph, stride, budget), components: CenterlineComponent[] = [];
  let isolatedDots = 0;
  for (const component of rawComponents) {
    if (!component.edges) { isolatedDots++; continue; }
    components.push({ chains: componentChains(component, graph, owners, stride, budget), length: component.length });
  }
  return { components, isolatedDots };
}
