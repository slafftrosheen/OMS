import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { prepareRectangleShape, rectangleShapeContours, RECTANGLE_CORNERS, type RectangleCornerKind, type RectangleShapeOptions } from '../../src/lib/components/canvas/cad-rectangle-shapes';
import { contourSegments, cubicAt, curveBounds, curvePathData, validContours } from '../../src/lib/components/canvas/cad-curves';
import { DEFAULT_CAD_SETTINGS, canvasPointToCad } from '../../src/lib/components/canvas/cad-settings';
import { applyCadPlan } from '../../src/lib/components/canvas/cad-plans';

const near = (a: number, b: number, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, a + ' != ' + b);
function options(kind: RectangleCornerKind = 'sharp', size = 5): RectangleShapeOptions {
  return { width: 100, height: 60, centerX: 0, centerY: 0, rotation: 0,
    corners: { topLeft: { kind, size }, topRight: { kind, size }, bottomRight: { kind, size }, bottomLeft: { kind, size } } };
}
const contours = (o: RectangleShapeOptions) => rectangleShapeContours(o, 0.005);
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

describe('rectangles with independent corners', () => {
  it('preserves exact sharp outer dimensions and CAD center', () => {
    const o = options(); o.centerX = 20; o.centerY = -10;
    const c = contours(o), bounds = curveBounds(c);
    assert.deepEqual(bounds, { x: -30, y: -40, w: 100, h: 60 }); assert.equal(c[0].nodes.length, 4);
    assert.deepEqual(c[0].nodes.map(({ x, y }) => ({ x, y })), [{ x: -30, y: 20 }, { x: 70, y: 20 }, { x: 70, y: -40 }, { x: -30, y: -40 }]);
    assert.ok(c[0].closed); assert.ok(validContours(c)); assert.ok(curvePathData(c).endsWith(' Z'));
  });
  it('cuts chamfers by the specified distance along both adjacent edges', () => {
    const o = options('chamfer', 8), c = contours(o), b = curveBounds(c);
    assert.deepEqual(b, { x: -50, y: -30, w: 100, h: 60 }); assert.equal(c[0].nodes.length, 8);
    const [a, end] = c[0].nodes; assert.equal(a.x, -50); assert.equal(a.y, 22); assert.equal(end.x, -42); assert.equal(end.y, 30);
    assert.ok(c[0].nodes.every(n => n.inX === 0 && n.inY === 0 && n.outX === 0 && n.outY === 0));
  });
  it('keeps rounded corners convex and scalloped corners concave with correct tangents', () => {
    const round = contours(options('round', 10))[0], scallop = contours(options('scallop', 10))[0];
    const a = cubicAt([...contourSegments(round)][0], 0.5), b = cubicAt([...contourSegments(scallop)][0], 0.5);
    near(Math.hypot(a.x + 40, a.y - 20), 10); near(Math.hypot(b.x + 50, b.y - 30), 10);
    assert.ok(a.x < b.x && a.y > b.y);
    near(round.nodes[0].outX, 0); assert.ok(round.nodes[0].outY > 0);
    near(scallop.nodes[0].outY, 0); assert.ok(scallop.nodes[0].outX > 0);
    near(round.nodes[1].inY, 0); assert.ok(round.nodes[1].inX < 0);
    near(scallop.nodes[1].inX, 0); assert.ok(scallop.nodes[1].inY < 0);
  });
  it('supports four different corner settings without changing outer dimensions', () => {
    const o = options(); o.corners = { topLeft: { kind: 'round', size: 7 }, topRight: { kind: 'scallop', size: 12 },
      bottomRight: { kind: 'chamfer', size: 4 }, bottomLeft: { kind: 'sharp', size: 25 } };
    const c = contours(o); assert.equal(c[0].nodes.length, 7); assert.ok(validContours(c));
    assert.deepEqual(curveBounds(c), { x: -50, y: -30, w: 100, h: 60 });
    assert.deepEqual(c[0].nodes.map(n => [n.x, n.y]), [[-50, 23], [-43, 30], [38, 30], [50, 18], [50, -26], [46, -30], [-50, -30]]);
  });
  it('merges zero-length straight segments and the closed seam at maximum radius', () => {
    for (const kind of ['round', 'scallop', 'chamfer'] as const) {
      const o = options(kind, 30); o.width = 60;
      const c = contours(o); assert.ok(validContours(c)); assert.equal(c[0].nodes.length, kind === 'chamfer' ? 4 : 8);
      for (const [i, p] of c[0].nodes.entries()) {
        const q = c[0].nodes[(i + 1) % c[0].nodes.length]; assert.ok(Math.hypot(q.x - p.x, q.y - p.y) > 0);
        if (kind !== 'chamfer') assert.ok(Math.hypot(p.inX, p.inY) > 0 && Math.hypot(p.outX, p.outY) > 0);
      }
      assert.deepEqual(curveBounds(c), { x: -30, y: -30, w: 60, h: 60 });
    }
  });
  it('makes zero-sized treatments sharp and preserves inactive sharp corner sizes', () => {
    const expected = contours(options('sharp', 0));
    for (const kind of ['round', 'scallop', 'chamfer'] as const) assert.deepEqual(contours(options(kind, 0)), expected);
    assert.deepEqual(contours(options('sharp', 100)), expected);
  });
  it('rotates around the explicit center without rotating corner assignments', () => {
    const o = options('chamfer', 4); o.centerX = 12; o.centerY = -7;
    const before = contours(o)[0].nodes, after = contours({ ...o, rotation: 90 })[0].nodes;
    after.forEach((n, i) => { near(n.x - 12, -(before[i].y + 7)); near(n.y + 7, before[i].x - 12); });
    const b = curveBounds(contours({ ...o, rotation: 90 })); near(b.w, 60); near(b.h, 100);
  });
  it('bounds radial error on large rounded and scalloped corners instead of using one coarse cubic', () => {
    for (const kind of ['round', 'scallop'] as const) {
      const o = options(); o.width = o.height = 1_000_000; o.corners.topLeft = { kind, size: 500_000 };
      const c = contours(o)[0]; assert.ok(c.nodes.length > 8);
      const center = kind === 'round' ? { x: 0, y: 0 } : { x: -500_000, y: 500_000 };
      for (const segment of contourSegments(c)) {
        if (segment[0].x === segment[1].x && segment[0].y === segment[1].y) continue;
        for (let i = 0; i <= 100; i++) { const p = cubicAt(segment, i / 100); near(Math.hypot(p.x - center.x, p.y - center.y), 500_000, 0.005); }
      }
    }
  });
  it('preserves physical corner sizes, positions and dimensions through unit and scale conversion', () => {
    const f = fixture();
    for (const unit of ['mm', 'cm', 'm', 'in'] as const) for (const scale of [0.1, 1, 10]) {
      const mm = { mm: 1, cm: 10, m: 1000, in: 25.4 }[unit];
      const s = { ...DEFAULT_CAD_SETTINGS, unit, scale, originX: 200, originY: -80 }, o = options('round', 5 / mm);
      o.width /= mm; o.height /= mm; o.centerX = 20 / mm; o.centerY = -40 / mm;
      const plan = prepareRectangleShape(f.editor, s, o); near(plan.widthMm, 100); near(plan.heightMm, 60);
      const first = canvasPointToCad(plan.contours[0].nodes[0], s); near(first.x * mm, -30); near(first.y * mm, -15);
      assert.equal(f.shapes.size, 0);
    }
  });
  it('rejects invalid dimensions, nonfinite values, unsafe corners and extreme coordinate plans', () => {
    for (const field of ['width', 'height'] as const) for (const value of [0, -1, NaN, Infinity, 1e-300])
      assert.throws(() => contours({ ...options(), [field]: value }), /rectangle-input/);
    for (const field of ['centerX', 'centerY', 'rotation'] as const) assert.throws(() => contours({ ...options(), [field]: Infinity }), /rectangle-input/);
    assert.throws(() => contours({ ...options(), rotation: 361 }), /rectangle-input/);
    for (const key of RECTANGLE_CORNERS) for (const size of [-1, NaN, Infinity, 30.001]) {
      const o = options('round'); o.corners[key].size = size; assert.throws(() => contours(o), /rectangle-corner/);
    }
    const o = options(); (o.corners.topLeft as any).kind = 'unknown'; assert.throws(() => contours(o), /rectangle-corner/);
    assert.throws(() => rectangleShapeContours(options(), 0), /rectangle-input/);
    const f = fixture(); assert.throws(() => prepareRectangleShape(f.editor, DEFAULT_CAD_SETTINGS, { ...options(), width: 1_000_001 }), /rectangle-input/);
    assert.throws(() => prepareRectangleShape(f.editor, DEFAULT_CAD_SETTINGS, { ...options(), centerX: 1e10 }), /geometry/);
  });
  it('creates one editable closed curve with an undo boundary and rejects stale/readonly plans', () => {
    const f = fixture(), plan = prepareRectangleShape(f.editor, DEFAULT_CAD_SETTINGS, options('round'));
    f.state.isReadonly = true; assert.equal(applyCadPlan(f.editor, plan), false); f.state.isReadonly = false;
    f.page.meta.changed = true; assert.equal(applyCadPlan(f.editor, plan), false); delete f.page.meta.changed;
    assert.equal(applyCadPlan(f.editor, plan), true); assert.equal(f.shapes.size, 1);
    const shape = [...f.shapes.values()][0]; assert.equal(shape.type, 'cad-bezier'); assert.deepEqual(shape.props.contours, plan.contours);
    assert.equal(f.history.length, 2); f.editor.bailToMark(f.history[0].id); assert.equal(f.shapes.size, 0);
  });
  it('enforces page/payload capacity and rolls back an editor failure without partial artwork', () => {
    const f = fixture(), plan = prepareRectangleShape(f.editor, DEFAULT_CAD_SETTINGS, options());
    f.editor.options.maxShapesPerPage = 0; assert.equal(applyCadPlan(f.editor, plan), false); f.editor.options.maxShapesPerPage = 100;
    f.editor.store = { getStoreSnapshot: () => 'x'.repeat(1_900_000) }; assert.equal(applyCadPlan(f.editor, plan), false); delete f.editor.store;
    f.editor.createShape = (shape: any) => { f.shapes.set(shape.id, shape); throw new Error('store failed'); };
    assert.equal(applyCadPlan(f.editor, plan), false); assert.equal(f.shapes.size, 0);
  });
});
