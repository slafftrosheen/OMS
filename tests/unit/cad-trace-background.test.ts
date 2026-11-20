import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { traceRaster } from '../../src/lib/components/canvas/cad-trace';
import { traceBackgroundMask } from '../../src/lib/components/canvas/cad-trace-background';
import { applyTracePreset, DEFAULT_TRACE_OPTIONS, resolveTraceBackground, resolveTraceMethod, validTraceOptions, type TraceOptions } from '../../src/lib/components/canvas/cad-trace-options';
import type { VectorDocument } from '../../src/lib/components/canvas/cad-paint';

type Pixel = readonly [number, number, number, number];
const black: Pixel = [0, 0, 0, 255], white: Pixel = [255, 255, 255, 255], transparent: Pixel = [255, 20, 160, 0];
function raster(width: number, height: number, pixel: (x: number, y: number) => Pixel) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), 4 * (y * width + x));
  return { width, height, data };
}
const options = (patch: Partial<TraceOptions> = {}): TraceOptions => ({ ...DEFAULT_TRACE_OPTIONS, ...patch });
const ring = () => raster(32, 32, (x, y) => x >= 6 && x < 26 && y >= 6 && y < 26 &&
  !(x >= 12 && x < 20 && y >= 12 && y < 20) ? black : white);

// Independent Bernstein samples and even/odd classification of saved output.
function owners(document: VectorDocument, x: number, y: number): string[] {
  return document.paths.filter(path => {
    let inside = false;
    for (const contour of path.contours) {
      const points = contour.nodes.flatMap((a, i, all) => {
        const b = all[(i + 1) % all.length];
        return Array.from({ length: 32 }, (_, step) => {
          const t = step / 32, s = 1 - t;
          return { x: s ** 3 * a.x + 3 * s * s * t * (a.x + a.outX) + 3 * s * t * t * (b.x + b.inX) + t ** 3 * b.x,
            y: s ** 3 * a.y + 3 * s * s * t * (a.y + a.outY) + 3 * s * t * t * (b.y + b.inY) + t ** 3 * b.y };
        });
      });
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if ((a.y > y) !== (b.y > y) && x < a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y)) inside = !inside;
      }
    }
    return inside;
  }).map(path => path.paint.fill);
}

describe('trace background removal and palette isolation', () => {
  for (const mode of ['mono', 'color'] as const) it(`preserves enclosed white detail in ${mode} border mode and keeps legacy defaults`, () => {
    const input = ring(), saved = input.data.slice();
    const border = traceRaster(input, options({ mode, background: 'border' }));
    const all = traceRaster(input, options({ mode, background: 'all', removeWhite: false }));
    const keep = traceRaster(input, options({ mode, background: 'keep', removeWhite: true }));
    assert.deepEqual(owners(border, 2, 2), []);
    assert.deepEqual(owners(border, 8, 8), ['#000000']);
    assert.deepEqual(owners(border, 16, 16), ['#ffffff']);
    assert.deepEqual(owners(all, 16, 16), []);
    assert.deepEqual(owners(keep, 2, 2), ['#ffffff']);
    assert.deepEqual(owners(keep, 16, 16), ['#ffffff']);
    assert.deepEqual(traceRaster(input, options({ mode, removeWhite: true })), all);
    assert.deepEqual(traceRaster(input, options({ mode, removeWhite: false })), keep);
    assert.deepEqual(input.data, saved);
    assert.equal(all.paths[0].contours.length, 2, 'all-white removal leaves an actual compound hole');
  });

  it('floods through transparent padding without introducing hidden RGB into the palette', () => {
    const input = raster(24, 24, (x, y) => y === 10 && x < 10 ? transparent :
      x >= 10 && x < 13 && y >= 10 && y < 13 || x >= 17 && x < 20 && y >= 17 && y < 20 ? white : black);
    const mask = traceBackgroundMask(input, options({ background: 'border' }))!;
    assert.equal(mask[11 * 24 + 11], 1, 'the first white area connects to the edge through transparency');
    assert.equal(mask[18 * 24 + 18], 0, 'a sealed white area remains');
    const document = traceRaster(input, options({ mode: 'color', background: 'border', colors: 2 }));
    assert.deepEqual(owners(document, 11.5, 11.5), []);
    assert.deepEqual(owners(document, 18.5, 18.5), ['#ffffff']);
    assert.deepEqual(owners(document, 2.5, 10.5), []);
    assert.deepEqual(new Set(document.paths.map(p => p.paint.fill)), new Set(['#000000', '#ffffff']));
  });

  it('keeps a white region that touches border white only diagonally', () => {
    const input = raster(5, 5, (x, y) => x === y && x < 3 ? white : black);
    const border = traceBackgroundMask(input, options({ background: 'border' }))!;
    assert.equal(border[0], 1); assert.equal(border[6], 0); assert.equal(border[12], 0);
    const all = traceBackgroundMask(input, options({ background: 'all' }))!;
    assert.equal(all[6], 1); assert.equal(all[12], 1);
  });

  it('starts from all four image edges and leaves the sealed center intact', () => {
    const input = raster(9, 9, (x, y) =>
      x === 4 && (y < 3 || y >= 6) || y === 4 && (x < 3 || x >= 6) || x === 4 && y === 4 ? white : black);
    const mask = traceBackgroundMask(input, options({ background: 'border' }))!;
    for (const [x, y] of [[4, 2], [4, 6], [2, 4], [6, 4]]) assert.equal(mask[y * 9 + x], 1);
    assert.equal(mask[4 * 9 + 4], 0);
  });

  it('treats single-row and single-column images as entirely on the border', () => {
    for (const [width, height] of [[1, 13], [13, 1], [1, 1]]) {
      const input = raster(width, height, () => white);
      assert.deepEqual(traceBackgroundMask(input, options({ background: 'border' })), new Uint8Array(width * height).fill(1));
    }
  });

  it('uses thresholded visible luminance for mono and source near-white for color', () => {
    const input = raster(3, 1, x => x === 0 ? [150, 150, 150, 255] : x === 1 ? [0, 0, 0, 50] : [245, 250, 255, 255]);
    assert.deepEqual(traceBackgroundMask(input, options({ background: 'border', threshold: 128 })), new Uint8Array([1, 1, 1]));
    assert.deepEqual(traceBackgroundMask(input, options({ background: 'border', threshold: 200 })), new Uint8Array([0, 1, 1]));
    assert.deepEqual(traceBackgroundMask(input, options({ mode: 'color', background: 'border', threshold: 0 })), new Uint8Array([0, 0, 1]));
  });

  it('removes border white before a two-color palette can mix it into gray', () => {
    const input = raster(30, 10, x => x === 0 ? white : x < 16 ? [200, 200, 200, 255] : black);
    const document = traceRaster(input, options({ mode: 'color', colors: 2, background: 'border' }));
    assert.deepEqual(owners(document, .5, 5), []);
    assert.deepEqual(owners(document, 8, 5), ['#c8c8c8']);
    assert.deepEqual(owners(document, 24, 5), ['#000000']);
  });

  it('keeps transparent pixels absent with an explicit keep override', () => {
    const input = raster(16, 16, (x, y) => x >= 4 && x < 12 && y >= 4 && y < 12 ? white : transparent);
    const document = traceRaster(input, options({ mode: 'color', background: 'keep', removeWhite: true }));
    assert.deepEqual(owners(document, 8, 8), ['#ffffff']); assert.deepEqual(owners(document, 2, 2), []);
    assert.equal(document.paths.length, 1);
  });

  it('bounds the full-resolution flood and rejects oversized or malformed input', () => {
    const input = raster(2048, 2048, () => white);
    const mask = traceBackgroundMask(input, options({ background: 'border' }))!;
    assert.equal(mask.length, 4194304); assert.equal(mask.reduce((sum, value) => sum + value, 0), mask.length);
    assert.throws(() => traceBackgroundMask({ width: 2049, height: 1, data: new Uint8ClampedArray(8196) }, options({ background: 'border' })), /limit/);
    assert.throws(() => traceBackgroundMask({ width: 4, height: 4, data: new Uint8ClampedArray(3) }, options({ background: 'border' })), /limit/);
  });
});

describe('trace profiles and compatible options', () => {
  it('leaves background decisions and caller settings intact when selecting a profile', () => {
    const original = options({ mode: 'color', colors: 19, smoothing: 2, noise: 20, background: 'border', removeWhite: false });
    const snapshot = structuredClone(original);
    for (const preset of ['logo', 'lineart', 'color', 'technical', 'drawing'] as const) {
      const next = applyTracePreset(original, preset);
      assert.equal(next.background, 'border'); assert.equal(next.removeWhite, false);
      assert.ok(validTraceOptions(next));
      assert.notEqual(next, original);
      assert.deepEqual(original, snapshot);
    }
    assert.equal(applyTracePreset(original, 'lineart').mode, 'mono');
    assert.ok(applyTracePreset(original, 'lineart').smoothing < applyTracePreset(original, 'logo').smoothing);
  });

  it('keeps old callers valid without an explicit background field', () => {
    assert.ok(validTraceOptions(DEFAULT_TRACE_OPTIONS));
    assert.equal(resolveTraceBackground(options({ removeWhite: false })), 'keep');
    assert.equal(resolveTraceBackground(options({ removeWhite: true })), 'all');
    assert.equal(resolveTraceBackground(options({ removeWhite: false, background: 'all' })), 'all');
    assert.equal(resolveTraceBackground(options({ removeWhite: true, background: 'keep' })), 'keep');
    assert.equal(Object.hasOwn(DEFAULT_TRACE_OPTIONS, 'background'), false);
  });

  it('keeps historical mono/color dispatch identical to explicit filled outlines', () => {
    assert.equal(Object.hasOwn(DEFAULT_TRACE_OPTIONS, 'method'), false);
    assert.equal(resolveTraceMethod(DEFAULT_TRACE_OPTIONS), 'outline');
    for (const mode of ['mono', 'color'] as const) {
      const legacy = options({ mode, background: 'border' });
      assert.deepEqual(traceRaster(ring(), legacy), traceRaster(ring(), { ...legacy, method: 'outline' }));
    }
  });

  it('keeps fine line art filled while technical/drawing profiles produce open editable strokes', () => {
    const input = raster(32, 32, (x, y) => x >= 4 && x < 28 && y >= 14 && y < 18 ? black : white);
    const original = options({ mode: 'color', background: 'all' });
    const outline = traceRaster(input, applyTracePreset(original, 'lineart'));
    assert.equal(outline.paths.length, 1);
    assert.equal(outline.paths[0].paint.stroke, 'none');
    assert.equal(outline.paths[0].paint.fill, '#000000');
    assert.ok(outline.paths[0].contours.every(contour => contour.closed));
    for (const preset of ['technical', 'drawing'] as const) {
      const profile = applyTracePreset(original, preset), centerline = traceRaster(input, profile);
      assert.equal(profile.mode, 'mono'); assert.equal(resolveTraceMethod(profile), 'centerline');
      assert.equal(centerline.paths.length, 1);
      assert.equal(centerline.paths[0].paint.fill, 'none');
      assert.equal(centerline.paths[0].paint.stroke, '#000000');
      assert.ok(centerline.paths[0].contours.every(contour => !contour.closed));
    }
    assert.equal(applyTracePreset(applyTracePreset(original, 'drawing'), 'color').method, 'outline');
  });

  it('rejects unknown methods and color centerlines at the shared dispatch boundary', () => {
    for (const method of ['', null, false, 'skeleton']) {
      assert.equal(validTraceOptions({ ...DEFAULT_TRACE_OPTIONS, method }), false);
      assert.throws(() => traceRaster(ring(), { ...DEFAULT_TRACE_OPTIONS, method } as any), /geometry/);
    }
    const unsupported = options({ method: 'centerline', mode: 'color' });
    assert.equal(validTraceOptions(unsupported), false);
    assert.throws(() => traceRaster(ring(), unsupported), /geometry/);
  });

  it('rejects invalid explicit modes before geometry generation', () => {
    for (const background of ['', null, false, 'outside']) {
      assert.equal(validTraceOptions({ ...DEFAULT_TRACE_OPTIONS, background }), false);
      assert.throws(() => traceRaster(ring(), { ...DEFAULT_TRACE_OPTIONS, background } as any), /geometry/);
    }
    assert.throws(() => applyTracePreset(DEFAULT_TRACE_OPTIONS, '__proto__' as any), /geometry/);
  });
});
