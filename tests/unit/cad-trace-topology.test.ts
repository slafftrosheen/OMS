import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { DEFAULT_TRACE_OPTIONS, traceRaster } from '../../src/lib/components/canvas/cad-trace';
import type { CadContour } from '../../src/lib/components/canvas/cad-curves';
import type { VectorDocument } from '../../src/lib/components/canvas/cad-paint';

type Pixel = [number, number, number, number];
const black: Pixel = [0, 0, 0, 255], white: Pixel = [255, 255, 255, 255];
function raster(size: number, color: (x: number, y: number) => Pixel) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data.set(color(x + .5, y + .5), (y * size + x) * 4);
  return { width: size, height: size, data };
}
// Independent Bernstein evaluation and even/odd fill classification. These
// tests inspect the saved cubic geometry rather than the fitter's own flatten.
function polygon(contour: CadContour) {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < contour.nodes.length; i++) {
    const a = contour.nodes[i], b = contour.nodes[(i + 1) % contour.nodes.length];
    for (let step = 0; step < 128; step++) {
      const t = step / 128, s = 1 - t;
      points.push({
        x: s ** 3 * a.x + 3 * s ** 2 * t * (a.x + a.outX) + 3 * s * t ** 2 * (b.x + b.inX) + t ** 3 * b.x,
        y: s ** 3 * a.y + 3 * s ** 2 * t * (a.y + a.outY) + 3 * s * t ** 2 * (b.y + b.inY) + t ** 3 * b.y,
      });
    }
  }
  return points;
}
function classifier(document: VectorDocument) {
  const paths = document.paths.map(path => path.contours.map(polygon));
  return (x: number, y: number) => paths.map(contours => {
    let inside = false;
    for (const points of contours) for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if ((a.y > y) !== (b.y > y) && x < a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y)) inside = !inside;
    }
    return inside;
  }).filter(Boolean).length;
}

describe('raster tracing topology safeguards', () => {
  it('tightens an excessive fit tolerance instead of swallowing small holes', () => {
    const image = raster(128, (x, y) => x >= 8 && x < 120 && y >= 8 && y < 120 &&
      Math.hypot(x - 32, y - 32) > 1.6 && Math.hypot(x - 96, y - 96) > 2.5 ? black : white);
    const document = traceRaster(image, { ...DEFAULT_TRACE_OPTIONS, smoothing: 5, preserveCorners: false });
    assert.equal(document.paths.length, 1);
    assert.equal(document.paths[0].contours.length, 3);
    assert.ok(document.warnings.includes('trace-topology'), 'a constrained fit must be disclosed');
    const contains = classifier(document);
    assert.equal(contains(32, 32), 0); assert.equal(contains(96, 96), 0);
    assert.equal(contains(64, 64), 1); assert.equal(contains(28, 32), 1);
  });

  it('keeps a raster diagonal contact exact even with smooth-corner fitting', () => {
    const image = raster(32, (x, y) => x < 16 && y < 16 || x >= 16 && y >= 16 ? black : white);
    const document = traceRaster(image, { ...DEFAULT_TRACE_OPTIONS, smoothing: 5, preserveCorners: false });
    const contacts = document.paths.flatMap(path => path.contours.flatMap(contour => contour.nodes))
      .filter(p => Math.hypot(p.x - 16, p.y - 16) < 1e-8);
    assert.ok(contacts.length >= 2, 'both traversals of the contact must retain the original junction');
    const contains = classifier(document);
    assert.equal(contains(15.5, 15.5), 1); assert.equal(contains(16.5, 16.5), 1);
    assert.equal(contains(15.5, 16.5), 0); assert.equal(contains(16.5, 15.5), 0);
  });

  it('retains a four-color junction with no crack or double-owned interior', () => {
    const colors: Pixel[] = [[255, 0, 0, 255], [0, 0, 255, 255], [0, 180, 0, 255], [220, 160, 0, 255]];
    const image = raster(64, (x, y) => Math.hypot(x - 32, y - 32) <= 25 ? colors[Number(x >= 32) + 2 * Number(y >= 32)] : [0, 0, 0, 0]);
    const document = traceRaster(image, { ...DEFAULT_TRACE_OPTIONS, mode: 'color', colors: 4, smoothing: 5, preserveCorners: false });
    assert.equal(document.paths.length, 4);
    for (const path of document.paths) assert.ok(path.contours.some(contour => contour.nodes.some(p => Math.hypot(p.x - 32, p.y - 32) < 1e-8)));
    const contains = classifier(document);
    for (const x of [20.25, 31.75, 32.25, 43.75]) for (const y of [20.25, 31.75, 32.25, 43.75]) assert.equal(contains(x, y), 1);
    assert.equal(contains(2, 32), 0);
  });

  it('discards a filtered outer component together with its longer hole boundary', () => {
    const image = raster(64, (x, y) => {
      const small = x >= 4 && x < 16 && y >= 4 && y < 16;
      const hole = x >= 6 && x < 14 && y >= 6 && y < 14 && (x >= 8 && x < 10 || Math.floor(y) % 2 === 0);
      return small && !hole || x >= 24 && x < 56 && y >= 24 && y < 56 ? black : white;
    });
    const detailed = traceRaster(image, DEFAULT_TRACE_OPTIONS);
    assert.equal(detailed.paths.length, 2); assert.equal(detailed.paths[0].contours.length, 2);
    const cleaned = traceRaster(image, { ...DEFAULT_TRACE_OPTIONS, noise: 55 });
    assert.equal(cleaned.paths.length, 1); assert.equal(cleaned.paths[0].contours.length, 1);
    assert.ok(cleaned.warnings.includes('trace-noise'));
    const contains = classifier(cleaned);
    assert.equal(contains(5, 5), 0); assert.equal(contains(9, 9), 0); assert.equal(contains(40, 40), 1);
  });

  it('reports a deliberately removed tiny hole without discarding its surrounding artwork', () => {
    const image = raster(64, (x, y) => x >= 8 && x < 56 && y >= 8 && y < 56 && !(x >= 31 && x < 33 && y >= 31 && y < 33) ? black : white);
    const document = traceRaster(image, { ...DEFAULT_TRACE_OPTIONS, noise: 9 });
    assert.equal(document.paths.length, 1); assert.equal(document.paths[0].contours.length, 1);
    assert.ok(document.warnings.includes('trace-noise'));
    assert.equal(classifier(document)(32, 32), 1);
  });

  it('bounds pathological pixel boundaries before fitting even when noise removal is high', () => {
    const image = raster(258, (x, y) => (Math.floor(x) + Math.floor(y)) % 2 ? black : white);
    assert.throws(() => traceRaster(image, { ...DEFAULT_TRACE_OPTIONS, noise: 100 }), /limit/);
  });
});
