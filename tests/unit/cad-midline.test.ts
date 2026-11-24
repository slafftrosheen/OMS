import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { prepareMidline } from '../../src/lib/components/canvas/cad-midline';
import { cubicPoints, flattenContours, mapContours, nodeAt, splitCubic, validContours, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import type { CadPoint } from '../../src/lib/components/canvas/cad-settings';

const near = (a: number, b: number, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const path = (points: number[][]): CadContour => ({ closed: false, nodes: points.map(([x, y]) => nodeAt({ x, y })) });
const curved = (): CadContour => ({ closed: false, nodes: [
  { ...nodeAt({ x: 0, y: 0 }), outX: 20, outY: -80 },
  { ...nodeAt({ x: 120, y: 0 }), inX: -20, inY: -80 },
] });
function subdivide(contour: CadContour, t: number): CadContour {
  const [a, b] = splitCubic(cubicPoints(contour.nodes[0], contour.nodes[1]), t);
  return { closed: false, nodes: [
    { ...nodeAt(a[0]), outX: a[1].x - a[0].x, outY: a[1].y - a[0].y },
    { ...nodeAt(a[3]), inX: a[2].x - a[3].x, inY: a[2].y - a[3].y, outX: b[1].x - b[0].x, outY: b[1].y - b[0].y, mode: 'smooth' },
    { ...nodeAt(b[3]), inX: b[2].x - b[3].x, inY: b[2].y - b[3].y },
  ] };
}
function deviation(points: CadPoint[], target: CadPoint[]) {
  return Math.max(...points.map(p => {
    let best = Infinity;
    for (let i = 1; i < target.length; i++) {
      const a = target[i - 1], b = target[i], dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
      best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
    }
    return best;
  }));
}

describe('midline correspondence and editable curve fitting', () => {
  it('lets the user override endpoint pairing without mutating either source', () => {
    const a = path([[0, 0], [100, 0]]), b = path([[160, 100], [20, 120]]), before = structuredClone([a, b]);
    const auto = prepareMidline(a, b, .05), same = prepareMidline(a, b, .05, { pairing: 'same' });
    const reverse = prepareMidline(a, b, .05, { pairing: 'reverse' });
    assert.equal(auto.reversed, true); assert.deepEqual(auto.contour, reverse.contour);
    assert.deepEqual(auto.contour.nodes.map(n => [n.x, n.y]), [[10, 60], [130, 50]]);
    assert.deepEqual(same.contour.nodes.map(n => [n.x, n.y]), [[80, 50], [60, 60]]);
    assert.deepEqual([a, b], before);
  });

  it('can match relative path distance even when equal node counts hide different spacing', () => {
    const a = path([[0, 0], [10, 0], [100, 0]]), b = path([[0, 100], [90, 100], [100, 100]]);
    const byNode = prepareMidline(a, b, .02), byLength = prepareMidline(a, b, .02, { matching: 'length' });
    assert.equal(byNode.sampled, false); assert.equal(byLength.sampled, true);
    assert.deepEqual(byNode.contour.nodes.map(n => n.x), [0, 50, 100]);
    assert.deepEqual(byLength.contour.nodes.map(n => n.x), [0, 10, 90, 100]);
    assert.ok(byLength.contour.nodes.every(n => n.y === 50));
  });

  for (const [scale, x, y] of [[1, 0, 0], [.1, 900000, -900000], [25, -40000, 75000]]) {
    it(`retains smooth editable curves across unequal subdivision at scale ${scale} and origin ${x}/${y}`, () => {
      const original = curved(), split = subdivide(original, .37), tolerance = .1 * scale;
      const [a] = mapContours([original], p => ({ x: x + p.x * scale, y: y + p.y * scale }));
      const [b] = mapContours([split], p => ({ x: x + p.x * scale, y: y + (p.y + 80) * scale }));
      const expected = mapContours([original], p => ({ x: x + p.x * scale, y: y + (p.y + 40) * scale }));
      const result = prepareMidline(a, b, tolerance);
      assert.equal(result.sampled, true); assert.equal(result.fitted, true);
      assert.ok(validContours([result.contour]));
      assert.ok(result.contour.nodes.some(n => Math.hypot(n.inX, n.inY, n.outX, n.outY) > tolerance));
      near(result.contour.nodes[0].x, x); near(result.contour.nodes[0].y, y + 40 * scale);
      near(result.contour.nodes.at(-1)!.x, x + 120 * scale); near(result.contour.nodes.at(-1)!.y, y + 40 * scale);
      const actualPoints = flattenContours([result.contour], tolerance / 20)[0], expectedPoints = flattenContours(expected, tolerance / 20)[0];
      assert.ok(Math.max(deviation(actualPoints, expectedPoints), deviation(expectedPoints, actualPoints)) < tolerance,
        'a different subdivision of the same curve must not move the middle curve outside tolerance');
      assert.ok(result.contour.nodes.length < actualPoints.length / 2, 'curve fitting should retain editable handles instead of a dense polyline');
    });
  }

  it('retains a real source corner as an exact correspondence point in a fitted result', () => {
    const a = path([[0, 0], [50, 0], [50, 50]]), b = { closed: false, nodes: [
      { ...nodeAt({ x: 0, y: 100 }), outY: -20 }, { ...nodeAt({ x: 100, y: 100 }), inY: -20 },
    ] };
    const result = prepareMidline(a, b, .05, { pairing: 'same' });
    assert.equal(result.fitted, true);
    const corner = result.contour.nodes.find(n => Math.hypot(n.x - 50, n.y - 42.5) < 1e-7);
    assert.ok(corner, 'a fitted curve must not round away a construction corner');
    assert.equal(corner.mode, 'corner');
  });

  it('rejects invalid correspondence, closed sources, degenerate results and nonpositive tolerance', () => {
    const a = path([[0, 0], [100, 0]]), b = path([[100, 100], [0, 100]]);
    assert.throws(() => prepareMidline(a, b, .05, { pairing: 'unknown' as any }), /midline-pair/);
    assert.throws(() => prepareMidline(a, b, .05, { matching: 'unknown' as any }), /midline-pair/);
    assert.throws(() => prepareMidline({ ...a, closed: true }, b, .05), /midline-pair/);
    assert.throws(() => prepareMidline(a, b, .05, { pairing: 'same' }), /midline-pair/);
    assert.throws(() => prepareMidline(a, b, 0), /midline-pair/);
  });
});
