import { CAD_CURVE_NODE_LIMIT, flattenContours, mapContours, mix, nodeAt, validContours, type CadContour } from './cad-curves';
import { CadOperationError } from './cad-plans';
import { CAD_MAX_COORDINATE, type CadPoint } from './cad-settings';
import { fitTraceBoundary, MAX_TRACE_FIT_WORK } from './cad-trace-fit';

const distance = (a: CadPoint, b: CadPoint) => Math.hypot(a.x - b.x, a.y - b.y);
export type MidlinePairing = 'auto' | 'same' | 'reverse';
export type MidlineMatching = 'auto' | 'length';
export interface MidlineOptions { pairing?: MidlinePairing; matching?: MidlineMatching }

function stations(points: CadPoint[]) {
  const entries = [{ point: points[0], progress: 0, index: 0 }];
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    const point = points[index];
    const step = distance(entries.at(-1)!.point, point);
    if (step <= 1e-8 || length + step <= length) continue;
    length += step;
    entries.push({ point, progress: length, index });
  }
  if (entries.length < 2) throw new CadOperationError('midline-pair');
  for (const entry of entries) entry.progress /= length;
  return entries;
}

/** Sampling both breakpoints keeps the corners of each rail. Progress is
 * measured from the paired endpoints and can only increase. */
function sampler(entries: ReturnType<typeof stations>) {
  let i = 0;
  return (progress: number) => {
    while (i + 2 < entries.length && progress > entries[i + 1].progress) i++;
    const a = entries[i], b = entries[i + 1];
    return mix(a.point, b.point, (progress - a.progress) / (b.progress - a.progress));
  };
}

/** Preserve a real direction discontinuity even when fitting the sampled
 * result. A smooth imported subdivision is not an intentional corner. */
function cornerAt(contour: CadContour, index: number): boolean {
  if (index === 0 || index === contour.nodes.length - 1) return true;
  const before = contour.nodes[index - 1], node = contour.nodes[index], after = contour.nodes[index + 1];
  const previous = [{ x: node.x + node.inX, y: node.y + node.inY },
    { x: before.x + before.outX, y: before.y + before.outY }, before].find(p => distance(p, node) > 1e-8);
  const next = [{ x: node.x + node.outX, y: node.y + node.outY },
    { x: after.x + after.inX, y: after.y + after.inY }, after].find(p => distance(p, node) > 1e-8);
  if (!previous || !next) return true;
  const incoming = { x: node.x - previous.x, y: node.y - previous.y }, outgoing = { x: next.x - node.x, y: next.y - node.y };
  const product = Math.hypot(incoming.x, incoming.y) * Math.hypot(outgoing.x, outgoing.y);
  return incoming.x * outgoing.x + incoming.y * outgoing.y <= 0 ||
    Math.abs(incoming.x * outgoing.y - incoming.y * outgoing.x) > product * 1e-7;
}

function fitMidline(points: CadPoint[], corners: number[], tolerance: number): CadContour | null {
  // The existing bounded fitter operates in pixel-like units. Center and scale
  // this construction so its error allowance has the same physical meaning at
  // any document scale, without letting large coordinates exceed its envelope.
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const origin = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const extent = Math.max(maxX - minX, maxY - minY, tolerance);
  // A small normalized allowance also bounds the fitter's flattening work:
  // its fixed pixel ceiling must not oversample a tight physical tolerance.
  const scale = Math.min(.05 / tolerance, CAD_MAX_COORDINATE / 8 / extent), normalizedTolerance = tolerance * scale;
  if (normalizedTolerance < .01) return null;
  try {
    const fitted = fitTraceBoundary(points.map(p => ({ x: (p.x - origin.x) * scale, y: (p.y - origin.y) * scale })), {
      tolerance: normalizedTolerance, closed: false, preserveCorners: false, forcedCorners: corners,
      budget: { remaining: MAX_TRACE_FIT_WORK * 2 },
    });
    const [contour] = mapContours([fitted], p => ({ x: p.x / scale + origin.x, y: p.y / scale + origin.y }));
    // Endpoints are construction constraints, including at a large world origin.
    Object.assign(contour.nodes[0], { x: points[0].x, y: points[0].y });
    Object.assign(contour.nodes.at(-1)!, { x: points.at(-1)!.x, y: points.at(-1)!.y });
    return validContours([contour]) ? contour : null;
  } catch (error) {
    // A too-demanding fit retains the bounded sampled result instead of
    // silently relaxing the user's tolerance. The review reports sampling.
    if (error instanceof Error && ['geometry', 'limit'].includes(error.message)) return null;
    throw error;
  }
}

export function prepareMidline(a: CadContour, b: CadContour, tolerance: number, options: MidlineOptions = {}) {
  const pairing = options.pairing ?? 'auto', matching = options.matching ?? 'auto';
  if (!validContours([a]) || !validContours([b]) || a.closed || b.closed || !Number.isFinite(tolerance) || tolerance <= 0 ||
      !['auto', 'same', 'reverse'].includes(pairing) || !['auto', 'length'].includes(matching)) throw new CadOperationError('midline-pair');
  const first = a.nodes[0], last = a.nodes.at(-1)!, from = b.nodes[0], to = b.nodes.at(-1)!;
  const reversed = pairing === 'reverse' || pairing === 'auto' && distance(first, from) + distance(last, to) > distance(first, to) + distance(last, from);
  const paired = reversed ? [...b.nodes].reverse().map(n => ({ ...n, inX: n.outX, inY: n.outY, outX: n.inX, outY: n.inY })) : b.nodes;

  if (matching === 'auto' && a.nodes.length === paired.length) {
    const nodes = a.nodes.map((node, i) => ({
      ...mix(node, paired[i], 0.5),
      inX: (node.inX + paired[i].inX) / 2, inY: (node.inY + paired[i].inY) / 2,
      outX: (node.outX + paired[i].outX) / 2, outY: (node.outY + paired[i].outY) / 2,
      mode: 'corner' as const
    }));
    if (nodes.some((node, i) => i > 0 && distance(node, nodes[i - 1]) <= 1e-8))
      throw new CadOperationError('midline-pair');
    return { contour: { closed: false, nodes }, sampled: false, fitted: false, reversed };
  }

  const sources = [a, { closed: false, nodes: paired }];
  const sourceCorners: number[][] = [[0], [0]];
  const [left, right] = flattenContours(sources, tolerance / 4, CAD_CURVE_NODE_LIMIT + 2, (ci, segment, _first, last) => {
    if (cornerAt(sources[ci], segment + 1)) sourceCorners[ci].push(last);
  }).map(stations);
  const cornerProgress = new Set(sourceCorners.flatMap((indices, ci) => {
    const entries = ci === 0 ? left : right;
    return indices.map(index => (entries.find(entry => entry.index >= index) ?? entries.at(-1)!).progress);
  }));
  const progress = Array.from(new Set([...left, ...right].map(entry => entry.progress))).sort((a, b) => a - b);
  const leftAt = sampler(left), rightAt = sampler(right);
  const nodes: CadContour['nodes'] = [], corners: number[] = [];
  for (const fraction of progress) {
    const point = mix(leftAt(fraction), rightAt(fraction), .5);
    const previous = nodes.at(-1);
    if (!previous || distance(previous, point) > 1e-8) nodes.push(nodeAt(point));
    if (cornerProgress.has(fraction)) corners.push(nodes.length - 1);
  }
  if (nodes.length < 2) throw new CadOperationError('midline-pair');
  if (nodes.length > CAD_CURVE_NODE_LIMIT) throw new CadOperationError('limit');
  const curved = sources.some(source => source.nodes.some(node => Math.hypot(node.inX, node.inY, node.outX, node.outY) > 1e-8));
  const fitted = curved ? fitMidline(nodes, corners, tolerance / 2) : null;
  return { contour: fitted ?? { closed: false, nodes }, sampled: true, fitted: !!fitted, reversed };
}
