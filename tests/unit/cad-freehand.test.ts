import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createTLStore, defaultShapeUtils, DocumentRecordType, Editor, getIndexAbove, HistoryManager, Mat, PageRecordType, TLDOCUMENT_ID, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import DxfParser from 'dxf-parser';
import { CadBezierShapeUtil } from '../../src/lib/components/canvas/shapes/CadBezierShape';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { prepareVectorExport } from '../../src/lib/components/canvas/cad-vector-export';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';
import { contourSegments, cubicAt, validContours, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import { validVectorPaint } from '../../src/lib/components/canvas/cad-paint';
import {
  applyCadFreehandPlan, buildCadFreehandGeometry, cadFreehandOptions, DEFAULT_CAD_FREEHAND_OPTIONS,
  MAX_CAD_FREEHAND_SAMPLES, prepareCadFreehandPlan, readCadFreehandOptions, setCadFreehandOptions,
  validCadFreehandOptions, type CadFreehandOptions, type FreehandSample,
} from '../../src/lib/components/canvas/cad-freehand';

const near = (actual: number, expected: number, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const sample = (x: number, y: number, pressure = 1): FreehandSample => ({ x, y, pressure });
const options = (patch: Partial<CadFreehandOptions> = {}): CadFreehandOptions => ({ ...DEFAULT_CAD_FREEHAND_OPTIONS, autoClose: false, ...patch });
const area = (contour: CadContour) => contour.nodes.reduce((sum, a, i, all) => {
  const b = all[(i + 1) % all.length]; return sum + a.x * b.y - b.x * a.y;
}, 0) / 2;
const square = () => [sample(0, 0), sample(100, 0), sample(100, 100), sample(0, 100), sample(0, 0)];
function upperAtX(contours: CadContour[], x: number): number {
  const intersections: number[] = [];
  for (const contour of contours) for (let i = 0; i < contour.nodes.length; i++) {
    const a = contour.nodes[i], b = contour.nodes[(i + 1) % contour.nodes.length];
    if (a.x !== b.x && x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x)) intersections.push(a.y + (x - a.x) / (b.x - a.x) * (b.y - a.y));
  }
  return Math.max(...intersections);
}

/** Native schema/Store/HistoryManager and Editor.createShapes. The adapter
 * supplies only the DOM-independent editor surface; controller pointer/DOM
 * behavior belongs to the separate actual-Editor integration suite. */
function nativeCanvas() {
  const shapeUtils = [...defaultShapeUtils, CadBezierShapeUtil], store = createTLStore({ shapeUtils });
  const page = PageRecordType.create({ id: PageRecordType.createId('freehand'), name: 'Freehand', index: 'a1' as any,
    meta: { omsCad: { ...DEFAULT_CAD_SETTINGS } } });
  store.put([page, DocumentRecordType.create({ id: TLDOCUMENT_ID })]); const history = new HistoryManager({ store });
  let selected: TLShapeId[] = [], readonly = false, currentTool = 'cad-freehand', currentPage = page.id;
  const records = () => store.allRecords().filter(record => record.typeName === 'shape') as TLShape[];
  const editor: any = {
    store, options: { maxShapesPerPage: 2000 }, styleProps: { 'cad-bezier': new Map() },
    getShape: (id: TLShapeId) => { const shape = store.get(id); return shape?.typeName === 'shape' ? shape : undefined; },
    getCurrentPage: () => store.get(currentPage), getCurrentPageId: () => currentPage,
    getCurrentPageShapeIds: () => new Set(records().filter(shape => shape.parentId === currentPage).map(shape => shape.id)),
    getCurrentPageShapesSorted: () => records().filter(shape => shape.parentId === currentPage).sort((a, b) => a.index < b.index ? -1 : 1),
    getSelectedShapeIds: () => [...selected], setSelectedShapes: (ids: TLShapeId[]) => { selected = [...ids]; },
    getShapeAndDescendantIds: (ids: TLShapeId[]) => new Set(ids),
    isShapeOrAncestorLocked: (input: any) => !!(typeof input === 'string' ? editor.getShape(input) : input)?.isLocked,
    getFocusedGroupId: () => currentPage, getCurrentPageState: () => ({ focusedGroupId: null }), popFocusedGroupId() {},
    getInstanceState: () => ({ isReadonly: readonly, opacityForNextShape: 1 }), getInitialMetaForShape: () => ({}),
    getSortedChildIdsForParent: (id: string) => records().filter(shape => shape.parentId === id).sort((a, b) => a.index < b.index ? -1 : 1).map(shape => shape.id),
    getHighestIndexForParent: (id: string) => {
      const children = records().filter(shape => shape.parentId === id).sort((a, b) => a.index < b.index ? -1 : 1);
      return children.length ? getIndexAbove(children.at(-1)!.index) : 'a1';
    },
    getShapeMask: () => undefined, getBindingsInvolvingShape: () => [],
    getShapePageTransform: (input: TLShape | TLShapeId) => {
      const shape = typeof input === 'string' ? editor.getShape(input) : input;
      return Mat.Identity().translate(shape.x, shape.y).rotate(shape.rotation);
    },
    mark: history.mark.bind(history), run: history.batch, bailToMark: history.bailToMark,
    createShapes: Editor.prototype.createShapes, createShape: Editor.prototype.createShape,
    getCurrentToolId: () => currentTool, setCurrentTool: (tool: string) => { currentTool = tool; },
    complete: () => { throw new Error('Freehand apply must not re-enter its controller'); },
  };
  editor.getShapeUtil = () => new CadBezierShapeUtil(editor);
  return { editor: editor as Editor, store, history, page, records,
    snapshot: () => structuredClone(store.getStoreSnapshot('document')),
    readonly: (value: boolean) => { readonly = value; }, select: (ids: TLShapeId[]) => { selected = ids; },
    capacity: (value: number) => { editor.options.maxShapesPerPage = value; },
    pageId: (id: typeof page.id) => { currentPage = id; }, dispose: () => history.dispose() };
}

describe('editable freehand curve geometry', () => {
  it('retains exact two-point coordinates and strips pen-only sample fields from CAD nodes', () => {
    const points = [sample(10, 20, .1), sample(110, 70, .9)], original = structuredClone(points);
    const result = buildCadFreehandGeometry(points, options(), 8);
    assert.equal(result.closed, false); assert.equal(result.nodeCount, 2); assert.equal(result.sampleCount, 2);
    assert.deepEqual(result.contours[0].nodes.map(({ x, y }) => ({ x, y })), points.map(({ x, y }) => ({ x, y })));
    assert.ok(result.contours[0].nodes.every(node => !('pressure' in node) && !('z' in node)));
    assert.deepEqual(points, original); assert.equal(result.paint.fill, 'none'); assert.equal(result.paint.strokeWidth, 4);
    assert.ok(validContours(result.contours)); assert.ok(validVectorPaint(result.paint));
  });

  it('reduces bounded positional noise while preserving the two endpoints', () => {
    const points = Array.from({ length: 300 }, (_, i) => sample(i, Math.sin(i * .1) * .02));
    const result = buildCadFreehandGeometry(points, options({ smoothing: 1 }), 0);
    assert.equal(result.nodeCount, 2); assert.equal(result.sampleCount, 300);
    near(result.contours[0].nodes[0].y, points[0].y); near(result.contours[0].nodes.at(-1)!.y, points.at(-1)!.y);
  });

  it('rounds corners with exact quadratic-to-cubic controls and no hull overshoot', () => {
    const result = buildCadFreehandGeometry([sample(0, 0), sample(50, 0), sample(50, 50)], options({ smoothing: 1 }), 0);
    const nodes = result.contours[0].nodes;
    assert.equal(nodes.length, 4); near(nodes[1].x, 25); near(nodes[2].y, 25);
    near(nodes[1].outX, 50 / 3); near(nodes[2].inY, -50 / 3);
    for (const segment of contourSegments(result.contours[0])) for (let i = 0; i <= 20; i++) {
      const point = cubicAt(segment, i / 20);
      assert.ok(point.x >= 0 && point.x <= 50 && point.y >= 0 && point.y <= 50);
    }
  });

  it('closes a nearby endpoint only when enabled and merges the smooth seam', () => {
    const points = square(), closed = buildCadFreehandGeometry(points, options({ smoothing: 1, autoClose: true }), 8);
    assert.equal(closed.closed, true); assert.equal(closed.nodeCount, 4);
    assert.ok(closed.contours[0].nodes.every(node => node.mode === 'smooth'));
    const first = closed.contours[0].nodes[0], last = closed.contours[0].nodes.at(-1)!;
    assert.ok(first.x !== last.x || first.y !== last.y);
    assert.equal(buildCadFreehandGeometry(points, options({ autoClose: false }), 8).closed, false);
    assert.equal(buildCadFreehandGeometry([...points.slice(0, -1), sample(1, 1)], options({ autoClose: true }), 2).closed, true);
    assert.equal(buildCadFreehandGeometry([...points.slice(0, -1), sample(1, 1)], options({ autoClose: true }), .5).closed, false);
  });

  it('preserves straight segments with zero smoothing and rejects a centerline tap', () => {
    const result = buildCadFreehandGeometry([sample(0, 0), sample(50, 0), sample(50, 50)], options({ smoothing: 0 }), 0);
    assert.equal(result.nodeCount, 3); assert.ok(result.contours[0].nodes.every(node => !node.inX && !node.inY && !node.outX && !node.outY));
    assert.throws(() => buildCadFreehandGeometry([sample(10, 10)], options(), 8), /freehand-empty/);
  });
});

describe('pressure ink is a bounded editable vector footprint', () => {
  it('keeps maximum pressure at repeated XY samples and creates a true filled dot', () => {
    const result = buildCadFreehandGeometry([sample(50, 70, .2), sample(50, 70, 1), sample(50, 70, .1)], options({ mode: 'ink', width: 20 }), 8);
    assert.equal(result.sampleCount, 1); assert.equal(result.contours.length, 1); assert.equal(result.closed, true);
    near(result.bounds.x, 40); near(result.bounds.y, 60); near(result.bounds.w, 20); near(result.bounds.h, 20);
    assert.equal(result.paint.fill, '#172535'); assert.equal(result.paint.stroke, 'none');
    assert.throws(() => buildCadFreehandGeometry([sample(0, 0, 0)], options({ mode: 'ink' }), 8), /freehand-empty/);
  });

  it('uses the correct common tangent for unequal nib radii', () => {
    const result = buildCadFreehandGeometry([sample(0, 0, .1), sample(100, 0, 1)], options({ mode: 'ink', width: 20, smoothing: 0 }), 0);
    near(result.bounds.x, -1); near(result.bounds.w, 111); near(result.bounds.y, -10); near(result.bounds.h, 20);
    const slope = 9 / 100;
    near(upperAtX(result.contours, 50), (1 + slope * 50) / Math.sqrt(1 - slope * slope), .00005);
  });

  it('handles a dominant disc and a zero-pressure taper without inverted sides', () => {
    const dominant = buildCadFreehandGeometry([sample(0, 0, .1), sample(2, 0, 1)], options({ mode: 'ink', width: 20 }), 0);
    near(dominant.bounds.x, -8); near(dominant.bounds.w, 20); assert.equal(dominant.contours.length, 1);
    const taper = buildCadFreehandGeometry([sample(0, 0, 0), sample(100, 0, 1)], options({ mode: 'ink', width: 20 }), 0);
    near(taper.bounds.x, 0); near(taper.bounds.w, 110); assert.equal(taper.contours.length, 1);
  });

  it('preserves a pressure peak which would be lost by XY-only simplification', () => {
    const result = buildCadFreehandGeometry([sample(0, 0, .1), sample(50, 0, 1), sample(100, 0, .1)], options({ mode: 'ink', width: 20, smoothing: 1 }), 0);
    near(result.bounds.h, 20); assert.ok(upperAtX(result.contours, 50) > 9.99);
  });

  it('unions a closed sweep and keeps the hole as opposite winding', () => {
    const result = buildCadFreehandGeometry(square(), options({ mode: 'ink', width: 20, autoClose: true, smoothing: 0 }), 8);
    assert.equal(result.contours.length, 2); assert.equal(result.fillRule, 'nonzero');
    assert.ok(area(result.contours[0]) * area(result.contours[1]) < 0);
    near(result.bounds.x, -10); near(result.bounds.y, -10); near(result.bounds.w, 120); near(result.bounds.h, 120);
    const hole = result.contours.find(contour => Math.abs(area(contour)) < 10000)!;
    near(Math.abs(area(hole)), 6400, .01);
  });

  it('resolves crossings instead of exporting overlapping capsule boundaries', () => {
    const result = buildCadFreehandGeometry([sample(0, 0), sample(100, 100), sample(0, 100), sample(100, 0)], options({ mode: 'ink', width: 10, smoothing: 0 }), 0);
    assert.ok(validContours(result.contours));
    assert.ok(result.contours.length <= 2); assert.equal(result.closed, true);
    assert.ok(result.contours.some(contour => area(contour) !== 0));
  });
});

describe('freehand bounds and next-stroke options', () => {
  it('keeps editor-local options outside saved document records', () => {
    const a = nativeCanvas(), b = nativeCanvas();
    try {
      const before = a.snapshot(); assert.equal(setCadFreehandOptions(a.editor, { mode: 'ink', width: 12, color: '#ff0000' }), true);
      assert.equal(cadFreehandOptions(a.editor).get().width, 12); assert.equal(readCadFreehandOptions(b.editor).width, 4);
      const copy = readCadFreehandOptions(a.editor); copy.width = 99; assert.equal(readCadFreehandOptions(a.editor).width, 12);
      assert.deepEqual(a.snapshot(), before); assert.equal(setCadFreehandOptions(a.editor, { width: -1 }), false);
      assert.equal(readCadFreehandOptions(a.editor).width, 12);
    } finally { a.dispose(); b.dispose(); }
  });

  it('rejects invalid numeric, color, pressure and close-tolerance inputs', () => {
    for (const patch of [{ width: 0 }, { width: Infinity }, { width: 10001 }, { smoothing: -1 }, { smoothing: 1.1 }, { color: 'red' }, { autoClose: 'yes' }] as any[]) {
      assert.equal(validCadFreehandOptions(options(patch)), false);
      assert.throws(() => buildCadFreehandGeometry([sample(0, 0), sample(10, 0)], options(patch), 8), /freehand-invalid/);
    }
    for (const value of [sample(NaN, 0), sample(1000001, 0), sample(0, 0, -1), sample(0, 0, 1.1)])
      assert.throws(() => buildCadFreehandGeometry([value], options(), 8), /freehand-invalid/);
    for (const tolerance of [-1, Infinity, 1000001]) assert.throws(() => buildCadFreehandGeometry([sample(0, 0), sample(10, 0)], options(), tolerance), /freehand-invalid/);
    assert.throws(() => buildCadFreehandGeometry([], options(), 8), /freehand-empty/);
  });

  it('bounds samples, ink centers and geometry even for adversarial input', () => {
    assert.throws(() => buildCadFreehandGeometry(Array.from({ length: MAX_CAD_FREEHAND_SAMPLES + 1 }, (_, i) => sample(i, 0)), options(), 0), /freehand-limit/);
    const zigzag = Array.from({ length: 513 }, (_, i) => sample(i * 3, i % 2 ? 10 : 0));
    assert.throws(() => buildCadFreehandGeometry(zigzag, options({ mode: 'ink', smoothing: 0 }), 0), /freehand-limit/);
    assert.throws(() => buildCadFreehandGeometry([sample(999995, 0)], options({ mode: 'ink', width: 20 }), 0), /freehand-limit/);
  });
});

describe('freehand native schema, history and production geometry', () => {
  it('previews without writes, commits one vector object, and preserves one Undo/Redo and the drawing tool', () => {
    const f = nativeCanvas();
    try {
      const before = f.snapshot(), points = [sample(100, 200), sample(200, 250), sample(300, 200)];
      const plan = prepareCadFreehandPlan(f.editor, points, options(), 8); assert.deepEqual(f.snapshot(), before);
      assert.equal(applyCadFreehandPlan(f.editor, plan), true); assert.equal(f.records().length, 1);
      assert.equal(f.editor.getCurrentToolId(), 'cad-freehand');
      const shape = f.records()[0]; assert.equal(shape.type, 'cad-bezier'); assert.equal(shape.parentId, f.page.id);
      assert.ok(validVectorPaint(shape.meta.omsVectorPaint)); assert.equal(shape.x, plan.geometry.bounds.x);
      const after = f.snapshot(); f.history.undo(); assert.deepEqual(f.snapshot(), before); f.history.redo(); assert.deepEqual(f.snapshot(), after);
      const restored = createTLStore({ shapeUtils: [...defaultShapeUtils, CadBezierShapeUtil] }); restored.loadStoreSnapshot(JSON.parse(JSON.stringify(after)));
      assert.deepEqual(restored.get(shape.id), f.store.get(shape.id));
    } finally { f.dispose(); }
  });

  it('keeps consecutive strokes as separate Undo operations', () => {
    const f = nativeCanvas();
    try {
      for (const y of [10, 30]) assert.equal(applyCadFreehandPlan(f.editor, prepareCadFreehandPlan(f.editor, [sample(0, y), sample(100, y)], options(), 0)), true);
      assert.equal(f.records().length, 2); f.history.undo(); assert.equal(f.records().length, 1); f.history.undo(); assert.equal(f.records().length, 0);
      f.history.redo(); f.history.redo(); assert.equal(f.records().length, 2);
    } finally { f.dispose(); }
  });

  it('keeps valid page-space geometry when local normalization would cross a coordinate limit', () => {
    const f = nativeCanvas();
    try {
      const plan = prepareCadFreehandPlan(f.editor, [sample(-900000, 0), sample(900000, 0)], options(), 0);
      assert.equal(applyCadFreehandPlan(f.editor, plan), true);
      const shape = f.records()[0]; near(shape.x, 0); near(shape.y, 0);
      assert.deepEqual((shape.props as any).contours, plan.geometry.contours);
    } finally { f.dispose(); }
  });

  it('refuses readonly and stale plans without overwriting current records', () => {
    const f = nativeCanvas();
    try {
      const plan = prepareCadFreehandPlan(f.editor, [sample(0, 0), sample(100, 0)], options(), 0), before = f.snapshot();
      f.readonly(true); assert.equal(applyCadFreehandPlan(f.editor, plan), false); assert.deepEqual(f.snapshot(), before);
      assert.throws(() => prepareCadFreehandPlan(f.editor, [sample(0, 0), sample(100, 0)], options(), 0), /readonly/);
      f.readonly(false); f.store.put([{ ...f.page, meta: { ...f.page.meta, external: 'retained' } }]);
      const changed = f.snapshot(); assert.equal(applyCadFreehandPlan(f.editor, plan), false); assert.deepEqual(f.snapshot(), changed);
    } finally { f.dispose(); }
  });

  it('rechecks capacity and rejects a rejected or altered native creation atomically', () => {
    const f = nativeCanvas();
    try {
      const plan = prepareCadFreehandPlan(f.editor, [sample(0, 0), sample(100, 0)], options(), 0), before = f.snapshot();
      f.capacity(0); assert.equal(applyCadFreehandPlan(f.editor, plan), false); assert.deepEqual(f.snapshot(), before);
      f.capacity(2000);
      const stop = f.store.sideEffects.registerBeforeCreateHandler('shape', shape => ({ ...shape, x: shape.x + 10 }));
      assert.equal(applyCadFreehandPlan(f.editor, plan), false); assert.deepEqual(f.snapshot(), before); stop();
    } finally { f.dispose(); }
  });

  it('rejects oversized documents including records added on another page after preparation', () => {
    const f = nativeCanvas();
    try {
      const plan = prepareCadFreehandPlan(f.editor, [sample(0, 0), sample(100, 0)], options(), 0);
      const other = PageRecordType.create({ id: PageRecordType.createId('large'), name: 'Other', index: 'a2' as any, meta: { payload: 'x'.repeat(1900000) } });
      f.store.put([other]); const before = f.snapshot(); assert.equal(applyCadFreehandPlan(f.editor, plan), false); assert.deepEqual(f.snapshot(), before);
      assert.throws(() => prepareCadFreehandPlan(f.editor, [sample(0, 0), sample(100, 0)], options(), 0), /freehand-limit/);
    } finally { f.dispose(); }
  });

  it('exports physical centerline geometry through an independent DXF parser at document scale', () => {
    const f = nativeCanvas();
    try {
      const settings = { ...DEFAULT_CAD_SETTINGS, scale: 10, originX: 10, originY: 20 };
      f.store.put([{ ...f.page, meta: { omsCad: settings } }]);
      assert.equal(applyCadFreehandPlan(f.editor, prepareCadFreehandPlan(f.editor, [sample(10, 20), sample(110, 20)], options(), 0)), true);
      const result = buildCadDxf(f.editor, 'all', settings), parsed = new DxfParser().parseSync(result.text)!;
      assert.equal(result.omitted.length, 0); assert.equal(result.openContours, 1);
      const entity = parsed.entities[0] as any; assert.equal(entity.type, 'LINE');
      near(entity.vertices[0].x, 0); near(entity.vertices[0].y, 0); near(entity.vertices[1].x, 100 * 25.4 / 96 * 10);
    } finally { f.dispose(); }
  });

  it('exports the pressure silhouette and its hole as closed DXF and production PDF paths', () => {
    const f = nativeCanvas();
    try {
      assert.equal(applyCadFreehandPlan(f.editor, prepareCadFreehandPlan(f.editor, square(), options({ mode: 'ink', width: 20, autoClose: true }), 8)), true);
      const dxf = buildCadDxf(f.editor, 'all', DEFAULT_CAD_SETTINGS), parsed = new DxfParser().parseSync(dxf.text)!;
      assert.equal(dxf.omitted.length, 0); assert.equal(dxf.closedContours, 2); assert.equal(dxf.openContours, 0);
      assert.equal(parsed.entities.length, 2); assert.ok(parsed.entities.every((entity: any) => entity.type === 'LWPOLYLINE' && entity.shape));
      const pdf = prepareVectorExport(f.editor, DEFAULT_CAD_SETTINGS, 'all', 'pdf');
      assert.equal(pdf.omitted.length, 0); assert.ok(pdf.text.startsWith('%PDF-'));
    } finally { f.dispose(); }
  });
});
