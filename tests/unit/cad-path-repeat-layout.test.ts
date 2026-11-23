import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { arcContour, nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { layoutPathCopies, type PathRepeatOptions } from '../../src/lib/components/canvas/cad-path-repeat-layout';

const line = { closed: false, nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }].map(nodeAt) };
const square = { closed: true, nodes: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }].map(nodeAt) };
const defaults = { startInset: 0, endInset: 0, offset: 0, reverse: false, followTangent: false };
const layout = (guide = line, options: PathRepeatOptions = { ...defaults, mode: 'count', count: 5 }) => {
  const result = layoutPathCopies(guide, options, 0.005);
  assert.ok(typeof result !== 'string', String(result));
  return result;
};

describe('repeat along path spacing', () => {
  it('places both endpoints and spaces copies by length, rather than Bézier parameter', () => {
    const result = layout();
    assert.deepEqual(result.positions.map(p => p.center.x), [0, 25, 50, 75, 100]);
    assert.equal(result.pitch, 25);
    assert.equal(layout(line, { ...defaults, mode: 'count', count: 1 }).positions[0].center.x, 50);
  });

  it('reverses an open guide and offsets to the left of travel', () => {
    const result = layout(line, { ...defaults, mode: 'pitch', pitch: 20, startInset: 10, endInset: 15, offset: 5, reverse: true, followTangent: true });
    assert.deepEqual(result.positions.map(p => p.center), [{ x: 90, y: 5 }, { x: 70, y: 5 }, { x: 50, y: 5 }, { x: 30, y: 5 }]);
    assert.ok(result.positions.every(p => p.angle === Math.PI));
  });

  it('does not place two copies at a closed guide seam', () => {
    const expected = square.nodes.map(({ x, y }) => ({ x, y }));
    assert.deepEqual(layout(square, { ...defaults, mode: 'count', count: 4 }).positions.map(p => p.center), expected);
    assert.deepEqual(layout(square, { ...defaults, mode: 'pitch', pitch: 50 }).positions.map(p => p.center), expected);
    assert.deepEqual(layout(square, { ...defaults, mode: 'pitch', pitch: 50, reverse: true }).positions.map(p => p.center),
      [expected[0], ...expected.slice(1).reverse()]);
  });

  it('follows a curved guide and rotates the middle copy with its tangent', () => {
    const quarter = arcContour(0, 0, 100, 100, 0, Math.PI / 2);
    const result = layout(quarter, { ...defaults, mode: 'count', count: 3, followTangent: true });
    assert.ok(Math.abs(result.length - 50 * Math.PI) < 0.05);
    assert.ok(Math.abs(result.positions[1].center.x - Math.SQRT1_2 * 100) < 1e-5);
    assert.ok(Math.abs(result.positions[1].angle - 3 * Math.PI / 4) < 0.012);
  });

  it('rejects an invalid layout before allocating its copies', () => {
    assert.equal(layoutPathCopies(line, { ...defaults, mode: 'pitch', pitch: 0.01 }, 0.01), 'pathCopyLimit');
    assert.equal(layoutPathCopies(line, { ...defaults, mode: 'count', count: 5, startInset: 60, endInset: 40 }, 0.01), 'pathInsets');
    assert.equal(layoutPathCopies(line, { ...defaults, mode: 'count', count: 0 }, 0.01), 'pathInvalid');
  });
});
