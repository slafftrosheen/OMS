import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import { traceRaster, DEFAULT_TRACE_OPTIONS, type TraceOptions } from '../../src/lib/components/canvas/cad-trace';
import { traceCenterlineRaster } from '../../src/lib/components/canvas/cad-trace-centerline';
import { readCenterlineSkeleton } from '../../src/lib/components/canvas/cad-trace-skeleton';
import { validContours, type CadBezierNode, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import { validVectorPaint, type VectorDocument } from '../../src/lib/components/canvas/cad-paint';
import type { TraceRasterInput } from '../../src/lib/components/canvas/cad-trace-background';
import type { CadPoint } from '../../src/lib/components/canvas/cad-settings';

const options = (patch: Partial<TraceOptions> = {}): TraceOptions => ({ ...DEFAULT_TRACE_OPTIONS, method: 'centerline', ...patch });
function raster(width: number, height: number, inside: (x: number, y: number) => boolean): TraceRasterInput {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4, value = inside(x + .5, y + .5) ? 0 : 255;
    data.set([value, value, value, 255], index);
  }
  return { width, height, data };
}
function distanceToSegment(p: CadPoint, a: CadPoint, b: CadPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y, size = dx * dx + dy * dy;
  const t = size ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / size)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
const segment = (x: number, y: number, ax: number, ay: number, bx: number, by: number, radius: number) =>
  distanceToSegment({ x, y }, { x: ax, y: ay }, { x: bx, y: by }) <= radius;
function evaluate(a: CadBezierNode, b: CadBezierNode, t: number): CadPoint {
  const s = 1 - t;
  return {
    x: s ** 3 * a.x + 3 * s * s * t * (a.x + a.outX) + 3 * s * t * t * (b.x + b.inX) + t ** 3 * b.x,
    y: s ** 3 * a.y + 3 * s * s * t * (a.y + a.outY) + 3 * s * t * t * (b.y + b.inY) + t ** 3 * b.y,
  };
}
function sample(contour: CadContour, count = 48): CadPoint[] {
  const points: CadPoint[] = [];
  for (let i = 0; i < contour.nodes.length - Number(!contour.closed); i++) {
    for (let step = 0; step < count; step++) points.push(evaluate(contour.nodes[i], contour.nodes[(i + 1) % contour.nodes.length], step / count));
  }
  points.push(contour.closed ? contour.nodes[0] : contour.nodes.at(-1)!);
  return points;
}
function curveCount(contour: CadContour): number {
  let count = 0;
  for (let i = 0; i < contour.nodes.length - Number(!contour.closed); i++) {
    const a = contour.nodes[i], b = contour.nodes[(i + 1) % contour.nodes.length], dx = b.x - a.x, dy = b.y - a.y;
    count += Number(Math.abs(dx * a.outY - dy * a.outX) > 1e-7 || Math.abs(dx * b.inY - dy * b.inX) > 1e-7);
  }
  return count;
}
const contours = (document: VectorDocument) => document.paths.flatMap(path => path.contours);
const key = (p: CadPoint) => `${p.x},${p.y}`;

// Independent graph oracle over saved anchors, not the skeleton's adjacency or
// chain walker. A closed contour contributes its closing edge; branch endpoints
// must coincide exactly to remain one connected native drawing.
function graphStats(document: VectorDocument) {
  const adjacency = new Map<string, string[]>();
  let edges = 0;
  for (const contour of contours(document)) for (let i = 0; i < contour.nodes.length - Number(!contour.closed); i++) {
    const a = key(contour.nodes[i]), b = key(contour.nodes[(i + 1) % contour.nodes.length]);
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
    edges++;
  }
  const seen = new Set<string>();
  let components = 0;
  for (const vertex of adjacency.keys()) if (!seen.has(vertex)) {
    components++; const queue = [vertex]; seen.add(vertex);
    for (let i = 0; i < queue.length; i++) for (const next of adjacency.get(queue[i])!) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return { components, cycles: edges - adjacency.size + components,
    endpoints: [...adjacency.values()].filter(neighbors => neighbors.length === 1).length,
    junctions: [...adjacency.values()].filter(neighbors => neighbors.length > 2).map(neighbors => neighbors.length).sort() };
}

// Deliberately separate flood-fill oracle: coordinate keys and source RGBA,
// foreground eight-neighbors / padded background four-neighbors.
function pixelTopology(input: TraceRasterInput): { components: number; holes: number } {
  const seen = new Set<string>();
  const ink = (x: number, y: number) => x >= 0 && y >= 0 && x < input.width && y < input.height && input.data[(y * input.width + x) * 4] === 0;
  let components = 0, outside = 0;
  for (let y = -1; y <= input.height; y++) for (let x = -1; x <= input.width; x++) {
    const code = `${x},${y}`;
    if (seen.has(code)) continue;
    const foreground = ink(x, y), queue = [[x, y]];
    seen.add(code); if (foreground) components++; else outside++;
    for (let i = 0; i < queue.length; i++) {
      const [px, py] = queue[i];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!(dx || dy) || !foreground && dx && dy) continue;
        const nx = px + dx, ny = py + dy, next = `${nx},${ny}`;
        if (nx < -1 || nx > input.width || ny < -1 || ny > input.height || seen.has(next) || ink(nx, ny) !== foreground) continue;
        seen.add(next); queue.push([nx, ny]);
      }
    }
  }
  return { components, holes: outside - 1 };
}
function assertTopology(input: TraceRasterInput, document: VectorDocument) {
  const expected = pixelTopology(input), actual = graphStats(document);
  assert.equal(actual.components, expected.components);
  assert.equal(actual.cycles, expected.holes);
  assert.equal(document.paths.length, expected.components, 'one native object per connected component');
  assert.ok(validContours(contours(document)));
}

describe('monochrome native centerline tracing', () => {
  it('reduces thin and thick straight strokes to two exact editable endpoints', () => {
    for (const radius of [.49, 2.5, 8]) {
      const input = raster(128, 96, (x, y) => segment(x, y, 16.5, 48.5, 111.5, 48.5, radius));
      const result = traceRaster(input, options()), contour = result.paths[0].contours[0];
      assertTopology(input, result);
      assert.equal(contour.closed, false); assert.equal(contour.nodes.length, 2);
      assert.ok(contour.nodes.every(node => node.y === 48.5));
      assert.ok(Math.abs(contour.nodes[0].x - 16.5) <= 1 && Math.abs(contour.nodes[1].x - 111.5) <= 1);
      assert.equal(curveCount(contour), 0);
      assert.deepEqual(result.warnings, ['trace-centerline-approximation']);
      assert.ok(validVectorPaint(result.paths[0].paint));
      assert.deepEqual({ fill: result.paths[0].paint.fill, stroke: result.paths[0].paint.stroke,
        width: result.paths[0].paint.strokeWidth, cap: result.paths[0].paint.lineCap, join: result.paths[0].paint.lineJoin },
      { fill: 'none', stroke: '#000000', width: 1, cap: 'round', join: 'round' });
    }
  });

  it('keeps diagonal strokes connected and does not invent loops at an L bend', () => {
    const diagonal = raster(64, 64, (x, y) => x === y && x >= 8 && x < 56);
    const diagonalResult = traceRaster(diagonal, options());
    assertTopology(diagonal, diagonalResult);
    assert.equal(contours(diagonalResult)[0].nodes.length, 2);
    const bend = raster(64, 64, (x, y) => x === 16.5 && y >= 8 && y < 49 || y === 48.5 && x >= 16 && x < 56);
    const result = traceRaster(bend, options());
    assertTopology(bend, result);
    assert.deepEqual(graphStats(result), { components: 1, cycles: 0, endpoints: 2, junctions: [] });
    assert.equal(contours(result).length, 1);
  });

  it('preserves T and Y branches as three exact shared endpoints', () => {
    for (const kind of ['T', 'Y']) {
      const input = raster(128, 128, (x, y) => kind === 'T'
        ? segment(x, y, 16, 32, 112, 32, 2.5) || segment(x, y, 64, 32, 64, 112, 2.5)
        : segment(x, y, 16, 16, 64, 64, 2.5) || segment(x, y, 112, 16, 64, 64, 2.5) || segment(x, y, 64, 64, 64, 112, 2.5));
      const result = traceRaster(input, options({ preserveCorners: false }));
      assertTopology(input, result);
      assert.equal(contours(result).length, 3);
      assert.deepEqual(graphStats(result), { components: 1, cycles: 0, endpoints: 3, junctions: [3] });
    }
  });

  it('normalizes a filled 2x2 X junction without introducing a false cycle', () => {
    const input = raster(128, 128, (x, y) => segment(x, y, 16, 16, 112, 112, 2.5) || segment(x, y, 16, 112, 112, 16, 2.5));
    const result = traceRaster(input, options());
    assertTopology(input, result);
    assert.deepEqual(graphStats(result), { components: 1, cycles: 0, endpoints: 4, junctions: [4] });
    assert.equal(contours(result).length, 4);
    assert.ok(contours(result).every(contour => [contour.nodes[0], contour.nodes.at(-1)!].some(p => p.x === 64 && p.y === 64)));
    assert.ok(!result.warnings.includes('trace-topology'));
  });

  it('keeps two nearby real junctions and their short connector distinct', () => {
    const input = raster(64, 64, (x, y) => segment(x, y, 28.5, 12.5, 28.5, 51.5, .49) ||
      segment(x, y, 34.5, 12.5, 34.5, 51.5, .49) || segment(x, y, 28.5, 32.5, 34.5, 32.5, .49));
    const result = traceRaster(input, options({ smoothing: 5, preserveCorners: false }));
    assertTopology(input, result);
    assert.deepEqual(graphStats(result), { components: 1, cycles: 0, endpoints: 4, junctions: [3, 3] });
    assert.equal(contours(result).length, 5);
  });

  it('retains a real one-pixel counter and its attached branch', () => {
    const input = raster(32, 32, (x, y) => Math.abs(x - 16.5) + Math.abs(y - 16.5) === 1 || x === 16.5 && y >= 8 && y < 16);
    const result = traceRaster(input, options({ smoothing: 5, preserveCorners: false }));
    assertTopology(input, result);
    assert.deepEqual(graphStats(result), { components: 1, cycles: 1, endpoints: 1, junctions: [3] });
    assert.equal(contours(result).filter(contour => contour.closed).length, 1);
  });

  it('fits a ring to genuine closed cubics with bounded radial deviation', () => {
    const input = raster(128, 128, (x, y) => Math.abs(Math.hypot(x - 64, y - 64) - 44) <= 2.5);
    const result = traceRaster(input, options({ preserveCorners: false })), contour = contours(result)[0];
    assertTopology(input, result);
    assert.equal(contour.closed, true); assert.ok(curveCount(contour) >= 4);
    assert.ok(contour.nodes.length <= 48);
    for (const point of sample(contour)) assert.ok(Math.abs(Math.hypot(point.x - 64, point.y - 64) - 44) <= 1.5);
  });

  it('preserves an attached loop seam as the exact open-tail junction', () => {
    const input = raster(128, 128, (x, y) => Math.abs(Math.hypot(x - 64, y - 64) - 32) <= 2.5 || segment(x, y, 96, 64, 116, 64, 2.5));
    const skeleton = readCenterlineSkeleton(input, 128), rawLoop = skeleton.components[0].chains.find(chain => chain.closed)!;
    assert.deepEqual(rawLoop.forcedCorners, [0]);
    const result = traceRaster(input, options({ preserveCorners: false }));
    assertTopology(input, result);
    assert.deepEqual(graphStats(result), { components: 1, cycles: 1, endpoints: 1, junctions: [3] });
    const loop = contours(result).find(contour => contour.closed)!, tail = contours(result).find(contour => !contour.closed)!;
    assert.ok(curveCount(loop) >= 4);
    assert.ok(loop.nodes.some(node => key(node) === key(tail.nodes[0]) || key(node) === key(tail.nodes.at(-1)!)));
  });

  it('retains both theta cycles even though all three maximal chains are open', () => {
    const input = raster(128, 128, (x, y) => Math.abs(Math.hypot(x - 64, y - 64) - 44) <= 2.5 || segment(x, y, 20, 64, 108, 64, 2.5));
    const result = traceRaster(input, options());
    assertTopology(input, result);
    assert.deepEqual(graphStats(result), { components: 1, cycles: 2, endpoints: 0, junctions: [3, 3] });
    assert.equal(contours(result).length, 3);
    assert.ok(contours(result).every(contour => !contour.closed));
  });

  it('retains separate nested rings and one-pixel gaps between strokes', () => {
    const rings = raster(96, 96, (x, y) => Math.abs(Math.hypot(x - 48, y - 48) - 32) <= 1.5 ||
      Math.abs(Math.hypot(x - 48, y - 48) - 24) <= 1.5);
    const ringResult = traceRaster(rings, options({ smoothing: 5, preserveCorners: false }));
    assertTopology(rings, ringResult); assert.equal(ringResult.paths.length, 2);
    const lines = raster(64, 64, (x, y) => x >= 8 && x < 56 && (y === 30.5 || y === 32.5));
    const lineResult = traceRaster(lines, options({ smoothing: 5 }));
    assertTopology(lines, lineResult);
    assert.deepEqual(graphStats(lineResult), { components: 2, cycles: 0, endpoints: 4, junctions: [] });
  });

  it('filters whole short components while retaining a short internal branch', () => {
    const input = raster(96, 96, (x, y) => x === 48.5 && y >= 8 && y < 88 || y === 48.5 && x >= 48 && x < 53 || y === 4.5 && x >= 4 && x < 7);
    const before = traceRaster(input, options()), after = traceRaster(input, options({ noise: 10 }));
    assert.equal(before.paths.length, 2); assert.equal(after.paths.length, 1);
    assert.deepEqual(graphStats(after), { components: 1, cycles: 0, endpoints: 3, junctions: [3] });
    assert.deepEqual(after.paths[0], before.paths.find(path => path.contours.length === 3));
    assert.ok(after.warnings.includes('trace-noise'));
    assert.throws(() => traceRaster(input, options({ noise: 100 })), /trace-centerline-empty/);
  });

  it('reports omitted isolated dots and never returns a partial dot-only drawing', () => {
    const input = raster(64, 64, (x, y) => y === 32.5 && x >= 8 && x < 56 || x === 4.5 && y === 4.5 || x >= 58 && x < 60 && y >= 58 && y < 60);
    assert.equal(readCenterlineSkeleton(input, 128).isolatedDots, 2);
    const result = traceRaster(input, options());
    assert.equal(result.paths.length, 1); assert.ok(result.warnings.includes('trace-centerline-dots'));
    for (const size of [1, 2]) {
      const dots = raster(8, 8, (x, y) => x >= 3 && x < 3 + size && y >= 3 && y < 3 + size);
      assert.throws(() => traceRaster(dots, options()), /trace-centerline-empty/);
    }
    assert.throws(() => traceRaster(raster(8, 8, () => false), options()), /trace-centerline-empty/);
  });

  it('uses visible dark ink regardless of saved outline background settings', () => {
    const input = raster(64, 64, (x, y) => x >= 8 && x < 56 && [12.5, 24.5, 36.5, 48.5].includes(y));
    for (let x = 8; x < 56; x++) {
      input.data[(12 * 64 + x) * 4 + 3] = 0;
      input.data[(24 * 64 + x) * 4 + 3] = 127;
      input.data[(36 * 64 + x) * 4 + 3] = 128;
    }
    const keep = traceRaster(input, options({ removeWhite: false, background: 'keep' }));
    assert.equal(keep.paths.length, 2);
    for (const background of ['border', 'all'] as const) assert.deepEqual(traceRaster(input, options({ background })), keep);
    const white = raster(8, 8, () => false);
    assert.throws(() => traceRaster(white, options({ threshold: 255, background: 'keep' })), /trace-centerline-empty/);
    assert.throws(() => traceRaster(input, options({ threshold: 0 })), /trace-centerline-empty/);
  });

  it('handles strokes touching the raster border without a perimeter frame', () => {
    const input = raster(64, 64, (x, y) => y >= 30 && y < 35);
    const result = traceRaster(input, options());
    assertTopology(input, result);
    assert.equal(contours(result).length, 1); assert.equal(contours(result)[0].closed, false);
    assert.equal(contours(result)[0].nodes.length, 2);
  });

  it('traces a native antialiased cubic drawing to open cubic geometry', () => {
    const { createCanvas } = createRequire(resolve('package.json'))('@napi-rs/canvas') as typeof import('@napi-rs/canvas');
    const canvas = createCanvas(200, 144), context = canvas.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, 200, 144);
    context.strokeStyle = '#000'; context.lineWidth = 5; context.lineCap = 'round';
    context.beginPath(); context.moveTo(16, 110); context.bezierCurveTo(60, 4, 130, 140, 184, 34); context.stroke();
    const input = context.getImageData(0, 0, 200, 144), result = traceRaster(input, options({ preserveCorners: false }));
    assert.deepEqual(graphStats(result), { components: 1, cycles: 0, endpoints: 2, junctions: [] });
    const contour = contours(result)[0]; assert.ok(curveCount(contour) >= 2); assert.ok(contour.nodes.length <= 64);
    const original: CadPoint[] = [];
    for (let step = 0; step <= 1024; step++) {
      const t = step / 1024, s = 1 - t;
      original.push({ x: s ** 3 * 16 + 3 * s * s * t * 60 + 3 * s * t * t * 130 + t ** 3 * 184,
        y: s ** 3 * 110 + 3 * s * s * t * 4 + 3 * s * t * t * 140 + t ** 3 * 34 });
    }
    for (const point of sample(contour)) {
      let nearest = Infinity;
      for (let i = 1; i < original.length; i++) nearest = Math.min(nearest, distanceToSegment(point, original[i - 1], original[i]));
      assert.ok(nearest <= 1.75, `centerline deviation ${nearest}`);
    }
  });

  it('leaves source RGBA/options unchanged and produces deterministic native paths', () => {
    const input = raster(64, 64, (x, y) => Math.abs(Math.hypot(x - 32, y - 32) - 20) <= 2.5), copy = input.data.slice();
    const settings = Object.freeze(options());
    const first = traceCenterlineRaster(input, settings), second = traceCenterlineRaster(input, settings);
    assert.deepEqual(first, second); assert.deepEqual(input.data, copy);
  });

  it('rejects invalid raster/options before allocating an unbounded skeleton', () => {
    const input = raster(8, 8, (x, y) => y === 4.5);
    for (const patch of [{ mode: 'color' }, { method: 'invalid' }, { threshold: NaN }, { threshold: 256 }, { smoothing: 0 }, { noise: -1 }]) {
      assert.throws(() => traceCenterlineRaster(input, options(patch as Partial<TraceOptions>)), /geometry/);
    }
    for (const malformed of [{ ...input, width: 2049 }, { ...input, height: 0 }, { ...input, data: new Uint8ClampedArray(1) }]) {
      assert.throws(() => traceCenterlineRaster(malformed, options()), /limit/);
    }
  });

  it('enforces the global contour bound instead of truncating disconnected strokes', () => {
    const input = raster(80, 84, (x, y) => Math.floor(y) % 4 === 1 && Math.floor(x) % 3 !== 2);
    assert.throws(() => traceRaster(input, options()), /limit/);
  });

  it('rejects excessive raw boundary complexity before fitting', () => {
    const input = raster(512, 512, (x, y) => Math.floor(x) % 2 === Math.floor(y) % 2);
    assert.throws(() => traceRaster(input, options()), /limit/);
  });

  it('finishes a 2048px thin ring within bounded editable geometry', () => {
    const input = raster(2048, 2048, (x, y) => Math.abs(Math.hypot(x - 1024, y - 1024) - 900) <= 2.5);
    const result = traceRaster(input, options()), contour = contours(result)[0];
    assert.equal(result.paths.length, 1); assert.equal(contours(result).length, 1); assert.equal(contour.closed, true);
    assert.ok(validContours(contours(result))); assert.ok(curveCount(contour) >= 8); assert.ok(contour.nodes.length <= 192);
    assert.ok(!result.warnings.includes('trace-topology'));
    for (const point of sample(contour, 16)) assert.ok(Math.abs(Math.hypot(point.x - 1024, point.y - 1024) - 900) <= 1.5);
  });

  it('rejects an unfinished thick 2048px fill at the work limit', () => {
    const data = new Uint8ClampedArray(2048 * 2048 * 4);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    assert.throws(() => traceRaster({ width: 2048, height: 2048, data }, options()), /limit/);
  });
});
