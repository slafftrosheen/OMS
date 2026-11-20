import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { fixture } from '../helpers/cad-editor';
import { getDefaultColorTheme } from '@tldraw/tldraw';
import { contourSegments, mapContours, nodeAt, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import { VECTOR_DEFAULT_PAINT } from '../../src/lib/components/canvas/cad-paint';
import {
  applyCadFreehandContinuation, captureCadFreehandContinuation, graftCadFreehandContour,
  nearestCadFreehandEndpoint, prepareCadFreehandContinuation, readCadFreehandEndpoints,
} from '../../src/lib/components/canvas/cad-freehand-continuation';

const path = (): CadContour => ({ closed: false, nodes: [
  { ...nodeAt({ x: 0, y: 0 }), inX: -11, inY: -15, outX: 35, outY: -40, mode: 'smooth' },
  { ...nodeAt({ x: 100, y: 30 }), inX: -30, inY: 20, outX: 15, outY: 50 },
  { ...nodeAt({ x: 160, y: 80 }), inX: 10, inY: -30, outX: 11, outY: 15, mode: 'smooth' },
] });
const segments = (contour: CadContour) => [...contourSegments(contour)].map(points => points.map(({ x, y }) => ({ x, y })));
const polyline = (points: Array<{ x: number; y: number }>): CadContour => ({ closed: false, nodes: points.map(nodeAt) });
function drawing(extra: Record<string, unknown> = {}, contours = [path()]) {
  const f = fixture(), id = 'shape:continued';
  f.editor.user.getIsDarkMode = () => false;
  f.editor.store = { getStoreSnapshot: () => ({ store: Object.fromEntries(f.shapes) }) };
  f.editor.createShape({ id, type: 'cad-bezier', props: { contours }, ...extra });
  f.editor.setSelectedShapes([id]);
  const endpoint = (end: 'start' | 'end' = 'end', index = 0) => readCadFreehandEndpoints(f.editor).find(point => point.end === end && point.contourIndex === index)!;
  const capture = (end: 'start' | 'end' = 'end', index = 0) => captureCadFreehandContinuation(f.editor, endpoint(end, index));
  return { ...f, id, endpoint, capture };
}

describe('CAD Freehand continuation geometry and transactions', () => {
  it('appends and prepends without changing any original cubic or reversing its direction', () => {
    const original = path(), before = structuredClone(original);
    for (const end of ['start', 'end'] as const) {
      const anchor = end === 'start' ? original.nodes[0] : original.nodes.at(-1)!;
      const extension: CadContour = { closed: false, nodes: [
        { ...nodeAt(anchor), outX: -13, outY: 21 },
        { ...nodeAt({ x: anchor.x - 40, y: anchor.y + 60 }), inX: 9, inY: 15, outX: -21, outY: 5 },
        { ...nodeAt({ x: anchor.x - 100, y: anchor.y + 100 }), inX: 31, inY: -19 },
      ] };
      const addedBefore = structuredClone(extension), result = graftCadFreehandContour(original, extension, end, false);
      assert.equal(result.closed, false); assert.equal(result.nodes.length, 5);
      assert.deepEqual(end === 'end' ? segments(result).slice(0, 2) : segments(result).slice(2), segments(original));
      assert.deepEqual(end === 'end' ? segments(result).slice(2) : segments(result).slice(0, 2),
        end === 'end' ? segments(extension) : segments(extension).reverse().map(points => points.reverse()));
      assert.equal(result.nodes[2].mode, 'corner');
      assert.deepEqual(original, before); assert.deepEqual(extension, addedBefore);
    }
  });

  it('closes from either endpoint through the drawn bridge without a duplicate seam or changed old segment', () => {
    const original = path();
    for (const end of ['start', 'end'] as const) {
      const anchor = end === 'end' ? original.nodes.at(-1)! : original.nodes[0];
      const opposite = end === 'end' ? original.nodes[0] : original.nodes.at(-1)!;
      const extension: CadContour = { closed: false, nodes: [
        { ...nodeAt(anchor), outX: 22, outY: 31 },
        { ...nodeAt({ x: 70, y: 150 }), inX: 27, inY: -19, outX: -21, outY: -13 },
        { ...nodeAt(opposite), inX: 33, inY: 17 },
      ] };
      const result = graftCadFreehandContour(original, extension, end, true);
      assert.equal(result.closed, true); assert.equal(result.nodes.length, 4);
      assert.deepEqual(segments(result).slice(0, 2), segments(original));
      assert.deepEqual(segments(result).slice(2), end === 'end' ? segments(extension) : segments(extension).reverse().map(points => points.reverse()));
      assert.deepEqual(result.nodes.slice(0, 3).map(({ x, y }) => ({ x, y })), original.nodes.map(({ x, y }) => ({ x, y })));
      assert.throws(() => graftCadFreehandContour(original, polyline([anchor, { x: 500, y: 500 }]), end, true), /freehand-invalid/);
    }
  });

  it('preserves object identity, nested transforms, paint, metadata, and other contours through one update', () => {
    const other = { ...path(), closed: true }, paint = { ...VECTOR_DEFAULT_PAINT, stroke: '#a31764', strokeWidth: 7, strokeOpacity: .65,
      lineCap: 'square', lineJoin: 'bevel', dash: [9, 5, 3], dashOffset: 2 };
    const f = drawing({ x: 28, y: -70, rotation: .33, index: 'a7', opacity: .6, parentId: 'shape:inner',
      meta: { omsVectorPaint: paint, omsObjectName: 'Original curve', custom: { retained: ['one', 2] } } }, [path(), other]);
    f.editor.createShape({ id: 'shape:outer', type: 'group', x: 140, y: 45, rotation: -.2, opacity: .5 });
    f.editor.createShape({ id: 'shape:inner', type: 'group', parentId: 'shape:outer', x: -20, y: 90, rotation: .61, opacity: .8 });
    f.editor.options.maxShapesPerPage = 3;
    const before = structuredClone(f.only()), captured = f.capture(), local = polyline([path().nodes.at(-1)!, { x: 220, y: 110 }, { x: 270, y: 40 }]);
    assert.ok(Math.abs(captured.opacity - .24) < 1e-10);
    const extension = mapContours([local], point => f.editor.getShapePageTransform(f.only()).applyToPoint(point))[0];
    const plan = prepareCadFreehandContinuation(f.editor, captured, extension, false);
    assert.deepEqual(f.only(), before);
    assert.deepEqual(plan.preview, mapContours(plan.contours, point => f.editor.getShapePageTransform(f.only()).applyToPoint(point)));
    assert.equal(plan.previewPaint.stroke, '#a31764'); assert.equal(plan.previewPaint.strokeOpacity, .65);
    assert.equal(applyCadFreehandContinuation(f.editor, plan), true); assert.equal(f.shapes.size, 3); assert.equal(f.marks.length, 2);
    const saved = f.only();
    assert.deepEqual({ ...saved, props: { ...saved.props, contours: before.props.contours } }, before);
    assert.deepEqual(saved.props.contours[1], other); assert.deepEqual(segments(saved.props.contours[0]).slice(0, 2), segments(path()));
    f.editor.bailToMark(f.marks[0].id); assert.deepEqual(f.only(), before);
  });

  it('previews the full future path with original dash settings from both ends and on closure', () => {
    const f = drawing({ meta: { omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, dash: [6, 4], dashOffset: 1 } } },
      [polyline([{ x: 0, y: 0 }, { x: 27, y: 0 }])]);
    const append = prepareCadFreehandContinuation(f.editor, f.capture(), polyline([{ x: 27, y: 0 }, { x: 57, y: 0 }]), false);
    assert.equal(append.previewPaint.dashOffset, 1); assert.deepEqual(append.preview, append.contours);
    const prepend = prepareCadFreehandContinuation(f.editor, f.capture('start'), polyline([{ x: 0, y: 0 }, { x: -37, y: 0 }]), false);
    assert.equal(prepend.previewPaint.dashOffset, 1);
    assert.deepEqual(prepend.preview[0].nodes.map(({ x }) => x), [-37, 0, 27]);
    const closed = prepareCadFreehandContinuation(f.editor, f.capture('start'), polyline([{ x: 0, y: 0 }, { x: 13, y: 40 }, { x: 27, y: 0 }]), true);
    assert.equal(closed.previewPaint.dashOffset, 1);
    assert.deepEqual(closed.preview[0].nodes.map(({ x }) => x), [0, 27, 13]);
    assert.equal(closed.preview[0].closed, true);
    assert.equal(f.only().meta.omsVectorPaint.dashOffset, 1);
  });

  it('offers only editable selected open unfilled curves and uses a strict supplied screen-space hit radius', () => {
    const f = drawing({ x: 40, y: 20, rotation: Math.PI / 2 });
    const start = f.endpoint('start'); assert.deepEqual(start.point, { x: 40, y: 20 });
    assert.equal(readCadFreehandEndpoints(f.editor).length, 2);
    assert.equal(nearestCadFreehandEndpoint(f.editor, { x: 43.9, y: 20 }, 4)?.end, 'start');
    assert.equal(nearestCadFreehandEndpoint(f.editor, { x: 44.1, y: 20 }, 4), null);
    assert.equal(nearestCadFreehandEndpoint(f.editor, { x: NaN, y: 20 }, 4), null);
    assert.throws(() => captureCadFreehandContinuation(f.editor, { ...start, point: { x: 40.01, y: 20 } }), /freehand-continuation/);
    for (const change of [
      { isLocked: true }, { opacity: 0 }, { mask: [] }, { meta: { omsVectorPaint: { invalid: true } } },
      { meta: { omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, fill: '#112233' } } },
      { meta: { omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, stroke: 'none' } } },
      { meta: { omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, strokeOpacity: 0 } } },
      { meta: { omsMaterialTexture: { retained: true } } }, { props: { contours: [{ ...path(), closed: true }] } },
    ]) {
      const blocked = drawing(change); assert.deepEqual(readCadFreehandEndpoints(blocked.editor), []);
    }
    f.state.isReadonly = true; assert.deepEqual(readCadFreehandEndpoints(f.editor), []); f.state.isReadonly = false;
    f.state.bindings = [{}]; assert.deepEqual(readCadFreehandEndpoints(f.editor), []); f.state.bindings = [];
    f.editor.setSelectedShapes([]); assert.deepEqual(readCadFreehandEndpoints(f.editor), []);
    f.editor.setSelectedShapes([f.id, 'shape:other']); assert.deepEqual(readCadFreehandEndpoints(f.editor), []);
    const protectedChild = drawing({ parentId: 'shape:form' });
    protectedChild.editor.createShape({ id: 'shape:form', type: 'order-details' });
    assert.deepEqual(readCadFreehandEndpoints(protectedChild.editor), []);
  });

  it('rejects stale changes and protected ancestors without overwriting external work', () => {
    for (const change of ['source', 'other object', 'selection', 'readonly', 'ancestor lock']) {
      const f = drawing({ parentId: 'shape:group' });
      f.editor.createShape({ id: 'shape:group', type: 'group' });
      const plan = prepareCadFreehandContinuation(f.editor, f.capture(), polyline([{ x: 160, y: 80 }, { x: 220, y: 100 }]), false);
      if (change === 'source') f.editor.updateShape({ id: f.id, meta: { changed: true } });
      else if (change === 'other object') f.editor.createShape({ id: 'shape:other', type: 'geo' });
      else if (change === 'selection') f.editor.selectNone();
      else if (change === 'readonly') f.state.isReadonly = true;
      else f.editor.updateShape({ id: 'shape:group', isLocked: true });
      const before = structuredClone([...f.shapes]);
      assert.equal(applyCadFreehandContinuation(f.editor, plan), false, change);
      assert.deepEqual([...f.shapes], before); assert.equal(f.marks.length, 0);
    }
  });

  it('captures native dark-theme paint and rejects a changed theme while leaving explicit paint independent', () => {
    const f = drawing(); f.editor.user.getIsDarkMode = () => true;
    const captured = f.capture(), extension = polyline([{ x: 160, y: 80 }, { x: 220, y: 100 }]);
    assert.equal(captured.paint.stroke, getDefaultColorTheme({ isDarkMode: true }).black.solid);
    const plan = prepareCadFreehandContinuation(f.editor, captured, extension, false);
    f.editor.user.getIsDarkMode = () => false;
    assert.equal(applyCadFreehandContinuation(f.editor, plan), false); assert.equal(f.marks.length, 0);
    const explicit = drawing({ meta: { omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, stroke: '#123456' } } });
    const fixed = prepareCadFreehandContinuation(explicit.editor, explicit.capture(), extension, false);
    explicit.editor.user.getIsDarkMode = () => true;
    assert.equal(fixed.captured.theme, null); assert.equal(fixed.previewPaint.stroke, '#123456');
    assert.equal(applyCadFreehandContinuation(explicit.editor, fixed), true);
  });

  it('rolls back rejected or altered writes and recomputes the full graft before committing', () => {
    for (const behavior of ['refuse', 'alter']) {
      const f = drawing(), before = structuredClone(f.only());
      const plan = prepareCadFreehandContinuation(f.editor, f.capture(), polyline([{ x: 160, y: 80 }, { x: 220, y: 100 }]), false);
      const update = f.editor.updateShape;
      f.editor.updateShape = (value: any) => {
        if (behavior === 'alter') update({ ...value, meta: { changed: true } });
      };
      assert.equal(applyCadFreehandContinuation(f.editor, plan), false); assert.deepEqual(f.only(), before); assert.equal(f.marks.length, 0);
    }
    const f = drawing(), plan = prepareCadFreehandContinuation(f.editor, f.capture(), polyline([{ x: 160, y: 80 }, { x: 220, y: 100 }]), false);
    plan.contours[0].nodes[0].x = 999;
    assert.equal(applyCadFreehandContinuation(f.editor, plan), true); assert.deepEqual(segments(f.only().props.contours[0]).slice(0, 2), segments(path()));
  });

  it('bounds total nodes and document bytes before any mutation', () => {
    const long = polyline(Array.from({ length: 4096 }, (_, x) => ({ x, y: 0 }))), f = drawing({}, [long]);
    const before = structuredClone(f.only());
    assert.throws(() => prepareCadFreehandContinuation(f.editor, f.capture(), polyline([{ x: 4095, y: 0 }, { x: 4200, y: 0 }]), false), /freehand-limit/);
    assert.deepEqual(f.only(), before); assert.equal(f.marks.length, 0);
    const large = drawing(), captured = large.capture();
    large.editor.store.getStoreSnapshot = () => ({ padding: 'x'.repeat(1_900_000) });
    assert.throws(() => prepareCadFreehandContinuation(large.editor, captured, polyline([{ x: 160, y: 80 }, { x: 220, y: 100 }]), false), /freehand-limit/);
    assert.equal(large.marks.length, 0);
  });
});
