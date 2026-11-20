import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { DEFAULT_TRACE_OPTIONS } from '../../src/lib/components/canvas/cad-trace';
import { readTraceRasterBoundaries } from '../../src/lib/components/canvas/cad-trace-raster';

function raster(color: (x: number) => [number, number, number, number]) {
  const data = new Uint8ClampedArray(30 * 10 * 4);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 30; x++) data.set(color(x), (y * 30 + x) * 4);
  return { width: 30, height: 10, data };
}
const settings = { ...DEFAULT_TRACE_OPTIONS, mode: 'color' as const, colors: 2 };
const whiteGrayBlack = () => raster(x => x === 0 ? [255, 255, 255, 255] : x < 16 ? [200, 200, 200, 255] : [0, 0, 0, 255]);

describe('raster color reduction and explicit white removal', () => {
  it('removes white before it can merge into gray or consume a palette slot', () => {
    const input = whiteGrayBlack(), original = input.data.slice();
    const result = readTraceRasterBoundaries(input, settings);
    assert.equal(result.palette.length, 2);
    const gray = result.palette.findIndex(p => p.r === 200 && p.g === 200 && p.b === 200 && p.a === 255);
    assert.ok(gray >= 0, 'the retained exact gray must not be contaminated by removed white');
    assert.equal(result.boundaries.length, 2);
    assert.equal(Math.min(...result.boundaries.find(p => p.color === gray)!.points.map(p => p.x)), 1);
    assert.ok(result.boundaries.every(p => p.points.every(q => q.x >= 1)), 'no output region may fill the white column');
    assert.deepEqual(input.data, original);
  });

  it('retains the white column when the global removal control is off', () => {
    const result = readTraceRasterBoundaries(whiteGrayBlack(), { ...settings, removeWhite: false });
    assert.ok(result.boundaries.some(p => p.points.some(q => q.x === 0)));
    assert.ok(result.palette.some(p => p.r > 200 && p.g > 200 && p.b > 200));
  });

  it('keeps retained pale tints even when their averaged palette becomes near-white', () => {
    const colors: [number, number, number, number][] = [[244, 255, 255, 255], [255, 244, 255, 255], [255, 255, 244, 255]];
    const result = readTraceRasterBoundaries(raster(x => colors[Math.floor(x / 10)]), settings);
    assert.ok(result.palette.some(p => Math.min(p.r, p.g, p.b) >= 245), 'fixture must exercise a near-white palette average');
    let area = 0;
    for (const boundary of result.boundaries) {
      const twiceArea = boundary.points.reduce((sum, p, i, all) => {
        const q = all[(i + 1) % all.length]; return sum + p.x * q.y - q.x * p.y;
      }, 0);
      area += (boundary.hole ? -1 : 1) * Math.abs(twiceArea) / 2;
    }
    assert.equal(area, 300, 'palette averaging must not discard retained source pixels');
  });
});
