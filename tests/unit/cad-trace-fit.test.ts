import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { fitTraceBoundary, MAX_TRACE_BOUNDARY_POINTS, type TraceFitOptions } from '../../src/lib/components/canvas/cad-trace-fit';
import { validContours, type CadBezierNode, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import type { CadPoint } from '../../src/lib/components/canvas/cad-settings';

const options = (patch: Partial<TraceFitOptions> = {}): TraceFitOptions => ({ tolerance: .75, preserveCorners: true, ...patch });
const distance = (a: CadPoint, b: CadPoint) => Math.hypot(a.x - b.x, a.y - b.y);

// Independent grid-edge extraction for simple connected fixtures. The fitter's
// scanner, curve evaluator and geometric certificate are not test oracles.
function pixelBoundary(size: number, inside: (x: number, y: number) => boolean): CadPoint[] {
  const grid = new Uint8Array(size * size), edges = new Map<string, CadPoint>();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) grid[y * size + x] = Number(inside(x + .5, y + .5));
  const filled = (x: number, y: number) => x >= 0 && x < size && y >= 0 && y < size && !!grid[y * size + x];
  const add = (x: number, y: number, u: number, v: number) => edges.set(`${x},${y}`, { x: u, y: v });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (filled(x, y)) {
    if (!filled(x, y - 1)) add(x, y, x + 1, y);
    if (!filled(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!filled(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!filled(x - 1, y)) add(x, y + 1, x, y);
  }
  const start = edges.keys().next().value!;
  assert.ok(start, 'fixture must have a boundary');
  const [x, y] = start.split(',').map(Number), points = [{ x, y }];
  let key = start;
  do {
    const next = edges.get(key)!; assert.ok(next, 'fixture edges must form one ordered loop');
    key = `${next.x},${next.y}`;
    if (key !== start) points.push(next);
    assert.ok(points.length <= edges.size);
  } while (key !== start);
  assert.equal(points.length, edges.size, 'test fixture must contain exactly one loop');
  return points;
}
const disk = (size: number, radius: number) => pixelBoundary(size, (x, y) => (x - size / 2) ** 2 + (y - size / 2) ** 2 <= radius ** 2);
const roundedRectangle = () => pixelBoundary(128, (x, y) => {
  const a = Math.abs(x - 64) - 34, b = Math.abs(y - 64) - 18;
  return Math.hypot(Math.max(a, 0), Math.max(b, 0)) + Math.min(Math.max(a, b), 0) <= 14;
});
function at(a: CadBezierNode, b: CadBezierNode, t: number): CadPoint {
  const s = 1 - t;
  return {
    x: s ** 3 * a.x + 3 * s * s * t * (a.x + a.outX) + 3 * s * t * t * (b.x + b.inX) + t ** 3 * b.x,
    y: s ** 3 * a.y + 3 * s * s * t * (a.y + a.outY) + 3 * s * t * t * (b.y + b.inY) + t ** 3 * b.y,
  };
}
function curved(a: CadBezierNode, b: CadBezierNode): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs(dx * a.outY - dy * a.outX) > 1e-7 || Math.abs(dx * b.inY - dy * b.inX) > 1e-7;
}
function curvedCount(contour: CadContour): number {
  return contour.nodes.slice(0, contour.nodes.length - (contour.closed ? 0 : 1)).filter((a, i) => curved(a, contour.nodes[(i + 1) % contour.nodes.length])).length;
}
function sample(contour: CadContour, steps = 128): CadPoint[] {
  const points: CadPoint[] = [];
  for (let i = 0; i < contour.nodes.length - (contour.closed ? 0 : 1); i++) {
    const a = contour.nodes[i], b = contour.nodes[(i + 1) % contour.nodes.length], count = curved(a, b) ? steps : 1;
    for (let j = 0; j < count; j++) points.push(at(a, b, j / count));
  }
  points.push(contour.closed ? contour.nodes[0] : contour.nodes.at(-1)!);
  return points;
}
function polylineDistance(point: CadPoint, points: CadPoint[]): number {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
    const x = point.x - a.x - t * dx, y = point.y - a.y - t * dy;
    best = Math.min(best, x * x + y * y);
  }
  return Math.sqrt(best);
}
function assertDeviation(raw: CadPoint[], contour: CadContour, tolerance: number, rawStride = 1) {
  const original = contour.closed ? [...raw, raw[0]] : raw, fitted = sample(contour);
  let outward = 0, lostDetail = 0;
  for (const point of fitted) outward = Math.max(outward, polylineDistance(point, original));
  for (let i = 0; i < original.length - 1; i += rawStride) for (const t of [0, .5, 1]) {
    const a = original[i], b = original[i + 1];
    lostDetail = Math.max(lostDetail, polylineDistance({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, fitted));
  }
  // Only numerical polygon sampling allowance; no additional half-pixel
  // uncertainty is added to the fitter's contract against actual raw edges.
  assert.ok(outward <= tolerance + .005, `curve-to-raw error ${outward} exceeds ${tolerance}`);
  assert.ok(lostDetail <= tolerance + .005, `raw-to-curve error ${lostDetail} exceeds ${tolerance}`);
}
function assertSmooth(contour: CadContour, except: CadPoint[] = []) {
  for (let i = contour.closed ? 0 : 1; i < contour.nodes.length - (contour.closed ? 0 : 1); i++) {
    const n = contour.nodes[i];
    if (except.some(p => distance(p, n) < 1e-8)) continue;
    const previous = contour.nodes[(i + contour.nodes.length - 1) % contour.nodes.length], next = contour.nodes[(i + 1) % contour.nodes.length];
    const incoming = Math.hypot(n.inX, n.inY) > 1e-8 ? { x: -n.inX, y: -n.inY } : { x: n.x - previous.x, y: n.y - previous.y };
    const outgoing = Math.hypot(n.outX, n.outY) > 1e-8 ? { x: n.outX, y: n.outY } : { x: next.x - n.x, y: next.y - n.y };
    const cosine = (incoming.x * outgoing.x + incoming.y * outgoing.y) / Math.hypot(incoming.x, incoming.y) / Math.hypot(outgoing.x, outgoing.y);
    assert.ok(cosine > 1 - 1e-7, `node ${i}, including the closing seam, is not tangent continuous`);
    assert.equal(n.mode, 'smooth');
  }
}

describe('bounded cubic fitting of raw raster edges', () => {
  for (const [size, radius] of [[32, 11], [128, 44]]) it(`fits a ${size}px disk as a few genuine, tangent-continuous cubics`, () => {
    const raw = disk(size, radius), contour = fitTraceBoundary(raw, options());
    assert.ok(validContours([contour])); assert.ok(contour.nodes.length <= 12);
    assert.ok(curvedCount(contour) >= 2); assertSmooth(contour); assertDeviation(raw, contour, .75);
  });

  for (const angle of [0, .47, Math.PI / 4]) it(`keeps a rotated ellipse editable at angle ${angle}`, () => {
    const c = Math.cos(angle), s = Math.sin(angle), raw = pixelBoundary(160, (x, y) =>
      ((x - 80) * c + (y - 70) * s) ** 2 / 54 ** 2 + (-(x - 80) * s + (y - 70) * c) ** 2 / 29 ** 2 <= 1);
    for (const points of [raw, [...raw].reverse()]) {
      const contour = fitTraceBoundary(points, options({ preserveCorners: false }));
      assert.ok(contour.nodes.length <= 48, `ellipse needs ${contour.nodes.length} nodes`);
      assert.ok(curvedCount(contour) >= 2); assertSmooth(contour); assertDeviation(points, contour, .75);
    }
  });

  it('retains exact straight sides joined smoothly to rounded corners', () => {
    const raw = roundedRectangle(), contour = fitTraceBoundary(raw, options()), curves = curvedCount(contour);
    assert.ok(contour.nodes.length <= 16); assert.ok(curves >= 4);
    assert.ok(contour.nodes.length - curves >= 4, 'all four long sides must remain exact line spans');
    assertSmooth(contour); assertDeviation(raw, contour, .75);
  });

  it('preserves exact square corners and native zero-handle line segments', () => {
    const raw = pixelBoundary(128, (x, y) => x >= 16 && x < 112 && y >= 24 && y < 104), contour = fitTraceBoundary(raw, options());
    assert.equal(contour.nodes.length, 4); assert.equal(curvedCount(contour), 0);
    for (const p of [{ x: 16, y: 24 }, { x: 112, y: 24 }, { x: 112, y: 104 }, { x: 16, y: 104 }]) {
      const node = contour.nodes.find(n => distance(n, p) < 1e-8); assert.ok(node);
      assert.equal(node.mode, 'corner'); assert.equal(Math.hypot(node.inX, node.inY, node.outX, node.outY), 0);
    }
  });

  it('fits a 2048px disk without a scale-driven node explosion or exhausting the shared budget', () => {
    const raw = disk(2048, 900), budget = { remaining: 32_000_000 }, contour = fitTraceBoundary(raw, options({ budget }));
    assert.equal(raw.length, 7200); assert.ok(contour.nodes.length <= 32, `${contour.nodes.length} nodes on a smooth large disk`);
    assert.equal(curvedCount(contour), contour.nodes.length); assert.ok(budget.remaining > 24_000_000);
    assertSmooth(contour); assertDeviation(raw, contour, .75, 4);
  });

  for (const tolerance of [.025, .2, 1.5]) it(`keeps both geometric error directions inside ${tolerance}px`, () => {
    const raw = disk(32, 11), contour = fitTraceBoundary(raw, options({ tolerance, preserveCorners: false }));
    assert.ok(curvedCount(contour) > 0); assertDeviation(raw, contour, tolerance);
  });

  it('keeps open-chain endpoints exact and returns no artificial closing span', () => {
    const circle = disk(64, 23), raw = circle.slice(10, 90), contour = fitTraceBoundary(raw, options({ closed: false, preserveCorners: false }));
    assert.equal(contour.closed, false); assert.ok(validContours([contour]));
    assert.equal(distance(contour.nodes[0], raw[0]), 0); assert.equal(distance(contour.nodes.at(-1)!, raw.at(-1)!), 0);
    assert.equal(Math.hypot(contour.nodes[0].inX, contour.nodes[0].inY), 0);
    assert.equal(Math.hypot(contour.nodes.at(-1)!.outX, contour.nodes.at(-1)!.outY), 0);
    assert.ok(curvedCount(contour) > 0); assertSmooth(contour); assertDeviation(raw, contour, .75);
  });

  it('handles a closed loop with exactly one forced contact vertex', () => {
    const raw = disk(64, 23), corner = raw[37], contour = fitTraceBoundary(raw, options({ preserveCorners: false, forcedCorners: [37] }));
    const node = contour.nodes.find(n => distance(n, corner) < 1e-8); assert.ok(node);
    assert.equal(node.mode, 'corner'); assert.equal(contour.closed, true);
    assertSmooth(contour, [corner]); assertDeviation(raw, contour, .75);
  });

  it('maps forced corner indices through consecutive duplicates and a duplicated closing point', () => {
    const raw = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 20 }, { x: 0, y: 0 }];
    const contour = fitTraceBoundary(raw, options({ preserveCorners: false, forcedCorners: [1, 3, 4, 5] }));
    assert.equal(contour.nodes.length, 3); assert.equal(curvedCount(contour), 0);
    assert.ok(contour.nodes.every(n => n.mode === 'corner'));
    assert.equal(contour.nodes.filter(n => n.x === 0 && n.y === 0).length, 1);
  });

  it('does not mutate input points, corner indices, or options', () => {
    const raw = Object.freeze(disk(32, 11).map(p => Object.freeze(p))), forcedCorners = Object.freeze([0]);
    const inputOptions = Object.freeze(options({ forcedCorners })), before = JSON.stringify({ raw, inputOptions });
    const contour = fitTraceBoundary(raw, inputOptions);
    assert.ok(validContours([contour])); assert.equal(JSON.stringify({ raw, inputOptions }), before);
  });

  it('returns a minimal exact line for a two-point open chain, including duplicate samples', () => {
    const contour = fitTraceBoundary([{ x: 2, y: 3 }, { x: 2, y: 3 }, { x: 17, y: 21 }], options({ closed: false }));
    assert.deepEqual(contour, { closed: false, nodes: [
      { x: 2, y: 3, inX: 0, inY: 0, outX: 0, outY: 0, mode: 'corner' },
      { x: 17, y: 21, inX: 0, inY: 0, outX: 0, outY: 0, mode: 'corner' },
    ] });
  });
});

describe('trace fitter limits and invalid geometry', () => {
  const triangle = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 0, y: 30 }];
  it('rejects invalid tolerances and coordinates without returning partial contours', () => {
    for (const tolerance of [0, .009, 5.01, NaN, Infinity]) assert.throws(() => fitTraceBoundary(triangle, options({ tolerance })), /geometry/);
    for (const value of [NaN, Infinity, 1e20]) assert.throws(() => fitTraceBoundary([{ x: value, y: 0 }, ...triangle], options()), /geometry/);
    assert.throws(() => fitTraceBoundary([], options()), /geometry/);
    assert.throws(() => fitTraceBoundary(triangle.slice(0, 2), options()), /geometry/);
    assert.throws(() => fitTraceBoundary([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], options()), /geometry/);
  });
  it('rejects invalid forced corner indices and malformed work budgets', () => {
    for (const index of [-1, 3, .5, NaN]) assert.throws(() => fitTraceBoundary(triangle, options({ forcedCorners: [index] })), /geometry/);
    for (const remaining of [-1, NaN, Infinity, .5]) assert.throws(() => fitTraceBoundary(triangle, options({ budget: { remaining } })), /geometry/);
  });
  it('exhausts a shared work budget deterministically and leaves it at zero', () => {
    const budget = { remaining: 1 };
    assert.throws(() => fitTraceBoundary(triangle, options({ budget })), /limit/); assert.equal(budget.remaining, 0);
    assert.throws(() => fitTraceBoundary(triangle, options({ budget })), /limit/); assert.equal(budget.remaining, 0);
  });
  it('caps raw input size and explicit corner output before unbounded fitting', () => {
    assert.throws(() => fitTraceBoundary(Array.from({ length: MAX_TRACE_BOUNDARY_POINTS + 1 }, () => ({ x: 0, y: 0 })), options()), /limit/);
    const raw = Array.from({ length: 4097 }, (_, i) => ({ x: 100 + 50 * Math.cos(i * Math.PI * 2 / 4097), y: 100 + 50 * Math.sin(i * Math.PI * 2 / 4097) }));
    assert.throws(() => fitTraceBoundary(raw, options({ preserveCorners: false, forcedCorners: raw.map((_, i) => i) })), /limit/);
  });
});
