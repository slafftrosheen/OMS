import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { GeoShapeUtil, LineShapeUtil, Mat, Rectangle2d } from '@tldraw/tldraw';
import { fixture } from '../helpers/cad-editor';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { getCadShapePageBounds } from '../../src/lib/components/canvas/cad-bounds';
import { getCadShapePageProjection } from '../../src/lib/components/canvas/cad-projected-bounds';

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const n = { x: .6, y: .8 }, dot = (p: { x: number; y: number }) => p.x * n.x + p.y * n.y;
function nativeFixture() {
  const f = fixture();
  f.utils.geo = new GeoShapeUtil(f.editor); f.utils.line = new LineShapeUtil(f.editor);
  return f;
}

describe('Exact geometry support along a guideline normal', () => {
  it('solves an oblique cubic interior extreme, without the control hull or rotated AABB', () => {
    const f = fixture(), a = nodeAt({ x: 0, y: 0 }), b = nodeAt({ x: 80, y: 0 });
    a.outY = 120; b.inY = 120;
    f.editor.createShape({ id: 'shape:curve', type: 'cad-bezier', x: 20, y: 10,
      props: { contours: [{ closed: false, nodes: [a, b] }] } });
    const shape = f.editor.getShape('shape:curve'), range = getCadShapePageProjection(f.editor, shape, n)!;
    // q(t) = 288t - 144t² - 96t³; q' vanishes at (√5 - 1) / 2.
    near(range.min, 20); near(range.max, 20 + 120 * Math.sqrt(5) - 168);
    const box = getCadShapePageBounds(f.editor, shape)!;
    assert.ok(Math.max(...box.corners.map(dot)) - range.max > 19);
    const reversed = getCadShapePageProjection(f.editor, shape, { x: -.6, y: -.8 })!;
    near(reversed.min, -range.max); near(reversed.max, -range.min);
  });

  it('includes every closed contour seam and preserves small extrema far from the origin', () => {
    const f = fixture(), a = nodeAt({ x: 0, y: 0 }), b = nodeAt({ x: 10, y: 0 });
    // The curved portion is the closing b -> a segment, not the first segment.
    a.inY = -40; b.outY = -40;
    f.editor.createShape({ id: 'shape:closed', type: 'cad-bezier', x: 800_000, y: 700_000,
      props: { contours: [{ closed: true, nodes: [a, b] }, { closed: false, nodes: [nodeAt({ x: 0, y: 4 }), nodeAt({ x: 10, y: 4 })] }] } });
    const range = getCadShapePageProjection(f.editor, f.editor.getShape('shape:closed'), { x: 0, y: 1 })!;
    near(range.min, 699_970); near(range.max, 700_004);
  });

  it('uses analytic ellipse support through rotation and a full affine transform', () => {
    const f = fixture();
    f.editor.createShape({ id: 'shape:ellipse', type: 'cad-ellipse', x: 20, y: 30, rotation: Math.PI / 4, props: { w: 100, h: 40 } });
    const shape = f.editor.getShape('shape:ellipse'), direction = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    const range = getCadShapePageProjection(f.editor, shape, direction)!;
    near(range.min, 50 * Math.SQRT1_2); near(range.max, 50 * Math.SQRT1_2 + 100);
    const box = getCadShapePageBounds(f.editor, shape)!;
    assert.ok(Math.max(...box.corners.map(point => (point.x + point.y) * Math.SQRT1_2)) - range.max > 3);
    f.editor.getShapePageTransform = () => new Mat(2, .3, .4, -1, 70, 90);
    const affine = getCadShapePageProjection(f.editor, shape, n)!;
    const center = dot({ x: 2 * 50 + .4 * 20 + 70, y: .3 * 50 - 20 + 90 });
    const radius = Math.hypot(50 * (2 * .6 + .3 * .8), 20 * (.4 * .6 - .8));
    near(affine.min, center - radius); near(affine.max, center + radius);
  });

  it('includes an arc extremum only inside its directed sweep, including wrapped angles', () => {
    const f = fixture();
    for (const [id, startAngle, endAngle, expectedMin, expectedMax] of [
      ['wrapped', 300, 370, 6 * Math.cos(Math.PI / 18) - 8 * Math.sin(Math.PI / 18), 10],
      ['endpoints', 20, 80, 6 * Math.cos(4 * Math.PI / 9) - 8 * Math.sin(4 * Math.PI / 9), 6 * Math.cos(Math.PI / 9) - 8 * Math.sin(Math.PI / 9)],
      ['long', 30, 240, -10, -3 + 4 * Math.sqrt(3)],
    ] as const) {
      f.editor.createShape({ id: `shape:${id}`, type: 'cad-arc', props: { radius: 10, startAngle, endAngle } });
      const range = getCadShapePageProjection(f.editor, f.editor.getShape(`shape:${id}`), n)!;
      near(range.min, expectedMin); near(range.max, expectedMax);
    }
    f.editor.createShape({ id: 'shape:parent', type: 'group', x: 50, y: -20, rotation: Math.PI / 2 });
    f.editor.updateShape({ id: 'shape:wrapped', parentId: 'shape:parent' });
    const rotated = getCadShapePageProjection(f.editor, f.editor.getShape('shape:wrapped'), { x: -.8, y: .6 })!;
    near(rotated.max, -52 + 10);
  });

  it('uses native cubic controls rather than anchors or sampled hit-test vertices', () => {
    const f = nativeFixture();
    f.editor.createShape({ id: 'shape:line', type: 'line', props: { spline: 'cubic', dash: 'solid', points: Object.fromEntries(
      [[0, 0], [80, 100], [150, -20], [160, -80]].map(([x, y], i) => [`a${i + 1}`, { id: `a${i + 1}`, index: `a${i + 1}`, x, y }])) } });
    const shape = f.editor.getShape('shape:line'), range = getCadShapePageProjection(f.editor, shape, n)!;
    // Middle cubic control projections: [128, 143 5/12, 94, 74].
    near(range.min, 0); near(range.max, 130.93285067662748);
    const sampledMaximum = Math.max(...f.editor.getShapeGeometry(shape).vertices.map(dot));
    assert.ok(range.max - sampledMaximum > .05);
    f.editor.updateShape({ id: shape.id, props: { spline: 'line' } });
    near(getCadShapePageProjection(f.editor, f.editor.getShape(shape.id), n)!.max, 128);
  });

  it('uses the native polygon body, ellipse, and capsule as their distinct exact geometry', () => {
    const f = nativeFixture();
    for (const [geo, expectedMin, expectedMax] of [
      ['triangle', 30, 92], ['oval', 4, 72], ['ellipse', 38 - Math.sqrt(964), 38 + Math.sqrt(964)],
    ] as const) {
      f.editor.createShape({ id: `shape:${geo}`, type: 'geo', props: { geo, w: 100, h: geo === 'triangle' ? 40 : 20, dash: 'solid' } });
      const range = getCadShapePageProjection(f.editor, f.editor.getShape(`shape:${geo}`), n)!;
      near(range.min, expectedMin); near(range.max, expectedMax);
    }
    f.editor.textMeasure = { measureText: () => ({ w: 15, h: 10 }) };
    f.editor.updateShape({ id: 'shape:triangle', props: { text: 'Label', align: 'start', verticalAlign: 'start' } });
    near(getCadShapePageProjection(f.editor, f.editor.getShape('shape:triangle'), n)!.min, 0);
  });

  it('transforms local text and image boxes instead of their page bounding boxes', () => {
    const f = fixture();
    f.editor.getShapeGeometry = () => new Rectangle2d({ x: 3, y: 5, width: 80, height: 20, isFilled: true });
    for (const type of ['text', 'image']) {
      f.editor.createShape({ id: `shape:${type}`, type, x: 10, y: 20, rotation: Math.PI / 4 });
      const range = getCadShapePageProjection(f.editor, f.editor.getShape(`shape:${type}`), { x: Math.SQRT1_2, y: Math.SQRT1_2 })!;
      near(range.min, 30 * Math.SQRT1_2 + 3); near(range.max, 30 * Math.SQRT1_2 + 83);
    }
  });

  it('refuses sampled/unsupported geometry, malformed data, ambiguous legacy arcs and exhausted budgets', () => {
    const f = nativeFixture();
    for (const [type, props] of [
      ['draw', {}], ['highlight', {}], ['cad-dimension', {}], ['geo', { geo: 'cloud' }], ['geo', { geo: 'heart' }],
      ['cad-bezier', { contours: [] }], ['cad-bezier', { contours: [{ closed: true }] }],
      ['cad-path', { points: [] }], ['cad-path', { points: [{ x: 0, y: 0 }, { x: NaN, y: 10 }] }],
      ['cad-arc', { radius: 20, startAngle: 0, endAngle: 360 }], ['cad-arc', { radius: 20, startAngle: 30, endAngle: 0 }],
    ] as const) {
      f.editor.createShape({ id: 'shape:unsupported', type, props });
      assert.equal(getCadShapePageProjection(f.editor, f.editor.getShape('shape:unsupported'), n), undefined, `${type} ${JSON.stringify(props)}`);
    }
    f.editor.createShape({ id: 'shape:path', type: 'cad-path', props: { closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 5 }] } });
    const shape = f.editor.getShape('shape:path'), budget = { remaining: 3 };
    assert.ok(getCadShapePageProjection(f.editor, shape, n, budget));
    assert.equal(getCadShapePageProjection(f.editor, shape, n, budget), undefined);
    assert.equal(getCadShapePageProjection(f.editor, shape, { x: 0, y: 0 }), undefined);
    assert.equal(getCadShapePageProjection(f.editor, shape, { x: Infinity, y: 0 }), undefined);
  });
});
