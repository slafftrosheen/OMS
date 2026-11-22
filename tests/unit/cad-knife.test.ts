import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { contourSegments, cubicAt, curveBounds, nodeAt, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { cutCadContour, prepareCadKnife } from '../../src/lib/components/canvas/cad-knife';
import { applyCadPlan } from '../../src/lib/components/canvas/cad-plans';
import { VECTOR_DEFAULT_PAINT } from '../../src/lib/components/canvas/cad-paint';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';
import { fixture } from '../helpers/cad-editor';

const line = (points: number[][], closed = false): CadContour => ({
  closed, nodes: points.map(([x, y]) => nodeAt({ x, y })),
});
const rectangle = line([[0, 0], [100, 0], [100, 60], [0, 60]], true);
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

describe('CAD knife', () => {
  it('subdivides the original cubic exactly at the crossing', () => {
    const curve = line([[0, 0], [100, 0]]);
    curve.nodes[0].outY = 80;
    curve.nodes[1].inY = 80;
    const original = [...contourSegments(curve)][0];
    const result = cutCadContour(curve, { x: 50, y: -10 }, { x: 50, y: 100 });
    assert.deepEqual(result.cutPoints, [{ x: 50, y: 60 }]);
    assert.equal(result.pieces.length, 2);
    result.pieces.forEach((piece, index) => {
      assert.equal(piece.closed, false);
      const segment = [...contourSegments(piece)][0];
      for (const t of [0, 0.2, 0.5, 0.8, 1]) {
        const expected = cubicAt(original, (index + t) / 2), actual = cubicAt(segment, t);
        near(actual.x, expected.x); near(actual.y, expected.y);
      }
    });
  });

  it('cuts multiple finite crossings once each, including a shared vertex', () => {
    const zigzag = line([[-8, 0], [0, 10], [8, 20], [-8, 30], [8, 50]]);
    const { cutPoints, pieces } = cutCadContour(zigzag, { x: 0, y: 0 }, { x: 0, y: 34 });
    assert.deepEqual(cutPoints, [{ x: 0, y: 10 }, { x: 0, y: 25 }]);
    assert.equal(pieces.length, 3);
    assert.ok(pieces.flatMap(piece => piece.nodes).every(node => !node.inX && !node.inY && !node.outX && !node.outY));
    assert.deepEqual(pieces.at(-1)?.nodes.slice(1), zigzag.nodes.slice(3));
  });

  it('preserves four editable spans when one cubic crosses three times', () => {
    const curve = line([[0, -0.08], [3, 0.08]]);
    Object.assign(curve.nodes[0], { outX: 1, outY: 0.22 });
    Object.assign(curve.nodes[1], { inX: -1, inY: -0.22 });
    const { cutPoints, pieces } = cutCadContour(curve, { x: -1, y: 0 }, { x: 4, y: 0 });
    assert.equal(pieces.length, 4);
    cutPoints.forEach((point, i) => { near(point.x, [0.6, 1.5, 2.4][i]); near(point.y, 0); });
    assert.ok(pieces.every(piece => piece.nodes.length === 2 && piece.nodes[0].outX && piece.nodes[1].inX));
  });

  it('produces two cuttable closed polygons and deduplicates crossings at seam vertices', () => {
    const { cutPoints, pieces } = cutCadContour(rectangle, { x: -10, y: -6 }, { x: 110, y: 66 });
    assert.deepEqual(cutPoints, [{ x: 0, y: 0 }, { x: 100, y: 60 }]);
    assert.ok(pieces.every(piece => piece.closed && piece.nodes.length === 3));
    assert.ok(pieces.flatMap(piece => piece.nodes).every(node => !node.inX && !node.inY && !node.outX && !node.outY));
    assert.deepEqual(curveBounds(pieces), curveBounds([rectangle]));
  });

  it('keeps tangent touches out of open splits and rejects overlaps and incomplete closed cuts', () => {
    const tangent = line([[-1, 1], [1, 1]]);
    tangent.nodes[0].outY = tangent.nodes[1].inY = -4 / 3;
    assert.throws(() => cutCadContour(tangent, { x: -2, y: 0 }, { x: 2, y: 0 }), /knife-miss/);
    assert.throws(() => cutCadContour(rectangle, { x: -1, y: 0 }, { x: 102, y: 0 }), /knife-overlap/);
    assert.throws(() => cutCadContour(rectangle, { x: -1, y: 30 }, { x: 50, y: 30 }), /knife-closed/);
    const concave = line([[0, 0], [100, 0], [100, 100], [75, 100], [75, 30], [25, 30], [25, 100], [0, 100]], true);
    assert.throws(() => cutCadContour(concave, { x: -1, y: 60 }, { x: 101, y: 60 }), /knife-closed/);
  });

  it('commits two painted pieces in the original rotated group, and consumes the blade in the same undo step', () => {
    const { editor, shapes, marks } = fixture();
    const paint = { ...VECTOR_DEFAULT_PAINT, fill: '#dd1100', stroke: '#1166ee', dash: [2, 1] };
    editor.createShape({ id: 'shape:group', type: 'group', x: 200, y: -80, rotation: 0.37 });
    editor.createShape({ id: 'shape:target', type: 'cad-bezier', parentId: 'shape:group', opacity: 0.8,
      props: { contours: [rectangle], fillRule: 'nonzero' }, meta: { omsVectorPaint: paint, omsObjectName: 'Panel' } });
    editor.createShape({ id: 'shape:blade', type: 'cad-path', parentId: 'shape:group',
      props: { points: [{ x: 35, y: -5 }, { x: 35, y: 65 }], closed: false } });
    editor.setSelectedShapes(['shape:blade', 'shape:target']);
    const plan = prepareCadKnife(editor, DEFAULT_CAD_SETTINGS, true, true);
    assert.equal(plan.cutPoints.length, 2);
    assert.deepEqual(plan.warnings, ['knife-shared-edge', 'knife-dash']);
    assert.ok(shapes.has('shape:target') && shapes.has('shape:blade'));
    assert.equal(applyCadPlan(editor, plan), true);
    assert.equal(marks.length, 1);
    assert.ok(!shapes.has('shape:target') && !shapes.has('shape:blade'));
    const result = editor.getSelectedShapes();
    assert.deepEqual(result.map((s: any) => s.meta.omsObjectName), ['Panel (1)', 'Panel (2)']);
    for (const shape of result) {
      assert.equal(shape.parentId, 'shape:group');
      assert.equal(shape.opacity, 0.8);
      assert.equal(shape.props.fillRule, 'nonzero');
      assert.equal(shape.meta.omsVectorPaint.fill, paint.fill);
      assert.equal(shape.meta.omsVectorPaint.stroke, paint.stroke);
      assert.deepEqual(shape.meta.omsVectorPaint.dash, paint.dash);
    }
    const dxf = buildCadDxf(editor, 'selected', DEFAULT_CAD_SETTINGS);
    assert.equal(dxf.closedContours, 2);
    assert.equal(dxf.openContours, 0);
    assert.deepEqual(dxf.omitted, []);
    assert.equal((dxf.text.match(/\r\nLWPOLYLINE\r\n/g) ?? []).length, 2);
    editor.bailToMark(marks[0].id);
    assert.ok(shapes.has('shape:target') && shapes.has('shape:blade'));
  });

  it('allows retaining the blade and invalidates a preview after the blade moves', () => {
    const { editor, shapes, state } = fixture();
    editor.createShape({ id: 'shape:target', type: 'cad-bezier', props: { contours: [rectangle], color: 'black' } });
    editor.createShape({ id: 'shape:blade', type: 'cad-path', props: { closed: false,
      points: [{ x: 50, y: -1 }, { x: 50, y: 61 }] } });
    editor.setSelectedShapes(['shape:target', 'shape:blade']);
    const plan = prepareCadKnife(editor, DEFAULT_CAD_SETTINGS, false, false);
    editor.updateShape({ id: 'shape:blade', x: 1 });
    assert.equal(applyCadPlan(editor, plan), false);
    assert.ok(shapes.has('shape:target') && shapes.has('shape:blade'));
    state.isReadonly = true;
    assert.throws(() => prepareCadKnife(editor, DEFAULT_CAD_SETTINGS, false, false), /readonly/);
    state.isReadonly = false;
    assert.equal(applyCadPlan(editor, prepareCadKnife(editor, DEFAULT_CAD_SETTINGS, false, false)), true);
    assert.ok(shapes.has('shape:blade'));
  });
});
