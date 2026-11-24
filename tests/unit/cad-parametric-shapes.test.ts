import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { parametricShapeContours, prepareParametricShape } from '../../src/lib/components/canvas/cad-parametric-shapes';
import { validContours } from '../../src/lib/components/canvas/cad-curves';
import { DEFAULT_CAD_SETTINGS, canvasPointToCad } from '../../src/lib/components/canvas/cad-settings';
import { applyCadPlan } from '../../src/lib/components/canvas/cad-plans';

const options = { kind: 'polygon', points: 6, step: 2, innerRatio: 0.5, width: 100, height: 60,
  centerX: 0, centerY: 0, rotation: 0, corner: 'sharp', cornerSize: 2 } as const;
const contours = (patch: any = {}) => parametricShapeContours({ ...options, ...patch });
const near = (a: number, b: number, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, a + ' != ' + b);
function fixture() {
  const shapes = new Map<string, any>(), state = { isReadonly: false }, page: any = { id: 'page:test', meta: {} };
  let selected: string[] = [];
  const history: any[] = [];
  const editor: any = {
    options: { maxShapesPerPage: 100 }, getCurrentPage: () => page, getCurrentPageId: () => page.id,
    getCurrentPageShapesSorted: () => [...shapes.values()], getCurrentPageShapeIds: () => new Set(shapes.keys()),
    getSelectedShapeIds: () => selected, getInstanceState: () => state, getShapeAndDescendantIds: (ids: any) => ids,
    getShape: (id: any) => shapes.get(id), complete() {}, setCurrentTool() {}, isShapeOrAncestorLocked: () => false,
    getBindingsInvolvingShape: () => [], createShape: (shape: any) => shapes.set(shape.id, shape),
    deleteShapes: (ids: any[]) => ids.forEach(id => shapes.delete(id)), setSelectedShapes: (ids: string[]) => { selected = ids; },
    mark: (id: string) => history.push({ id, shapes: structuredClone([...shapes.values()]), selected: [...selected] }), run: (fn: any) => fn(),
    bailToMark: (id: string) => { const h = history.find(h => h.id === id); shapes.clear(); h.shapes.forEach((s: any) => shapes.set(s.id, s)); selected = h.selected; }
  };
  return { editor, shapes, state, page, history };
}
describe('parametric polygon and star construction', () => {
  it('uses explicit center and outer ellipse dimensions, including odd-sided polygons', () => {
    const c = contours({ points: 3, centerX: 12, centerY: -8 })[0]; assert.equal(c.nodes.length, 3); assert.ok(validContours([c]));
    near(c.nodes[0].x, 12); near(c.nodes[0].y, 22);
    for (const p of c.nodes) near(((p.x - 12) / 50) ** 2 + ((p.y + 8) / 30) ** 2, 1);
    assert.ok(Math.max(...c.nodes.map(n => n.x)) - Math.min(...c.nodes.map(n => n.x)) < 100);
  });
  it('alternates simple-star outer and inner radii without adding zero-length tips', () => {
    const c = contours({ kind: 'star', points: 5, innerRatio: 0.3 })[0]; assert.equal(c.nodes.length, 10);
    c.nodes.forEach((p, i) => near(Math.hypot(p.x / 50, p.y / 30), i % 2 ? 0.3 : 1));
    assert.ok(validContours([c])); assert.throws(() => contours({ kind: 'star', innerRatio: 1 }), /shape-ratio/);
  });
  it('constructs complex-star skip cycles without losing vertices or duplicating paths', () => {
    for (const [points, step, count, length] of [[5, 2, 1, 5], [6, 2, 2, 3], [12, 4, 4, 3], [12, 5, 1, 12]]) {
      const c = contours({ kind: 'complex-star', points, step });
      assert.equal(c.length, count); c.forEach(path => { assert.equal(path.nodes.length, length); assert.equal(path.closed, true); });
      const vertices = c.flatMap(path => path.nodes); assert.equal(vertices.length, points);
      assert.equal(new Set(vertices.map(n => n.x.toFixed(8) + ',' + n.y.toFixed(8))).size, points);
      const original = contours({ points })[0].nodes;
      for (let i = 0; i < c[0].nodes.length; i++) { near(c[0].nodes[i].x, original[i * step % points].x); near(c[0].nodes[i].y, original[i * step % points].y); }
    }
  });
  it('rotates all paths around the design center using CAD counterclockwise angles', () => {
    const c = contours({ kind: 'complex-star', points: 6, rotation: 90, centerX: 20, centerY: 10 });
    near(c[0].nodes[0].x, -10); near(c[0].nodes[0].y, 10);
    assert.ok(validContours(c));
  });
  it('finishes convex polygon corners with measured chamfers or curved fillets', () => {
    const plain = contours({ points: 4 })[0];
    const chamfer = contours({ points: 4, corner: 'chamfer', cornerSize: 3 })[0];
    const fillet = contours({ points: 4, corner: 'fillet', cornerSize: 3 })[0];
    assert.equal(chamfer.nodes.length, 8); assert.ok(fillet.nodes.length >= 8);
    near(Math.hypot(chamfer.nodes[0].x - plain.nodes[0].x, chamfer.nodes[0].y - plain.nodes[0].y), 3);
    assert.ok(chamfer.nodes.every(n => n.inX === 0 && n.inY === 0 && n.outX === 0 && n.outY === 0));
    assert.ok(fillet.nodes.some(n => Math.hypot(n.inX, n.inY, n.outX, n.outY) > 0)); assert.ok(validContours([fillet]));
    assert.throws(() => contours({ corner: 'chamfer', cornerSize: 1000 }), /corner-size/);
    assert.throws(() => contours({ kind: 'star', corner: 'fillet' }), /shape-corner/);
  });
  it('rejects invalid geometry, nonfinite coordinates and ambiguous complex-star steps', () => {
    for (const width of [0, -1, NaN, Infinity]) assert.throws(() => contours({ width }), /shape-input/);
    for (const points of [2, 65, 5.5, NaN]) assert.throws(() => contours({ points }), /shape-input/);
    for (const step of [0, 1, 2.5, 3, NaN]) assert.throws(() => contours({ kind: 'complex-star', points: 6, step }), /shape-step/);
    for (const centerX of [NaN, Infinity]) assert.throws(() => contours({ centerX }), /shape-input/);
    assert.throws(() => contours({ rotation: 361 }), /shape-input/);
    assert.equal(contours({ kind: 'star', points: 64 })[0].nodes.length, 128);
  });
  it('preserves physical positions and size in all document units and scales', () => {
    const f = fixture();
    for (const unit of ['mm', 'cm', 'm', 'in'] as const) for (const scale of [0.1, 1, 10]) {
      const mm = { mm: 1, cm: 10, m: 1000, in: 25.4 }[unit], settings = { ...DEFAULT_CAD_SETTINGS, unit, scale, originX: 200, originY: -80 };
      const plan = prepareParametricShape(f.editor, settings, { ...options, points: 4, width: 100 / mm, height: 60 / mm, centerX: 20 / mm, centerY: -40 / mm });
      near(plan.widthMm, 100); near(plan.heightMm, 60);
      const first = canvasPointToCad(plan.contours[0].nodes[0], settings); near(first.x * mm, 20); near(first.y * mm, -10);
      assert.equal(f.shapes.size, 0);
    }
  });
  it('creates one editable curve with all complex-star contours and one undo boundary', () => {
    const f = fixture(), plan = prepareParametricShape(f.editor, DEFAULT_CAD_SETTINGS, { ...options, kind: 'complex-star' });
    f.state.isReadonly = true; assert.equal(applyCadPlan(f.editor, plan), false); f.state.isReadonly = false;
    f.page.meta.changed = true; assert.equal(applyCadPlan(f.editor, plan), false); delete f.page.meta.changed;
    assert.equal(applyCadPlan(f.editor, plan), true); assert.equal(f.shapes.size, 1);
    const shape = [...f.shapes.values()][0]; assert.equal(shape.type, 'cad-bezier'); assert.equal(shape.props.contours.length, 2);
    assert.deepEqual(shape.props.contours, plan.contours); assert.equal(f.history.length, 2);
    f.editor.bailToMark(f.history[0].id); assert.equal(f.shapes.size, 0);
  });
  it('rejects canvas, physical-size and page-capacity limits before creating artwork', () => {
    const f = fixture();
    assert.throws(() => prepareParametricShape(f.editor, DEFAULT_CAD_SETTINGS, { ...options, width: 1_000_001 }), /shape-input/);
    assert.throws(() => prepareParametricShape(f.editor, DEFAULT_CAD_SETTINGS, { ...options, centerX: 1e10 }), /geometry/);
    const plan = prepareParametricShape(f.editor, DEFAULT_CAD_SETTINGS, options);
    f.editor.options.maxShapesPerPage = 0; assert.equal(applyCadPlan(f.editor, plan), false); assert.equal(f.shapes.size, 0);
  });
});
