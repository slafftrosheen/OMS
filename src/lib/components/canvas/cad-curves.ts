import { CAD_MAX_COORDINATE, type CadPoint } from './cad-settings';

export type CadNodeMode = 'corner' | 'smooth' | 'symmetric';
export interface CadBezierNode extends CadPoint {
  inX: number;
  inY: number;
  outX: number;
  outY: number;
  mode: CadNodeMode;
}
export interface CadContour {
  closed: boolean;
  nodes: CadBezierNode[];
}
export const CAD_CURVE_NODE_LIMIT = 4096,
  CAD_FLATTEN_LIMIT = 50000;
export const nodeAt = (p: CadPoint): CadBezierNode => ({ ...p, inX: 0, inY: 0, outX: 0, outY: 0, mode: 'corner' });
export const mix = (a: CadPoint, b: CadPoint, t: number): CadPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t
});
export function validContours(contours: CadContour[]): boolean {
  return (
    Array.isArray(contours) &&
    contours.length > 0 &&
    contours.length <= 512 &&
    contours.reduce((n, c) => n + c.nodes.length, 0) <= CAD_CURVE_NODE_LIMIT &&
    contours.every(
      (c) =>
        typeof c.closed === 'boolean' &&
        c.nodes.length >= 2 &&
        c.nodes.every(
          (n) =>
            ['corner', 'smooth', 'symmetric'].includes(n.mode) &&
            [n.x, n.y, n.inX, n.inY, n.outX, n.outY, n.x + n.inX, n.y + n.inY, n.x + n.outX, n.y + n.outY].every(
              (v) => Number.isFinite(v) && Math.abs(v) <= CAD_MAX_COORDINATE
            )
        )
    )
  );
}
export function cubicPoints(a: CadBezierNode, b: CadBezierNode): [CadPoint, CadPoint, CadPoint, CadPoint] {
  return [a, { x: a.x + a.outX, y: a.y + a.outY }, { x: b.x + b.inX, y: b.y + b.inY }, b];
}
export function* contourSegments(contour: CadContour) {
  for (let i = 0; i < contour.nodes.length - (contour.closed ? 0 : 1); i++)
    yield cubicPoints(contour.nodes[i], contour.nodes[(i + 1) % contour.nodes.length]);
}
export function cubicAt(p: CadPoint[], t: number): CadPoint {
  const a = mix(p[0], p[1], t),
    b = mix(p[1], p[2], t),
    c = mix(p[2], p[3], t);
  return mix(mix(a, b, t), mix(b, c, t), t);
}
export function splitCubic(p: CadPoint[], t = 0.5): [CadPoint[], CadPoint[]] {
  const a = mix(p[0], p[1], t),
    b = mix(p[1], p[2], t),
    c = mix(p[2], p[3], t),
    d = mix(a, b, t),
    e = mix(b, c, t),
    f = mix(d, e, t);
  return [
    [p[0], a, d, f],
    [f, e, c, p[3]]
  ];
}
export function curvePathData(contours: CadContour[]): string {
  return contours
    .map(
      (c) =>
        `M${c.nodes[0].x},${c.nodes[0].y} ` +
        [...contourSegments(c)].map((p) => `C${p[1].x},${p[1].y} ${p[2].x},${p[2].y} ${p[3].x},${p[3].y}`).join(' ') +
        (c.closed ? ' Z' : '')
    )
    .join(' ');
}
export function curveBounds(contours: CadContour[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const add = (p: CadPoint) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const c of contours)
    for (const p of contourSegments(c)) {
      add(p[0]);
      add(p[3]);
      for (const axis of ['x', 'y'] as const) {
        const a = -p[0][axis] + 3 * p[1][axis] - 3 * p[2][axis] + p[3][axis];
        const b = 2 * (p[0][axis] - 2 * p[1][axis] + p[2][axis]),
          d = p[1][axis] - p[0][axis];
        const discriminant = b * b - 4 * a * d;
        const roots =
          Math.abs(a) < 1e-12
            ? Math.abs(b) < 1e-12
              ? []
              : [-d / b]
            : discriminant >= 0
              ? [(-b + Math.sqrt(discriminant)) / (2 * a), (-b - Math.sqrt(discriminant)) / (2 * a)]
              : [];
        for (const t of roots) if (t > 0 && t < 1) add(cubicAt(p, t));
      }
    }
  return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : { x: 0, y: 0, w: 0, h: 0 };
}
/** Control points within tolerance of the chord segment bound the entire convex hull. */
export function flattenContours(contours: CadContour[], tolerance: number, limit = CAD_FLATTEN_LIMIT): CadPoint[][] {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error('tolerance');
  let count = 0;
  const distance = (p: CadPoint, a: CadPoint, b: CadPoint) => {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  return contours.map((contour) => {
    const result: CadPoint[] = [{ x: contour.nodes[0].x, y: contour.nodes[0].y }];
    count++;
    const visit = (p: CadPoint[], depth: number) => {
      if (Math.max(distance(p[1], p[0], p[3]), distance(p[2], p[0], p[3])) <= tolerance) {
        if (++count > limit) throw new Error('limit');
        result.push({ x: p[3].x, y: p[3].y });
        return;
      }
      if (depth >= 24) throw new Error('limit');
      const [a, b] = splitCubic(p);
      visit(a, depth + 1);
      visit(b, depth + 1);
    };
    for (const segment of contourSegments(contour)) visit(segment, 0);
    if (contour.closed && Math.hypot(result[0].x - result.at(-1)!.x, result[0].y - result.at(-1)!.y) < 1e-8)
      result.pop();
    return result;
  });
}
export function mapContours(contours: CadContour[], transform: (p: CadPoint) => CadPoint): CadContour[] {
  return contours.map((c) => ({
    closed: c.closed,
    nodes: c.nodes.map((n) => {
      const p = transform(n),
        a = transform({ x: n.x + n.inX, y: n.y + n.inY }),
        b = transform({ x: n.x + n.outX, y: n.y + n.outY });
      return { ...p, inX: a.x - p.x, inY: a.y - p.y, outX: b.x - p.x, outY: b.y - p.y, mode: n.mode };
    })
  }));
}
/** Cubic approximation used only by explicit Convert to curves; native CAD circles stay analytic. */
export function arcContour(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  start: number,
  sweep: number,
  maxStep = Math.PI / 2
): CadContour {
  const count = Math.max(1, Math.ceil(Math.abs(sweep) / maxStep)),
    step = sweep / count;
  if (count > CAD_CURVE_NODE_LIMIT - 1) throw new Error('limit');
  const nodes: CadBezierNode[] = [];
  for (let i = 0; i <= count; i++) {
    const a = start + step * i,
      k = (4 / 3) * Math.tan(step / 4);
    nodes.push({
      x: cx + rx * Math.cos(a),
      y: cy + ry * Math.sin(a),
      inX: i ? rx * Math.sin(a) * k : 0,
      inY: i ? -ry * Math.cos(a) * k : 0,
      outX: i < count ? -rx * Math.sin(a) * k : 0,
      outY: i < count ? ry * Math.cos(a) * k : 0,
      mode: 'smooth'
    });
  }
  const closed = Math.abs(Math.abs(sweep) - Math.PI * 2) < 1e-8;
  if (closed) {
    const last = nodes.pop()!;
    nodes[0].inX = last.inX;
    nodes[0].inY = last.inY;
  }
  return { closed, nodes };
}
