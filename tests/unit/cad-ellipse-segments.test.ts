import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { ellipseSegmentContour, prepareEllipseSegment, ELLIPSE_SEGMENT_TOLERANCE_MM, type EllipseSegmentOptions } from '../../src/lib/components/canvas/cad-ellipse-segments';
import { cubicAt, cubicPoints, validContours } from '../../src/lib/components/canvas/cad-curves';
import { DEFAULT_CAD_SETTINGS, canvasPointToCad } from '../../src/lib/components/canvas/cad-settings';
import { applyCadPlan } from '../../src/lib/components/canvas/cad-plans';

const options: EllipseSegmentOptions = { kind: 'arc', width: 100, height: 60, centerX: 0, centerY: 0,
  startAngle: 0, endAngle: 90, rotation: 0, clockwise: false };
const contour = (patch: Partial<EllipseSegmentOptions> = {}) => ellipseSegmentContour({ ...options, ...patch }, ELLIPSE_SEGMENT_TOLERANCE_MM);
const near = (a: number, b: number, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, a + ' != ' + b);

function editorFixture() {
  const shapes = new Map<string, any>(), state = { isReadonly: false };
  const page: any = { id: 'page:test', meta: {} };
  let selected: string[] = [];
  const history: Array<{ id: string; shapes: any[]; selected: string[] }> = [];
  const editor: any = {
    options: { maxShapesPerPage: 100 }, getCurrentPage: () => page,
    getCurrentPageId: () => page.id, getCurrentPageShapesSorted: () => [...shapes.values()],
    getCurrentPageShapeIds: () => new Set(shapes.keys()), getSelectedShapeIds: () => selected,
    getInstanceState: () => state, getShapeAndDescendantIds: (ids: string[]) => ids,
    getShape: (id: string) => shapes.get(id), complete() {}, setCurrentTool() {},
    isShapeOrAncestorLocked: () => false, getBindingsInvolvingShape: () => [],
    createShape: (shape: any) => shapes.set(shape.id, shape), deleteShapes: (ids: string[]) => ids.forEach(id => shapes.delete(id)),
    setSelectedShapes: (ids: string[]) => { selected = ids; },
    mark: (id: string) => history.push({ id, shapes: structuredClone([...shapes.values()]), selected: [...selected] }),
    run: (fn: () => void) => fn(),
    bailToMark: (id: string) => {
      const h = history.find(h => h.id === id)!; shapes.clear();
      h.shapes.forEach(shape => shapes.set(shape.id, shape)); selected = h.selected;
    },
  };
  return { editor, shapes, state, page, history };
}

describe('elliptic arcs, pie sectors and chord segments', () => {
  it('uses CAD angles and leaves an arc open with tangent handles', () => {
    const c = contour(); assert.equal(c.closed, false); assert.ok(validContours([c]));
    near(c.nodes[0].x, 50); near(c.nodes[0].y, 0);
    near(c.nodes.at(-1)!.x, 0); near(c.nodes.at(-1)!.y, 30);
    assert.equal(c.nodes[0].inX, 0); assert.equal(c.nodes[0].inY, 0);
    near(c.nodes[0].outX, 0); assert.ok(c.nodes[0].outY > 0);
    assert.equal(c.nodes.at(-1)!.outX, 0); assert.equal(c.nodes.at(-1)!.outY, 0);
  });
  it('closes a pie with two straight radii and a chord with one straight segment', () => {
    const arc = contour(), pie = contour({ kind: 'pie' }), chord = contour({ kind: 'chord' });
    assert.equal(pie.closed, true); assert.equal(chord.closed, true);
    assert.equal(pie.nodes.length, arc.nodes.length + 1); assert.equal(chord.nodes.length, arc.nodes.length);
    assert.deepEqual(pie.nodes.slice(0, -1), arc.nodes); assert.deepEqual(chord.nodes, arc.nodes);
    const center = pie.nodes.at(-1)!; near(center.x, 0); near(center.y, 0);
    assert.equal(center.inX + center.inY + center.outX + center.outY, 0);
    const line = cubicPoints(chord.nodes.at(-1)!, chord.nodes[0]);
    assert.deepEqual(line[0], chord.nodes.at(-1)); near(line[1].x, line[0].x); near(line[1].y, line[0].y);
    near(line[2].x, line[3].x); near(line[2].y, line[3].y);
  });
  it('clockwise selects the complementary sweep with the same endpoints', () => {
    const ccw = contour(), cw = contour({ clockwise: true });
    assert.ok(cw.nodes.length > ccw.nodes.length);
    near(cw.nodes[0].x, ccw.nodes[0].x); near(cw.nodes.at(-1)!.y, ccw.nodes.at(-1)!.y);
    assert.ok(cw.nodes[0].outY < 0); assert.ok(cw.nodes.some(n => n.x < -49));
  });
  it('wraps across zero and rotates positions and handles around the requested center', () => {
    const c = contour({ startAngle: 350, endAngle: 10 });
    assert.ok(c.nodes.every(n => n.x > 49));
    const r = contour({ rotation: 90, centerX: 20, centerY: -40 });
    near(r.nodes[0].x, 20); near(r.nodes[0].y, 10);
    near(r.nodes.at(-1)!.x, -10); near(r.nodes.at(-1)!.y, -40);
    assert.ok(r.nodes[0].outX < 0); near(r.nodes[0].outY, 0);
  });
  it('keeps highly eccentric and large ellipse cubics inside the physical error bound', () => {
    for (const [width, height] of [[1e6, 20], [1, 1e6], [100, 60]]) {
      const c = contour({ width, height, endAngle: 359.5 });
      for (let j = 1; j < c.nodes.length; j++) for (let k = 0; k <= 100; k++) {
        const p = cubicAt(cubicPoints(c.nodes[j - 1], c.nodes[j]), k / 100);
        const a = Math.atan2(p.y / (height / 2), p.x / (width / 2));
        const q = { x: width / 2 * Math.cos(a), y: height / 2 * Math.sin(a) };
        assert.ok(Math.hypot(p.x - q.x, p.y - q.y) <= ELLIPSE_SEGMENT_TOLERANCE_MM);
      }
    }
  });
  it('rejects invalid sizes, centers, directions and ambiguous/full-turn angles', () => {
    for (const width of [0, -1, NaN, Infinity]) assert.throws(() => contour({ width }), /ellipse-size/);
    for (const centerX of [NaN, Infinity]) assert.throws(() => contour({ centerX }), /ellipse-size/);
    for (const endAngle of [0, 360, -360, 0.00001, NaN, Infinity, 361]) assert.throws(() => contour({ endAngle }), /ellipse-angles/);
    assert.throws(() => contour({ kind: 'bad' as any }), /ellipse-size/);
    assert.throws(() => contour({ clockwise: 'yes' as any }), /ellipse-size/);
    assert.doesNotThrow(() => contour({ endAngle: 0.001 }));
  });
  it('preserves physical dimensions and CAD coordinates across document units and scale', () => {
    const f = editorFixture();
    for (const unit of ['mm', 'cm', 'm', 'in'] as const) {
      const mm = { mm: 1, cm: 10, m: 1000, in: 25.4 }[unit];
      const settings = { ...DEFAULT_CAD_SETTINGS, unit, scale: 10, originX: 240, originY: -150 };
      const plan = prepareEllipseSegment(f.editor, settings, { ...options, width: 100 / mm, height: 60 / mm, centerX: 20 / mm, centerY: -40 / mm, kind: 'pie' });
      near(plan.widthMm, 50); near(plan.heightMm, 30);
      const first = canvasPointToCad(plan.contours[0].nodes[0], settings);
      near(first.x * mm, 70); near(first.y * mm, -40);
      assert.equal(f.shapes.size, 0);
    }
  });
  it('applies through the reviewed plan as one undoable editable curve and prevents stale/read-only apply', () => {
    const f = editorFixture(), plan = prepareEllipseSegment(f.editor, DEFAULT_CAD_SETTINGS, { ...options, kind: 'pie' });
    f.state.isReadonly = true; assert.equal(applyCadPlan(f.editor, plan), false);
    f.state.isReadonly = false; f.page.meta.changed = true;
    assert.equal(applyCadPlan(f.editor, plan), false); assert.equal(f.shapes.size, 0);
    delete f.page.meta.changed;
    assert.equal(applyCadPlan(f.editor, plan), true); assert.equal(f.shapes.size, 1);
    const shape = [...f.shapes.values()][0];
    assert.equal(shape.type, 'cad-bezier'); assert.deepEqual(shape.props.contours, plan.contours);
    assert.equal(shape.meta.omsObjectName, 'Pie sector'); assert.equal(f.history.length, 2);
    f.editor.bailToMark(f.history[0].id); assert.equal(f.shapes.size, 0);
  });
  it('rejects oversize and out-of-bounds geometry before mutating the document', () => {
    const f = editorFixture();
    assert.throws(() => prepareEllipseSegment(f.editor, DEFAULT_CAD_SETTINGS, { ...options, width: 1_000_001 }), /ellipse-size/);
    assert.throws(() => prepareEllipseSegment(f.editor, DEFAULT_CAD_SETTINGS, { ...options, centerX: 1e10 }), /geometry/);
    assert.equal(f.shapes.size, 0);
  });
});
