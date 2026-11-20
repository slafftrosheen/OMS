import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { arcContour, contourSegments, nodeAt, splitCubic, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import { reduceCadGeometry } from '../../src/lib/components/canvas/cad-reduce-geometry';
import { DEFAULT_TRACE_OPTIONS, traceRaster } from '../../src/lib/components/canvas/cad-trace';
import type { CadPoint } from '../../src/lib/components/canvas/cad-settings';

const line = (...values: [number, number][]): CadContour => ({
  closed: false, nodes: values.map(([x, y]) => nodeAt({ x, y }))
});
function subdivide(contour: CadContour, depth: number): CadContour {
  const bisect = (points: CadPoint[], left: number): CadPoint[][] =>
    left ? splitCubic(points, .5).flatMap(part => bisect(part, left - 1)) : [points];
  const spans = [...contourSegments(contour)].flatMap(points => bisect(points, depth));
  const nodes = spans.map(([a, b], index) => {
    const entering = spans[index - 1] ?? (contour.closed ? spans.at(-1) : undefined);
    return { ...nodeAt(a), outX: b.x - a.x, outY: b.y - a.y, inX: entering ? entering[2].x - a.x : 0,
      inY: entering ? entering[2].y - a.y : 0, mode: 'smooth' as const };
  });
  if (!contour.closed) {
    const [, , c, d] = spans.at(-1)!;
    nodes.push({ ...nodeAt(d), inX: c.x - d.x, inY: c.y - d.y, mode: 'smooth' });
  }
  return { closed: contour.closed, nodes };
}

/** Independent evaluation and point-to-segment distances in both directions. */
function samples(contour: CadContour, resolution = 64): CadPoint[] {
  const points: CadPoint[] = [];
  const count = contour.nodes.length;
  for (let i = 0; i < count - Number(!contour.closed); i++) {
    const a = contour.nodes[i], b = contour.nodes[(i + 1) % count];
    for (let k = 0; k < resolution; k++) {
      const t = k / resolution, s = 1 - t;
      points.push({
        x: s ** 3 * a.x + 3 * s * s * t * (a.x + a.outX) + 3 * s * t * t * (b.x + b.inX) + t ** 3 * b.x,
        y: s ** 3 * a.y + 3 * s * s * t * (a.y + a.outY) + 3 * s * t * t * (b.y + b.inY) + t ** 3 * b.y
      });
    }
  }
  points.push(contour.closed ? contour.nodes[0] : contour.nodes.at(-1)!);
  return points;
}
function nearPath(point: CadPoint, path: CadPoint[]): number {
  let squared = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y;
    const denominator = dx ** 2 + dy ** 2;
    const t = denominator ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator)) : 0;
    squared = Math.min(squared, (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2);
  }
  return Math.sqrt(squared);
}
const area = (points: CadPoint[]) => points.slice(1).reduce((sum, b, i) => sum + points[i].x * b.y - points[i].y * b.x, 0) / 2;

describe('bounded CAD node reduction', () => {
  it('reassembles exact subdivisions of a native cubic and keeps endpoint positions', () => {
    const source = subdivide({ closed: false, nodes: [
      { ...nodeAt({ x: 0, y: 0 }), outX: 30, outY: 45 },
      { ...nodeAt({ x: 125, y: 48 }), inX: -39, inY: -2 }
    ] }, 7);
    const reduced = reduceCadGeometry([source], .0005, () => true);
    assert.equal(reduced.removed, 127);
    assert.ok(reduced.error < 1e-7);
    const [a, b] = reduced.contours[0].nodes;
    assert.equal(a.x, 0); assert.equal(a.y, 0); assert.equal(b.x, 125); assert.equal(b.y, 48);
    assert.ok(Math.abs(a.outX - 30) < 1e-8 && Math.abs(a.outY - 45) < 1e-8);
    assert.ok(Math.abs(b.inX + 39) < 1e-8 && Math.abs(b.inY + 2) < 1e-8);
  });

  it('bounds approximate changes in both directions and leaves a nearby boundary intact', () => {
    const source = line([0, 0], [100, 2], [200, 0]);
    assert.equal(reduceCadGeometry([source], .1, () => true).removed, 0);
    const loose = reduceCadGeometry([source], 2.1, () => true);
    assert.equal(loose.removed, 1);
    const original = samples(source), result = samples(loose.contours[0]);
    const measured = Math.max(...original.map(p => nearPath(p, result)), ...result.map(p => nearPath(p, original)));
    assert.ok(measured >= 1.99 && measured <= loose.error && loose.error <= 2.1);
    const neighbor = line([70, 1], [130, 1]);
    const guarded = reduceCadGeometry([source, neighbor], 2.1, () => true);
    assert.equal(guarded.removed, 0);
    assert.deepEqual(guarded.contours, [source, neighbor]);
  });

  it('keeps the seam, right angles and unselected nodes while retaining exact straight output', () => {
    const contour = { ...line([0, 0], [25, 0], [70, 0], [100, 0], [100, 40], [100, 70], [100, 100], [0, 100], [0, 60]), closed: true };
    const limited = reduceCadGeometry([contour], 1, (_ci, ni) => ni !== 2 && ni !== 5);
    assert.deepEqual(limited.indices[0], [0, 2, 3, 5, 6, 7]);
    assert.equal(limited.error, 0);
    assert.equal(area(samples(limited.contours[0])), 10000);
    assert.ok(limited.contours[0].nodes.every(n => !n.inX && !n.inY && !n.outX && !n.outY));
  });

  it('reduces a densely sampled raster trace while preserving all counters and their winding', () => {
    const size = 96, data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const outer = ((x + .5 - 48) / 36) ** 2 + ((y + .5 - 48) / 28) ** 2;
      const inner = ((x + .5 - 48) / 17) ** 2 + ((y + .5 - 48) / 10) ** 2;
      data.set(outer <= 1 && inner > 1 ? [0, 0, 0, 255] : [255, 255, 255, 255], 4 * (y * size + x));
    }
    const trace = traceRaster({ width: size, height: size, data }, DEFAULT_TRACE_OPTIONS);
    assert.equal(trace.paths.length, 1);
    assert.equal(trace.paths[0].contours.length, 2);
    const source = trace.paths[0].contours.map(contour => subdivide(contour, 4));
    const reduced = reduceCadGeometry(source, .003, () => true);
    assert.ok(source.reduce((sum, c) => sum + c.nodes.length, 0) > 100);
    assert.ok(reduced.removed > 85);
    assert.equal(reduced.contours.length, source.length);
    const originals = source.map(c => samples(c, 8)), results = reduced.contours.map(c => samples(c, 400));
    for (const [i, result] of reduced.contours.entries()) {
      assert.equal(result.closed, true);
      assert.deepEqual([result.nodes[0].x, result.nodes[0].y], [source[i].nodes[0].x, source[i].nodes[0].y]);
      assert.equal(Math.sign(area(originals[i])), Math.sign(area(results[i])));
      assert.ok(Math.abs(area(originals[i]) - area(results[i])) < .13);
      assert.ok(Math.max(...originals[i].map(p => nearPath(p, results[i]))) <= reduced.error + .001);
    }
  });

  it('handles the maximum node count and preserves analytic curved spans on dense rings', () => {
    const axis = line(...Array.from({ length: 4096 }, (_, index) => [index, 80] as [number, number]));
    const straight = reduceCadGeometry([axis], .001, () => true);
    assert.equal(straight.removed, 4094);
    assert.equal(straight.limited, false);
    const circle = subdivide(arcContour(0, 0, 150, 100, 0, Math.PI * 2), 8);
    const fitted = reduceCadGeometry([circle], .001, () => true);
    assert.ok(fitted.removed > 1000);
    assert.equal(fitted.contours[0].closed, true);
    assert.ok(fitted.contours[0].nodes.some(n => n.outX || n.outY));
  });
});
