import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { arcContour, contourSegments, cubicAt, curveBounds, nodeAt, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { cutCadContour, cutCadContours, prepareCadKnife } from '../../src/lib/components/canvas/cad-knife';
import { applyCadPlan } from '../../src/lib/components/canvas/cad-plans';
import { VECTOR_DEFAULT_PAINT } from '../../src/lib/components/canvas/cad-paint';
import { DEFAULT_CAD_SETTINGS, type CadPoint } from '../../src/lib/components/canvas/cad-settings';
import { fixture } from '../helpers/cad-editor';

const line = (points: number[][], closed = false): CadContour => ({
  closed, nodes: points.map(([x, y]) => nodeAt({ x, y })),
});
const rectangle = line([[0, 0], [100, 0], [100, 60], [0, 60]], true);
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const blade = [{ x: -2, y: 30 }, { x: 102, y: 30 }] as const;
const seams = (side: CadContour[], y = 30) => side.flatMap(contour => [...contourSegments(contour)]
  .filter(span => span.every(point => Math.abs(point.y - y) < 1e-8))
  .map(([a,,,b]) => [Math.round(Math.min(a.x, b.x)), Math.round(Math.max(a.x, b.x))]))
  .sort((a, b) => a[0] - b[0]);
const signedArea = ({ nodes }: CadContour) => nodes.reduce((sum, p, i) => {
  const next = nodes[(i + 1) % nodes.length];
  return sum + (p.x * next.y - next.x * p.y) / 2;
}, 0);
function containsPolygonPoint(contours: CadContour[], p: CadPoint, fillRule: 'nonzero' | 'evenodd') {
  let winding = 0;
  for (const { nodes } of contours) {
    for (const [i, a] of nodes.entries()) {
      const b = nodes[(i + 1) % nodes.length];
      if ((a.y > p.y) === (b.y > p.y)) continue;
      if (a.x + (p.y - a.y) * (b.x - a.x) / (b.y - a.y) > p.x) winding += b.y > a.y ? 1 : -1;
    }
  }
  return fillRule === 'evenodd' ? Math.abs(winding) % 2 === 1 : winding !== 0;
}

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
  });

  it('splits a concave panel across four crossings into two objects and three closed contours', () => {
    const concave = line([[0, 0], [100, 0], [100, 100], [75, 100], [75, 30], [25, 30], [25, 100], [0, 100]], true);
    const { pieces, cutPoints } = cutCadContours([concave], { x: -1, y: 60 }, { x: 101, y: 60 }, 'nonzero');
    assert.equal(cutPoints.length, 4);
    assert.deepEqual(pieces.map(side => side.length), [1, 2]);
    for (const side of pieces) assert.deepEqual(seams(side, 60), [[0, 25], [75, 100]]);
    for (const [i, side] of pieces.entries()) near(side.reduce((sum, contour) => sum + signedArea(contour), 0), [4500, 2000][i]);
  });

  it('cuts through a hole without a seam across it in both fill rules', () => {
    const points = [[30, 20], [70, 20], [70, 40], [30, 40]];
    for (const fillRule of ['evenodd', 'nonzero'] as const) {
      const hole = line(fillRule === 'nonzero' ? [...points].reverse() : points, true);
      const { pieces, cutPoints } = cutCadContours([rectangle, hole], ...blade, fillRule);
      assert.equal(cutPoints.length, 4);
      assert.deepEqual(pieces.map(side => side.length), [1, 1]);
      for (const side of pieces) {
        assert.ok(side[0].closed);
        assert.deepEqual(seams(side), [[0, 30], [70, 100]]);
        near(signedArea(side[0]), 2600);
      }
    }
    const sameWinding = line(points, true);
    assert.throws(() => cutCadContours([rectangle, sameWinding], ...blade, 'nonzero'), /knife-winding/);
  });

  it('keeps detached islands, untouched holes and the gaps in the shared edge', () => {
    const hole = line([[20, 10], [20, 50], [80, 50], [80, 10]], true);
    const island = line([[35, 20], [65, 20], [65, 40], [35, 40]], true);
    const untouched = line([[5, 5], [5, 15], [10, 15], [10, 5]], true);
    const { pieces } = cutCadContours([rectangle, hole, island, untouched], ...blade, 'nonzero');
    assert.deepEqual(pieces.map(side => side.length), [3, 2]);
    assert.deepEqual(pieces[0].at(-1), untouched);
    for (const side of pieces) assert.deepEqual(seams(side), [[0, 20], [35, 65], [80, 100]]);
    assert.throws(() => cutCadContours([rectangle, hole], blade[0], { x: 62, y: 30 }, 'nonzero'), /knife-closed/);
    assert.throws(() => cutCadContours([rectangle, rectangle], ...blade, 'evenodd'), /knife-closed/);
  });

  it('retains editable cubic handles on both sides of a cut through a curved hole', () => {
    const curvedHole = arcContour(50, 30, 20, 10, 0, -2 * Math.PI, Math.PI / 2);
    const { pieces } = cutCadContours([rectangle, curvedHole], ...blade, 'nonzero');
    for (const [i, side] of pieces.entries()) {
      assert.deepEqual(seams(side), [[0, 30], [70, 100]]);
      assert.equal(side.length, 1);
      const curves = [...contourSegments(side[0])].filter(([a, b, c, d]) => a.x !== b.x || a.y !== b.y || d.x !== c.x || d.y !== c.y);
      assert.equal(curves.length, 2);
      near(curves.map(controls => cubicAt(controls, 0.5).y).reduce((a, b) => a + b, 0), 60 + (i ? 1 : -1) * Math.SQRT2 * 10);
    }
  });

  it('preserves sampled filled regions on each side for both blade directions and fill rules', () => {
    const hole = [[18, 9], [79, 9], [79, 47], [18, 47]];
    const island = line([[30, 18], [66, 18], [66, 41], [30, 41]], true);
    const separate = line([[106, -10], [135, -10], [135, 52], [106, 52]], true);
    for (const rule of ['evenodd', 'nonzero'] as const) {
      const contours = [rectangle, line(rule === 'nonzero' ? [...hole].reverse() : hole, true), island, separate];
      for (const angle of [-2.85, -1.91, -0.39, 0, 0.63, 1.13, 2.73]) {
        const dx = Math.cos(angle) * 180, dy = Math.sin(angle) * 180;
        const start = { x: 58.2 - dx, y: 29.7 - dy }, end = { x: 58.2 + dx, y: 29.7 + dy };
        const { pieces } = cutCadContours(contours, start, end, rule);
        for (let x = -3; x < 140; x += 4) for (let y = -13; y < 65; y += 4) {
          const point = { x: x + 0.11, y: y + 0.51 };
          const positive = (point.x - start.x) * dy - (point.y - start.y) * dx > 0;
          const filled = containsPolygonPoint(contours, point, rule);
          assert.equal(containsPolygonPoint(pieces[0], point, rule), filled && positive);
          assert.equal(containsPolygonPoint(pieces[1], point, rule), filled && !positive);
        }
      }
    }
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
    const common = buildCadDxf(editor, 'selected', DEFAULT_CAD_SETTINGS, { commonLines: true, colorLayers: true });
    assert.deepEqual([common.sharedEdges, common.passesRemoved, common.closedContours], [1, 1, 0]);
    assert.deepEqual(common.layers.map(layer => layer.name), ['OMS_SHARED_1166EE', 'OMS_OPEN_1166EE']);
    near(common.widthMm, dxf.widthMm);
    near(common.heightMm, dxf.heightMm);
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

  it('applies a compound through-cut and exports only its closed part contours', () => {
    const { editor } = fixture();
    const hole = line([[30, 20], [70, 20], [70, 40], [30, 40]], true);
    editor.createShape({ id: 'shape:target', type: 'cad-bezier', props: { contours: [rectangle, hole], fillRule: 'evenodd', color: 'black' },
      meta: { omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, fill: '#aa6622' } } });
    editor.createShape({ id: 'shape:blade', type: 'cad-path', props: { closed: false, points: blade } });
    editor.setSelectedShapes(['shape:target', 'shape:blade']);
    const plan = prepareCadKnife(editor, DEFAULT_CAD_SETTINGS, false, true);
    assert.equal(plan.shapes?.length, 2);
    assert.equal(applyCadPlan(editor, plan), true);
    const dxf = buildCadDxf(editor, 'selected', DEFAULT_CAD_SETTINGS);
    assert.equal(dxf.closedContours, 2);
    assert.equal(dxf.openContours, 0);
    assert.deepEqual(dxf.omitted, []);
    for (const shape of editor.getSelectedShapes()) {
      assert.equal(shape.meta.omsVectorPaint.fill, '#aa6622');
      assert.deepEqual(seams(shape.props.contours), [[0, 30], [70, 100]]);
    }
    const common = buildCadDxf(editor, 'selected', DEFAULT_CAD_SETTINGS, { commonLines: true });
    assert.deepEqual([common.sharedEdges, common.passesRemoved, common.closedContours], [2, 2, 0]);
    assert.deepEqual(common.layers.map(layer => [layer.name, layer.entities]), [['OMS_OPEN', 4], ['OMS_SHARED', 2]]);
    near(common.widthMm, dxf.widthMm);
    near(common.heightMm, dxf.heightMm);
  });
});
