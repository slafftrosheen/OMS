import { CAD_CURVE_NODE_LIMIT, flattenContours, mix, nodeAt, type CadContour } from './cad-curves';
import { CadOperationError } from './cad-plans';
import type { CadPoint } from './cad-settings';

const distance = (a: CadPoint, b: CadPoint) => Math.hypot(a.x - b.x, a.y - b.y);

function stations(points: CadPoint[]) {
  const entries = [{ point: points[0], progress: 0 }];
  let length = 0;
  for (const point of points.slice(1)) {
    const step = distance(entries.at(-1)!.point, point);
    if (step <= 1e-8 || length + step <= length) continue;
    length += step;
    entries.push({ point, progress: length });
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

export function prepareMidline(a: CadContour, b: CadContour, tolerance: number) {
  if (a.closed || b.closed) throw new CadOperationError('midline-pair');
  const first = a.nodes[0], last = a.nodes.at(-1)!, from = b.nodes[0], to = b.nodes.at(-1)!;
  const paired = distance(first, from) + distance(last, to) <= distance(first, to) + distance(last, from)
    ? b.nodes : [...b.nodes].reverse().map(n => ({ ...n, inX: n.outX, inY: n.outY, outX: n.inX, outY: n.inY }));

  if (a.nodes.length === paired.length) {
    const nodes = a.nodes.map((node, i) => ({
      ...mix(node, paired[i], 0.5),
      inX: (node.inX + paired[i].inX) / 2, inY: (node.inY + paired[i].inY) / 2,
      outX: (node.outX + paired[i].outX) / 2, outY: (node.outY + paired[i].outY) / 2,
      mode: 'corner' as const
    }));
    if (nodes.some((node, i) => i > 0 && distance(node, nodes[i - 1]) <= 1e-8))
      throw new CadOperationError('midline-pair');
    return { contour: { closed: false, nodes }, sampled: false };
  }

  const [left, right] = flattenContours([a, { closed: false, nodes: paired }], tolerance / 2, CAD_CURVE_NODE_LIMIT + 2)
    .map(stations);
  const progress = Array.from(new Set([...left, ...right].map(entry => entry.progress))).sort((a, b) => a - b);
  const leftAt = sampler(left), rightAt = sampler(right);
  const nodes: CadContour['nodes'] = [];
  for (const fraction of progress) {
    const point = mix(leftAt(fraction), rightAt(fraction), .5);
    const previous = nodes.at(-1);
    if (!previous || distance(previous, point) > 1e-8) nodes.push(nodeAt(point));
  }
  if (nodes.length < 2) throw new CadOperationError('midline-pair');
  if (nodes.length > CAD_CURVE_NODE_LIMIT) throw new CadOperationError('limit');
  return { contour: { closed: false, nodes }, sampled: true };
}
