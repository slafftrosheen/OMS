import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTLStore, defaultShapeUtils, DocumentRecordType, Editor, getIndexAbove, HistoryManager, Mat, PageRecordType, TLDOCUMENT_ID, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import DxfParser from 'dxf-parser';
import { traceRaster, DEFAULT_TRACE_OPTIONS, type TraceOptions } from '../../src/lib/components/canvas/cad-trace';
import type { CadBezierNode, CadContour } from '../../src/lib/components/canvas/cad-curves';
import { validContours } from '../../src/lib/components/canvas/cad-curves';
import { prepareVectorImport, type VectorDocument, type VectorPath } from '../../src/lib/components/canvas/cad-vector';
import { applyCadPlan } from '../../src/lib/components/canvas/cad-plans';
import { CadBezierShapeUtil } from '../../src/lib/components/canvas/shapes/CadBezierShape';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { prepareVectorExport } from '../../src/lib/components/canvas/cad-vector-export';
import { pdfOperatorsToVectors } from '../../src/lib/components/canvas/cad-pdf';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';

type Point = { x: number; y: number };
type Rgba = readonly [number, number, number, number];
const BLACK: Rgba = [0, 0, 0, 255], WHITE: Rgba = [255, 255, 255, 255];
const RED: Rgba = [255, 0, 0, 255], BLUE: Rgba = [0, 0, 255, 255];
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (actual: number, expected: number, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected} by more than ${tolerance}`);
const options = (patch: Partial<TraceOptions> = {}): TraceOptions => ({ ...DEFAULT_TRACE_OPTIONS, noise: 0, smoothing: .75, preserveCorners: true, ...patch });

function raster(width: number, height: number, pixel: (x: number, y: number) => Rgba) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x + .5, y + .5), (y * width + x) * 4);
  return { width, height, data };
}
const mono = (width: number, height: number, inside: (x: number, y: number) => boolean) => raster(width, height, (x, y) => inside(x, y) ? BLACK : WHITE);
const disk = (size = 128, radius = 44) => mono(size, size, (x, y) => Math.hypot(x - size / 2, y - size / 2) <= radius);
const allContours = (document: VectorDocument) => document.paths.flatMap(path => path.contours);
function oneContour(document: VectorDocument) {
  assert.equal(document.paths.length, 1); assert.equal(document.paths[0].contours.length, 1);
  return document.paths[0].contours[0];
}

// Independent Bernstein evaluation: no production fitter, flattening, or cubic
// evaluator participates in the precision and containment oracles below.
function at(a: CadBezierNode, b: CadBezierNode, t: number): Point {
  const s = 1 - t;
  return {
    x: s ** 3 * a.x + 3 * s ** 2 * t * (a.x + a.outX) + 3 * s * t ** 2 * (b.x + b.inX) + t ** 3 * b.x,
    y: s ** 3 * a.y + 3 * s ** 2 * t * (a.y + a.outY) + 3 * s * t ** 2 * (b.y + b.inY) + t ** 3 * b.y,
  };
}
function curved(a: CadBezierNode, b: CadBezierNode): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs(dx * a.outY - dy * a.outX) > 1e-7 || Math.abs(dx * b.inY - dy * b.inX) > 1e-7;
}
const curvedCount = (contour: CadContour) => contour.nodes.filter((a, i, nodes) => curved(a, nodes[(i + 1) % nodes.length])).length;
const polygons = new WeakMap<CadContour, Point[]>();
function polygon(contour: CadContour): Point[] {
  const cached = polygons.get(contour); if (cached) return cached;
  const points: Point[] = [];
  contour.nodes.forEach((a, i, nodes) => {
    const b = nodes[(i + 1) % nodes.length], steps = curved(a, b) ? 96 : 1;
    for (let j = 0; j < steps; j++) points.push(at(a, b, j / steps));
  });
  polygons.set(contour, points); return points;
}
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}
function boundaryDistance(p: Point, points: Point[]): number {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) best = Math.min(best, segmentDistance(p, points[i], points[(i + 1) % points.length]));
  return best;
}
function containsContour(contour: CadContour, p: Point): boolean {
  let inside = false; const points = polygon(contour);
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function containsPath(path: VectorPath, p: Point): boolean {
  assert.equal(path.fillRule, 'evenodd');
  return path.contours.filter(contour => containsContour(contour, p)).length % 2 === 1;
}
const contains = (document: VectorDocument, x: number, y: number) => document.paths.some(path => containsPath(path, { x, y }));
function assertSimple(contour: CadContour) {
  const points = polygon(contour), cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < points.length; i++) for (let j = i + 2; j < points.length; j++) {
    if (i === 0 && j === points.length - 1) continue;
    const a = points[i], b = points[(i + 1) % points.length], c = points[j], d = points[(j + 1) % points.length];
    if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
        Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.max(c.y, d.y) < Math.min(a.y, b.y)) continue;
    assert.ok(!(cross(a, b, c) * cross(a, b, d) < -1e-10 && cross(c, d, a) * cross(c, d, b) < -1e-10), 'fitted boundary crosses itself');
  }
}
function assertSmooth(contour: CadContour) {
  assert.equal(contour.closed, true);
  assert.ok(distance(contour.nodes[0], contour.nodes.at(-1)!) > 1e-6, 'closed seam must not duplicate its endpoint');
  contour.nodes.forEach((node, i, nodes) => {
    const previous = nodes[(i + nodes.length - 1) % nodes.length], next = nodes[(i + 1) % nodes.length];
    const incoming = Math.hypot(node.inX, node.inY) > 1e-8 ? { x: -node.inX, y: -node.inY } : { x: node.x - previous.x, y: node.y - previous.y };
    const outgoing = Math.hypot(node.outX, node.outY) > 1e-8 ? { x: node.outX, y: node.outY } : { x: next.x - node.x, y: next.y - node.y };
    const cosine = (incoming.x * outgoing.x + incoming.y * outgoing.y) / Math.hypot(incoming.x, incoming.y) / Math.hypot(outgoing.x, outgoing.y);
    assert.ok(cosine >= Math.cos(Math.PI / 180), `join ${i}, including closing seam, exceeds one degree: ${Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI}`);
  });
}
function roundedRectangleDistance(x: number, y: number): number {
  const qx = Math.abs(x - 64) - 34, qy = Math.abs(y - 64) - 18;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 14;
}

describe('raster tracing precision against independent analytic fixtures', () => {
  for (const [size, radius] of [[32, 11], [128, 44]]) it(`fits a ${size}px disk with genuine cubic spans, bounded radial error, and a smooth seam`, () => {
    const contour = oneContour(traceRaster(disk(size, radius), options({ preserveCorners: false })));
    assert.ok(validContours([contour])); assert.ok(curvedCount(contour) >= 2, 'a rounded trace needs non-collinear controls, not only C commands');
    assert.ok(contour.nodes.length <= 40, `unexpected node explosion: ${contour.nodes.length}`);
    for (const p of polygon(contour)) near(Math.hypot(p.x - size / 2, p.y - size / 2), radius, 1.75);
    assertSmooth(contour); assertSimple(contour);
  });

  it('fits a rotated ellipse within the pixel tolerance without a seam kink', () => {
    const angle = .47, c = Math.cos(angle), s = Math.sin(angle);
    const image = mono(160, 140, (x, y) => ((x - 80) * c + (y - 70) * s) ** 2 / 54 ** 2 + (-(x - 80) * s + (y - 70) * c) ** 2 / 29 ** 2 <= 1);
    const reference = Array.from({ length: 1024 }, (_, i) => {
      const t = i * 2 * Math.PI / 1024, x = 54 * Math.cos(t), y = 29 * Math.sin(t);
      return { x: 80 + x * c - y * s, y: 70 + x * s + y * c };
    });
    const contour = oneContour(traceRaster(image, options({ preserveCorners: false })));
    assert.ok(curvedCount(contour) >= 2); assert.ok(contour.nodes.length <= 48, `a smooth ellipse should not need ${contour.nodes.length} nodes`);
    for (const p of polygon(contour)) assert.ok(boundaryDistance(p, reference) <= 1.75, 'ellipse fit exceeds raster quantization plus fitting allowance');
    assertSmooth(contour);
  });

  it('keeps straight sides and genuinely curved rounded corners in the same trace', () => {
    const contour = oneContour(traceRaster(mono(128, 128, (x, y) => roundedRectangleDistance(x, y) <= 0), options()));
    assert.ok(curvedCount(contour) >= 4, 'each rounded corner must remain curved');
    assert.ok(curvedCount(contour) < contour.nodes.length, 'long straight sides should stay straight');
    assert.ok(contour.nodes.length <= 40);
    for (const p of polygon(contour)) near(roundedRectangleDistance(p.x, p.y), 0, 1.75);
    assertSimple(contour);
  });

  it('preserves exact hard rectangle corners rather than rounding all boundaries', () => {
    const contour = oneContour(traceRaster(mono(128, 128, (x, y) => x >= 16 && x < 112 && y >= 24 && y < 104), options({ preserveCorners: true })));
    for (const corner of [{ x: 16, y: 24 }, { x: 112, y: 24 }, { x: 112, y: 104 }, { x: 16, y: 104 }])
      assert.ok(contour.nodes.some(node => distance(node, corner) < 1e-7 && node.mode === 'corner'), `missing hard corner ${JSON.stringify(corner)}`);
    assert.equal(curvedCount(contour), 0);
    assert.ok(contour.nodes.length <= 8);
    for (const p of polygon(contour)) assert.ok(Math.min(Math.abs(p.x - 16), Math.abs(p.x - 112), Math.abs(p.y - 24), Math.abs(p.y - 104)) < 1e-7);
  });

  it('honors both tight and loose pixel budgets without turning curves into polygons', () => {
    const image = disk();
    for (const tolerance of [.2, 1.5]) {
      const contour = oneContour(traceRaster(image, options({ smoothing: tolerance, preserveCorners: false })));
      assert.ok(curvedCount(contour) >= 2);
      for (const p of polygon(contour)) near(Math.hypot(p.x - 64, p.y - 64), 44, tolerance + 1);
    }
  });

  it('bounds both curve overshoot and missed detail against independently extracted raster edges', () => {
    const image = disk(64, 23), edges: [Point, Point][] = [];
    const filled = (x: number, y: number) => x >= 0 && x < 64 && y >= 0 && y < 64 && image.data[(y * 64 + x) * 4] === 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (filled(x, y)) {
      if (!filled(x - 1, y)) edges.push([{ x, y }, { x, y: y + 1 }]);
      if (!filled(x + 1, y)) edges.push([{ x: x + 1, y }, { x: x + 1, y: y + 1 }]);
      if (!filled(x, y - 1)) edges.push([{ x, y }, { x: x + 1, y }]);
      if (!filled(x, y + 1)) edges.push([{ x, y: y + 1 }, { x: x + 1, y: y + 1 }]);
    }
    for (const tolerance of [.2, .75]) {
      const points = polygon(oneContour(traceRaster(image, options({ smoothing: tolerance, preserveCorners: false }))));
      // These are exact pixel edges, so only the independent curve sampling
      // approximation gets a small allowance. Raster quantization uncertainty
      // applies to the separate analytic-shape tests, not this certificate.
      for (const p of points) assert.ok(Math.min(...edges.map(([a, b]) => segmentDistance(p, a, b))) <= tolerance + .02, 'curve escapes the raster boundary budget');
      for (const [a, b] of edges) for (const t of [0, .5, 1]) assert.ok(boundaryDistance({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, points) <= tolerance + .02, 'fitting loses raster boundary detail');
    }
  });

  it('traces antialiased black-on-white and transparent black edges consistently', () => {
    const coverage = (x: number, y: number) => Math.max(0, Math.min(1, 44.5 - Math.hypot(x - 64, y - 64)));
    const opaque = raster(128, 128, (x, y) => { const value = Math.round(255 * (1 - coverage(x, y))); return [value, value, value, 255]; });
    const alpha = raster(128, 128, (x, y) => [0, 0, 0, Math.round(255 * coverage(x, y))]);
    const a = oneContour(traceRaster(opaque, options({ preserveCorners: false }))), b = oneContour(traceRaster(alpha, options({ preserveCorners: false })));
    assert.ok(curvedCount(a) >= 2); assert.ok(curvedCount(b) >= 2);
    for (const p of polygon(a)) assert.ok(boundaryDistance(p, polygon(b)) < .01);
    for (const p of polygon(b)) near(Math.hypot(p.x - 64, p.y - 64), 44, 1.75);
  });
});

describe('raster tracing topology, shared boundaries, and alpha', () => {
  it('retains a ring hole and its separate nested island', () => {
    const document = traceRaster(mono(128, 128, (x, y) => { const radius = Math.hypot(x - 64, y - 64); return radius <= 8 || radius >= 22 && radius <= 44; }), options());
    assert.equal(document.paths.length, 2); assert.equal(allContours(document).length, 3);
    assert.equal(contains(document, 64, 64), true); assert.equal(contains(document, 79, 64), false);
    assert.equal(contains(document, 96, 64), true); assert.equal(contains(document, 114, 64), false);
    for (const contour of allContours(document)) { assert.equal(contour.closed, true); assertSimple(contour); }
  });

  it('retains a two-pixel hole with noise removal disabled', () => {
    const document = traceRaster(mono(64, 64, (x, y) => x >= 8 && x < 56 && y >= 8 && y < 56 && !(x >= 31 && x < 33 && y >= 31 && y < 33)), options());
    assert.equal(document.paths.length, 1); assert.equal(document.paths[0].contours.length, 2);
    assert.equal(contains(document, 32, 32), false); assert.equal(contains(document, 29.5, 32), true);
  });

  it('preserves a narrow connector and the empty areas beside it', () => {
    const document = traceRaster(mono(96, 64, (x, y) =>
      x >= 8 && x < 32 && y >= 12 && y < 52 || x >= 64 && x < 88 && y >= 12 && y < 52 || x >= 32 && x < 64 && y >= 31 && y < 33), options());
    assert.equal(document.paths.length, 1); assert.equal(allContours(document).length, 1);
    for (const x of [30, 36, 48, 60, 66]) assert.equal(contains(document, x, 32), true, 'two-pixel connector was severed');
    assert.equal(contains(document, 48, 29), false); assert.equal(contains(document, 48, 35), false);
    assertSimple(document.paths[0].contours[0]);
  });

  it('does not close a one-pixel gap between nearly touching regions', () => {
    const document = traceRaster(mono(64, 64, (x, y) => y >= 8 && y < 56 && (x >= 8 && x < 31 || x >= 32 && x < 56)), options());
    assert.equal(document.paths.length, 2);
    for (const y of [12, 24, 40, 52]) {
      assert.equal(contains(document, 30.5, y), true); assert.equal(contains(document, 31.5, y), false); assert.equal(contains(document, 32.5, y), true);
    }
  });

  it('fits the same curved color boundary without a gap or overlap', () => {
    const edge = (y: number) => 48 + 12 * Math.sin((y - 8) * Math.PI / 80);
    const document = traceRaster(raster(96, 96, (x, y) => x >= 8 && x < 88 && y >= 8 && y < 88 ? x < edge(y) ? RED : BLUE : WHITE), options({ mode: 'color', colors: 3 }));
    assert.equal(document.paths.length, 2);
    const red = document.paths.find(path => path.paint.fill === '#ff0000')!, blue = document.paths.find(path => path.paint.fill === '#0000ff')!;
    assert.ok(red && blue, 'exact palette colors must survive quantization');
    let tested = 0;
    for (const contour of red.contours) for (const p of polygon(contour)) if (p.y > 10 && p.y < 86 && Math.abs(p.x - edge(p.y)) < 3) {
      assert.ok(Math.min(...blue.contours.map(other => boundaryDistance(p, polygon(other)))) < .0001, 'adjacent colors have independently displaced edges');
      tested++;
    }
    assert.ok(tested > 10, 'shared curved edge was not exercised');
    for (let y = 12.3; y < 85; y += 4) for (let x = edge(y) - 2; x <= edge(y) + 2; x += .2)
      assert.equal(Number(containsPath(red, { x, y })) + Number(containsPath(blue, { x, y })), 1, 'shared boundary contains a gap or overlapping color fills');
  });

  it('keeps transparent padding empty while retaining opaque white when requested', () => {
    const document = traceRaster(raster(64, 64, (x, y) => {
      if (x < 8 || x >= 56 || y < 8 || y >= 56) return [255, 0, 255, 0];
      return x >= 24 && x < 40 && y >= 24 && y < 40 ? BLACK : WHITE;
    }), options({ removeWhite: false }));
    assert.ok(document.paths.some(path => path.paint.fill === '#ffffff'));
    assert.equal(contains(document, 2, 32), false); assert.equal(contains(document, 32, 2), false);
    assert.equal(contains(document, 12, 32), true); assert.equal(contains(document, 32, 32), true);
  });

  it('keeps visible color and opacity instead of introducing a white matte', () => {
    const document = traceRaster(raster(64, 64, (x, y) => x >= 12 && x < 52 && y >= 12 && y < 52 ? [210, 30, 70, 128] : [0, 255, 0, 0]), options({ mode: 'color', colors: 2, removeWhite: false }));
    assert.equal(document.paths.length, 1); assert.equal(document.paths[0].paint.fill, '#d21e46');
    near(document.paths[0].paint.fillOpacity, 128 / 255);
    assert.equal(contains(document, 6, 32), false); assert.equal(contains(document, 32, 32), true);
  });

  it('applies the explicit white-removal switch to visible white without filling transparent pixels', () => {
    const image = raster(64, 64, (x, y) => x < 8 || x >= 56 || y < 8 || y >= 56 ? [0, 0, 0, 0] : x >= 24 && x < 40 && y >= 24 && y < 40 ? WHITE : BLACK);
    const retained = traceRaster(image, options({ removeWhite: false })), removed = traceRaster(image, options({ removeWhite: true }));
    assert.equal(contains(retained, 32, 32), true); assert.equal(contains(removed, 32, 32), false);
    assert.equal(contains(retained, 2, 32), false); assert.equal(contains(removed, 2, 32), false);
    assert.equal(contains(retained, 12, 32), true); assert.equal(contains(removed, 12, 32), true);
  });
});

describe('raster tracing determinism, detail filters, and bounds', () => {
  it('is deterministic across runs and leaves the caller RGBA buffer unchanged', () => {
    const image = raster(80, 80, (x, y) => x < 8 || x > 72 || y < 8 || y > 72 ? WHITE : x < 28 ? RED : x < 52 ? BLUE : [30, 200, 50, 255]);
    const original = image.data.slice(), first = traceRaster(image, options({ mode: 'color', colors: 4 }));
    assert.deepEqual(traceRaster(image, options({ mode: 'color', colors: 4 })), first);
    assert.deepEqual(image.data, original);
    assert.deepEqual(new Set(first.paths.map(path => path.paint.fill)), new Set(['#ff0000', '#0000ff', '#1ec832']));
  });

  it('quantizes a many-color source reproducibly to the requested palette size', () => {
    const image = raster(48, 48, (x, y) => [Math.round(x * 5), Math.round(y * 5), Math.round((x + y) * 2), 255]);
    const settings = options({ mode: 'color', colors: 4, removeWhite: false });
    const a = traceRaster(image, settings), b = traceRaster(image, settings);
    assert.deepEqual(a, b); assert.ok(new Set(a.paths.map(path => path.paint.fill)).size <= 4);
    assert.ok(a.paths.length >= 2);
    for (const p of [{ x: 2, y: 2 }, { x: 24, y: 24 }, { x: 46, y: 46 }]) assert.equal(contains(a, p.x, p.y), true);
  });

  it('removes only deliberately filtered small-perimeter components', () => {
    const image = mono(64, 64, (x, y) => x >= 16 && x < 48 && y >= 16 && y < 48 || x >= 5 && x < 7 && y >= 5 && y < 7);
    const detailed = traceRaster(image, options({ noise: 0 })), cleaned = traceRaster(image, options({ noise: 12 }));
    assert.equal(detailed.paths.length, 2); assert.equal(cleaned.paths.length, 1);
    assert.equal(contains(detailed, 6, 6), true); assert.equal(contains(cleaned, 6, 6), false); assert.equal(contains(cleaned, 32, 32), true);
  });

  it('rejects invalid options and dimensions before attempting a trace', () => {
    const image = disk(32, 11);
    for (const patch of [{ smoothing: NaN }, { smoothing: .09 }, { smoothing: 5.01 }, { colors: 2.5 }, { threshold: Infinity }, { noise: -1 }, { preserveCorners: 'yes' }] as any[])
      assert.throws(() => traceRaster(image, options(patch)), /geometry|invalid/);
    assert.throws(() => traceRaster({ width: 2049, height: 1, data: new Uint8ClampedArray(2049 * 4) }, options()), /limit/);
    assert.throws(() => traceRaster({ width: 64, height: 64, data: new Uint8ClampedArray(4) }, options()), /geometry|limit|invalid/);
    assert.throws(() => traceRaster(raster(16, 16, () => [255, 0, 0, 0]), options({ removeWhite: false })), /empty/);
  });

  it('accepts a source larger than the old one-megapixel ceiling without changing dimensions', () => {
    const document = traceRaster(mono(1025, 1024, (x, y) => x >= 400 && x < 600 && y >= 400 && y < 600), options());
    assert.equal(document.width, 1025); assert.equal(document.height, 1024); assert.equal(document.paths.length, 1);
    assert.equal(curvedCount(document.paths[0].contours[0]), 0);
  });
});

/** Actual tldraw schema, Store, HistoryManager, and Editor.createShapes. Only
 * DOM-independent editor methods are adapted; this is not a pointer/UI test. */
function nativeCanvas() {
  const shapeUtils = [...defaultShapeUtils, CadBezierShapeUtil], store = createTLStore({ shapeUtils });
  const page = PageRecordType.create({ id: PageRecordType.createId('trace-precision'), name: 'Trace precision', index: 'a1' as any, meta: { omsCad: { ...DEFAULT_CAD_SETTINGS } } });
  store.put([page, DocumentRecordType.create({ id: TLDOCUMENT_ID })]);
  const history = new HistoryManager({ store }); let selected: TLShapeId[] = [], tool = 'select';
  const records = () => store.allRecords().filter(record => record.typeName === 'shape') as TLShape[];
  const children = (id: string) => records().filter(shape => shape.parentId === id).sort((a, b) => a.index < b.index ? -1 : 1);
  const editor: any = {
    store, options: { maxShapesPerPage: 2000 }, styleProps: { 'cad-bezier': new Map() },
    getShape: (id: TLShapeId) => { const shape = store.get(id); return shape?.typeName === 'shape' ? shape : undefined; },
    getCurrentPage: () => store.get(page.id), getCurrentPageId: () => page.id,
    getCurrentPageShapeIds: () => new Set(children(page.id).map(shape => shape.id)), getCurrentPageShapesSorted: () => children(page.id),
    getSelectedShapeIds: () => [...selected], setSelectedShapes: (ids: TLShapeId[]) => { selected = [...ids]; },
    getShapeAndDescendantIds: (ids: TLShapeId[]) => new Set(ids), isShapeOrAncestorLocked: () => false,
    getFocusedGroupId: () => page.id, getCurrentPageState: () => ({ focusedGroupId: null }), popFocusedGroupId() {},
    getInstanceState: () => ({ isReadonly: false, opacityForNextShape: 1 }), getInitialMetaForShape: () => ({}),
    getSortedChildIdsForParent: (id: string) => children(id).map(shape => shape.id),
    getHighestIndexForParent: (id: string) => children(id).length ? getIndexAbove(children(id).at(-1)!.index) : 'a1',
    getShapeMask: () => undefined, getBindingsInvolvingShape: () => [],
    getShapePageTransform: (input: TLShape | TLShapeId) => { const shape = typeof input === 'string' ? editor.getShape(input) : input; return Mat.Identity().translate(shape.x, shape.y).rotate(shape.rotation); },
    mark: history.mark.bind(history), run: history.batch, bailToMark: history.bailToMark,
    createShapes: Editor.prototype.createShapes, createShape: Editor.prototype.createShape,
    deleteShapes: (ids: TLShapeId[]) => { store.remove(ids); selected = selected.filter(id => !ids.includes(id)); },
    getCurrentToolId: () => tool, setCurrentTool: (value: string) => { tool = value; }, complete() {},
  };
  editor.getShapeUtil = () => new CadBezierShapeUtil(editor);
  return { editor: editor as Editor, store, history, records, snapshot: () => structuredClone(store.getStoreSnapshot('document')), dispose: () => history.dispose() };
}

async function readPdf(text: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  const task = pdfjs.getDocument({ data: new TextEncoder().encode(text), isEvalSupported: false, verbosity: 0 });
  try {
    const document = await task.promise, page = await document.getPage(1), list = await page.getOperatorList();
    return { pages: document.numPages, document: pdfOperatorsToVectors(list, pdfjs.OPS, page.getViewport({ scale: 1 })) };
  } finally { await task.destroy(); }
}

describe('traced cubic persistence and physical vector interchange', () => {
  it('preserves cubic handles through native schema, JSON reload, and one-step Undo/Redo', () => {
    const f = nativeCanvas();
    try {
      const document = traceRaster(disk(), options({ preserveCorners: false })), before = f.snapshot();
      const plan = prepareVectorImport(f.editor, DEFAULT_CAD_SETTINGS, document, 64, { x: 20, y: 30 }, 'Traced disk');
      assert.deepEqual(f.snapshot(), before, 'preview preparation must not write document records');
      assert.equal(applyCadPlan(f.editor, plan), true); assert.equal(f.records().length, 1);
      const shape = f.records()[0], savedContours = (shape.props as any).contours as CadContour[];
      assert.equal(shape.type, 'cad-bezier'); assert.ok(curvedCount(savedContours[0]) >= 2);
      assert.deepEqual(savedContours, plan.contours); assert.equal((shape.meta.omsVectorPaint as any).fill, '#000000');
      const after = f.snapshot(); f.history.undo(); assert.deepEqual(f.snapshot(), before); f.history.redo(); assert.deepEqual(f.snapshot(), after);
      const restored = createTLStore({ shapeUtils: [...defaultShapeUtils, CadBezierShapeUtil] });
      restored.loadStoreSnapshot(JSON.parse(JSON.stringify(after))); assert.deepEqual(restored.get(shape.id), f.store.get(shape.id));
    } finally { f.dispose(); }
  });

  it('exports degree-three DXF SPLINE controls at full physical size', () => {
    const f = nativeCanvas();
    try {
      const document = traceRaster(disk(), options({ preserveCorners: false }));
      const settings = { ...DEFAULT_CAD_SETTINGS, scale: 10 };
      assert.equal(applyCadPlan(f.editor, prepareVectorImport(f.editor, settings, document, 64, { x: 0, y: 0 }, 'Disk')), true);
      const output = buildCadDxf(f.editor, 'all', settings), parsed = new DxfParser().parseSync(output.text)!;
      assert.deepEqual(output.omitted, []); assert.equal(output.closedContours, 1); assert.equal(parsed.header.$INSUNITS, 4);
      const spline = parsed.entities[0] as any, source = oneContour(document);
      assert.equal(parsed.entities.length, 1); assert.equal(spline.type, 'SPLINE'); assert.equal(spline.degreeOfSplineCurve, 3);
      assert.equal(spline.controlPoints.length, 1 + source.nodes.length * 3);
      const expected = [source.nodes[0], ...source.nodes.flatMap((a, i, nodes) => { const b = nodes[(i + 1) % nodes.length]; return [{ x: a.x + a.outX, y: a.y + a.outY }, { x: b.x + b.inX, y: b.y + b.inY }, b]; })];
      expected.forEach((p, i) => { near(spline.controlPoints[i].x, p.x / 2); near(spline.controlPoints[i].y, -p.y / 2); });
    } finally { f.dispose(); }
  });

  it('reads real exported PDF cubic paths with retained hole topology and physical size', async () => {
    const f = nativeCanvas();
    try {
      const document = traceRaster(mono(128, 128, (x, y) => { const r = Math.hypot(x - 64, y - 64); return r <= 44 && r >= 22; }), options({ preserveCorners: false }));
      assert.equal(applyCadPlan(f.editor, prepareVectorImport(f.editor, DEFAULT_CAD_SETTINGS, document, 64, { x: 0, y: 0 }, 'Ring')), true);
      const exported = prepareVectorExport(f.editor, DEFAULT_CAD_SETTINGS, 'all', 'pdf'); assert.deepEqual(exported.omitted, []);
      const read = await readPdf(exported.text); assert.equal(read.pages, 1); assert.equal(read.document.paths.length, 1);
      const contours = allContours(read.document); assert.equal(contours.length, 2); assert.ok(contours.every(contour => curvedCount(contour) >= 2));
      const sourcePoints = allContours(document).flatMap(polygon), pdfPoints = contours.flatMap(polygon);
      const span = (points: Point[], axis: 'x' | 'y') => Math.max(...points.map(p => p[axis])) - Math.min(...points.map(p => p[axis]));
      near(span(pdfPoints, 'x'), span(sourcePoints, 'x') * .5 * 72 / 25.4, .002);
      near(span(pdfPoints, 'y'), span(sourcePoints, 'y') * .5 * 72 / 25.4, .002);
      const center = { x: (Math.max(...pdfPoints.map(p => p.x)) + Math.min(...pdfPoints.map(p => p.x))) / 2, y: (Math.max(...pdfPoints.map(p => p.y)) + Math.min(...pdfPoints.map(p => p.y))) / 2 };
      assert.equal(contains(read.document, center.x, center.y), false, 'PDF re-read filled the traced hole');
    } finally { f.dispose(); }
  });
});
