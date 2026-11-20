import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { fitCenterlineChains, type CenterlineChain } from '../../src/lib/components/canvas/cad-trace-centerline-fit';
import { fitTraceBoundary } from '../../src/lib/components/canvas/cad-trace-fit';
import { traceRaster, DEFAULT_TRACE_OPTIONS } from '../../src/lib/components/canvas/cad-trace';
import type { CadContour } from '../../src/lib/components/canvas/cad-curves';
import type { CadPoint } from '../../src/lib/components/canvas/cad-settings';

const line = (a: CadPoint, b: CadPoint, count = 32): CenterlineChain => ({ closed: false,
  points: Array.from({ length: count + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / count, y: a.y + (b.y - a.y) * i / count })) });
const circle = (radius: number, center = { x: 40.5, y: 40.5 }): CenterlineChain => ({ closed: true,
  points: Array.from({ length: 80 }, (_, i) => ({ x: center.x + radius * Math.cos(i * Math.PI / 40), y: center.y + radius * Math.sin(i * Math.PI / 40) })) });
const near = (a: CadPoint, b: CadPoint) => assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-7, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
function samples(contour: CadContour): CadPoint[] {
  const points: CadPoint[] = [];
  for (let i = 0; i < contour.nodes.length - Number(!contour.closed); i++) {
    const a = contour.nodes[i], b = contour.nodes[(i + 1) % contour.nodes.length];
    for (let step = 0; step < 256; step++) {
      const t = step / 256, s = 1 - t;
      points.push({ x: s ** 3 * a.x + 3 * s * s * t * (a.x + a.outX) + 3 * s * t * t * (b.x + b.inX) + t ** 3 * b.x,
        y: s ** 3 * a.y + 3 * s * s * t * (a.y + a.outY) + 3 * s * t * t * (b.y + b.inY) + t ** 3 * b.y });
    }
  }
  points.push(contour.closed ? { ...contour.nodes[0] } : { ...contour.nodes.at(-1)! });
  return points;
}
function pointDistance(p: CadPoint, a: CadPoint, b: CadPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y, d = dx * dx + dy * dy;
  const t = d ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / d)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function polylineDistance(point: CadPoint, points: CadPoint[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) best = Math.min(best, pointDistance(point, points[i - 1], points[i]));
  return best;
}
function bounded(chain: CenterlineChain, contour: CadContour, tolerance: number) {
  const raw = chain.closed ? [...chain.points, chain.points[0]] : chain.points, fitted = samples(contour);
  for (const p of fitted) assert.ok(polylineDistance(p, raw) <= tolerance + .005, 'curve leaves the original skeleton tolerance');
  for (let i = 1; i < raw.length; i++) for (const p of [raw[i - 1], raw[i], { x: (raw[i - 1].x + raw[i].x) / 2, y: (raw[i - 1].y + raw[i].y) / 2 }])
    assert.ok(polylineDistance(p, fitted) <= tolerance + .005, 'curve skips skeleton detail');
}
function crossings(points: CadPoint[], a: CadPoint, b: CadPoint): number {
  let count = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1], q = points[i], dx = q.x - p.x, dy = q.y - p.y, ex = b.x - a.x, ey = b.y - a.y;
    const det = dx * ey - dy * ex;
    if (Math.abs(det) < 1e-12) continue;
    const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / det, u = ((a.x - p.x) * dy - (a.y - p.y) * dx) / det;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) count++;
  }
  return count;
}
function inside(points: CadPoint[], point: CadPoint): boolean {
  let result = false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < a.x + (point.y - a.y) * (b.x - a.x) / (b.y - a.y)) result = !result;
  }
  return result;
}

describe('centerline cubic fitting and graph relationships', () => {
  it('keeps horizontal, vertical and diagonal centerlines as exactly two editable endpoints', () => {
    for (const b of [{ x: 100.5, y: .5 }, { x: .5, y: 100.5 }, { x: 100.5, y: 100.5 }]) {
      const raw = line({ x: .5, y: .5 }, b), result = fitCenterlineChains([raw], .75, true);
      assert.equal(result.conservative, false); assert.equal(result.contours[0].closed, false); assert.equal(result.contours[0].nodes.length, 2);
      near(result.contours[0].nodes[0], raw.points[0]); near(result.contours[0].nodes[1], b);
      assert.ok(result.contours[0].nodes.every(n => !n.inX && !n.inY && !n.outX && !n.outY));
    }
  });

  it('fits a curved open stroke to genuine cubics while certifying both directions and preserving inputs', () => {
    const raw: CenterlineChain = { closed: false, points: Array.from({ length: 161 }, (_, i) => ({ x: i / 2 + .5, y: 30.5 + 18 * Math.sin(i * Math.PI / 80) })) };
    const before = structuredClone(raw), result = fitCenterlineChains([raw], .35, false), contour = result.contours[0];
    assert.equal(contour.closed, false); assert.ok(contour.nodes.length <= 16);
    assert.ok(contour.nodes.some(n => Math.abs(n.inY) > .1 || Math.abs(n.outY) > .1));
    near(contour.nodes[0], raw.points[0]); near(contour.nodes.at(-1)!, raw.points.at(-1)!);
    bounded(raw, contour, .35); assert.deepEqual(raw, before);
  });

  it('pins fractional T/Y junction coordinates without duplicating or joining independent branches', () => {
    const joint = { x: 13 / 3, y: 17 / 7 }, input = [line({ x: -30, y: -15 }, joint), line(joint, { x: 35, y: -18 }), line(joint, { x: 7, y: 45 })];
    const result = fitCenterlineChains(input, 5, false);
    assert.equal(result.conservative, false); assert.equal(result.contours.length, 3);
    for (const contour of result.contours) {
      assert.equal(contour.closed, false); assert.equal(contour.nodes.length, 2);
      assert.ok([contour.nodes[0], contour.nodes.at(-1)!].some(p => Math.hypot(p.x - joint.x, p.y - joint.y) < 1e-9));
    }
  });

  it('retains an attached closed loop and an open tail at the exact shared junction', () => {
    const loop = circle(12), junction = loop.points[0]; loop.forcedCorners = [0];
    const tail = line(junction, { x: junction.x + 18, y: junction.y });
    const result = fitCenterlineChains([loop, tail], .75, false);
    assert.equal(result.contours[0].closed, true); assert.equal(result.contours[1].closed, false);
    assert.ok(result.contours[0].nodes.some(p => Math.hypot(p.x - junction.x, p.y - junction.y) < 1e-9));
    near(result.contours[1].nodes[0], junction);
    bounded(loop, result.contours[0], .75); bounded(tail, result.contours[1], .75);
  });

  it('preserves closely nested independent cycles and their inside/outside order', () => {
    const outer = circle(12), inner = circle(10.8), result = fitCenterlineChains([outer, inner], 5, false);
    assert.ok(result.contours.every(c => c.closed));
    const outside = samples(result.contours[0]), insideLoop = samples(result.contours[1]);
    for (const point of insideLoop) assert.equal(inside(outside, point), true, 'inner loop exchanged sides with outer loop');
    bounded(outer, result.contours[0], 5); bounded(inner, result.contours[1], 5);
  });

  it('tightens a fit that would cut across a nearby disconnected branch', () => {
    const input: CenterlineChain = { closed: false, points: [
      ...Array.from({ length: 21 }, (_, i) => ({ x: .5, y: i + .5 })),
      ...Array.from({ length: 20 }, (_, i) => ({ x: i + 1.5, y: 20.5 })),
      ...Array.from({ length: 20 }, (_, i) => ({ x: 20.5, y: 19.5 - i })),
    ] };
    const branch: CenterlineChain = { closed: false, points: [{ x: 3.63, y: 16.49 }, { x: 3.63, y: 17.49 }] };
    const unconstrained = fitTraceBoundary(input.points, { closed: false, tolerance: 5, preserveCorners: false });
    assert.ok(crossings(samples(unconstrained), branch.points[0], branch.points[1]) > 0, 'fixture must expose an actual unconstrained crossing');
    assert.equal(crossings(input.points, branch.points[0], branch.points[1]), 0);
    const result = fitCenterlineChains([input, branch], 5, false);
    assert.equal(result.conservative, true);
    assert.equal(crossings(samples(result.contours[0]), branch.points[0], branch.points[1]), 0);
    bounded(input, result.contours[0], 5);
    near(result.contours[1].nodes[0], branch.points[0]); near(result.contours[1].nodes[1], branch.points[1]);
  });

  it('rejects a crossing without an explicit graph junction instead of publishing invalid topology', () => {
    assert.throws(() => fitCenterlineChains([
      line({ x: 0, y: 0 }, { x: 20, y: 20 }, 1), line({ x: 0, y: 20 }, { x: 20, y: 0 }, 1),
    ], .75, false), /geometry/);
  });

  it('handles many full-resolution parallel lines without quadratic raw/raw intersection work', () => {
    const input = Array.from({ length: 20 }, (_, i) => line({ x: i * 4 + .5, y: .5 }, { x: i * 4 + .5, y: 2047.5 }, 2047));
    const result = fitCenterlineChains(input, .75, true);
    assert.equal(result.conservative, false); assert.equal(result.contours.length, 20);
    assert.ok(result.contours.every(c => !c.closed && c.nodes.length === 2));
  });

  it('traces 480 separate raster strokes within the work limit in both orientations', () => {
    for (const vertical of [false, true]) {
      const width = vertical ? 1440 : 128, height = vertical ? 128 : 1440;
      const data = new Uint8ClampedArray(width * height * 4).fill(255);
      for (let row = 0; row < 480; row++) for (let along = 0; along < 128; along++) {
        const offset = (vertical ? along * width + row * 3 : row * 3 * width + along) * 4;
        data[offset] = data[offset + 1] = data[offset + 2] = 0;
      }
      const result = traceRaster({ width, height, data }, { ...DEFAULT_TRACE_OPTIONS, method: 'centerline' });
      assert.equal(result.paths.length, 480);
      assert.equal(result.warnings.includes('trace-topology'), false);
      const rows: number[] = [];
      for (const path of result.paths) {
        assert.equal(path.contours.length, 1);
        const contour = path.contours[0];
        assert.equal(contour.closed, false); assert.equal(contour.nodes.length, 2);
        const points = contour.nodes.map(p => vertical ? { x: p.y, y: p.x } : { x: p.x, y: p.y }).sort((a, b) => a.x - b.x);
        near(points[0], { x: .5, y: points[0].y }); near(points[1], { x: 127.5, y: points[0].y });
        assert.ok(contour.nodes.every(n => !n.inX && !n.inY && !n.outX && !n.outY));
        rows.push(points[0].y);
      }
      assert.deepEqual(rows.sort((a, b) => a - b), Array.from({ length: 480 }, (_, i) => i * 3 + .5));
    }
  });

  it('rejects invalid geometry, settings and aggregate contour limits', () => {
    const raw = line({ x: 0, y: 0 }, { x: 10, y: 0 });
    assert.throws(() => fitCenterlineChains([raw], NaN, true), /geometry/);
    assert.throws(() => fitCenterlineChains([raw], .75, undefined as any), /geometry/);
    assert.throws(() => fitCenterlineChains([{ ...raw, closed: true }], .75, true), /geometry/);
    assert.throws(() => fitCenterlineChains([{ ...raw, forcedCorners: [99] }], .75, true), /geometry/);
    assert.throws(() => fitCenterlineChains(Array.from({ length: 513 }, () => raw), .75, true), /limit/);
    assert.throws(() => fitCenterlineChains([{ closed: false, points: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }], .75, true), /geometry/);
  });
});
