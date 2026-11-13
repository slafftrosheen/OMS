import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createTLStore, defaultShapeUtils, HistoryManager } from '@tldraw/tldraw';
import { fixture } from '../helpers/cad-editor';
import { findCadSnap, snapCadPoint, clearCadSnap, cadSnapIndicator, lineSnapIntersection, nearestCubicPoint, snapCadHandle, type CadSnapKind } from '../../src/lib/components/canvas/cad-snap';
import { readCadSnapSettings, writeCadSnapSettings, DEFAULT_CAD_SNAP_SETTINGS } from '../../src/lib/components/canvas/cad-snap-settings';
import { cubicAt, nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { CadPolylineTool } from '../../src/lib/components/canvas/CadPolylineTool';
import { CadCircleTool, CadDimensionTool } from '../../src/lib/components/canvas/CadTwoPointTool';
import { CadBezierTool } from '../../src/lib/components/canvas/CadBezierTool';
import { CadArcThreePointTool } from '../../src/lib/components/canvas/CadThreePointTool';
import { CadPathShapeUtil, CadDimensionShapeUtil } from '../../src/lib/components/canvas/shapes/CadShapes';

function setup(...targets: CadSnapKind[]) {
  const f = fixture(); f.state.snap = true;
  f.editor.updatePage({ meta: { keep: true, omsCadSnap: { endpoints: false, midpoints: false, centers: false, quadrants: false, intersections: false, nearest: false, grid: false, ...Object.fromEntries(targets.map(key => [key, true])) } } });
  let indicators: any[] = [];
  f.editor.snaps = { getIndicators: () => indicators, setIndicators: (next: any[]) => indicators = next, clearIndicators: () => indicators = [] };
  f.editor.getDocumentSettings = () => ({ gridSize: 10 });
  return f;
}
const line = (f: ReturnType<typeof setup>, id: string, a = { x: 0, y: 0 }, b = { x: 100, y: 0 }) => f.editor.createShape({ id, type: 'cad-path', props: { points: [a, b], closed: false } });
function close(actual: {x:number;y:number} | undefined, expected: {x:number;y:number}, tolerance = 1e-5) {
  assert.ok(actual && Math.hypot(actual.x - expected.x, actual.y - expected.y) <= tolerance, `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}

describe('selectable CAD snap targets', () => {
  it('toggles endpoint and midpoint independently and handles rotated groups', () => {
    const f = setup('endpoints'); line(f, 'shape:path');
    assert.equal(findCadSnap(f.editor, { x: 50, y: 1 }, null), null);
    close(findCadSnap(f.editor, { x: 3, y: 1 }, null)?.point, { x: 0, y: 0 });
    assert.equal(writeCadSnapSettings(f.editor, { endpoints: false, midpoints: true }), true);
    assert.equal(findCadSnap(f.editor, { x: 3, y: 1 }, null), null);
    close(findCadSnap(f.editor, { x: 51, y: 1 }, null)?.point, { x: 50, y: 0 });
    f.editor.createShape({ id: 'shape:group', type: 'group', x: 80, y: 10, rotation: Math.PI / 2 });
    f.editor.updateShape({ id: 'shape:path', parentId: 'shape:group' });
    close(findCadSnap(f.editor, { x: 82, y: 61 }, null)?.point, { x: 80, y: 60 });
  });
  it('uses screen-space tolerance and Ctrl temporarily inverts the master switch', () => {
    const f = setup('endpoints'); line(f, 'shape:path'); f.state.zoom = 2;
    assert.equal(findCadSnap(f.editor, { x: 5, y: 0 }, null), null);
    assert.ok(findCadSnap(f.editor, { x: 3, y: 0 }, null));
    f.editor.inputs.ctrlKey = true; assert.equal(findCadSnap(f.editor, { x: 3, y: 0 }, null), null);
    f.state.snap = false; assert.ok(findCadSnap(f.editor, { x: 3, y: 0 }, null));
    f.editor.inputs.ctrlKey = false; assert.equal(findCadSnap(f.editor, { x: 3, y: 0 }, null), null);
  });
  it('distinguishes centres, quadrants and arc midpoints without offering off-arc quadrants', () => {
    const f = setup('centers'); f.editor.createShape({ id: 'shape:ellipse', type: 'cad-ellipse', props: { w: 100, h: 60 } });
    close(findCadSnap(f.editor, { x: 52, y: 31 }, null)?.point, { x: 50, y: 30 });
    assert.equal(findCadSnap(f.editor, { x: 101, y: 30 }, null), null);
    writeCadSnapSettings(f.editor, { centers: false, quadrants: true });
    close(findCadSnap(f.editor, { x: 101, y: 30 }, null)?.point, { x: 100, y: 30 });
    f.editor.deleteShapes(['shape:ellipse']); f.editor.createShape({ id: 'shape:arc', type: 'cad-arc', props: { radius: 100, startAngle: 20, endAngle: 100 } });
    assert.equal(findCadSnap(f.editor, { x: 100, y: 0 }, null), null);
    close(findCadSnap(f.editor, { x: 1, y: -100 }, null)?.point, { x: 0, y: -100 });
    writeCadSnapSettings(f.editor, { quadrants: false, midpoints: true });
    close(findCadSnap(f.editor, { x: 51, y: -86 }, null)?.point, { x: 50, y: -Math.sqrt(3) * 50 });
    writeCadSnapSettings(f.editor, { midpoints: false, centers: true });
    close(findCadSnap(f.editor, { x: 1, y: 0 }, null)?.point, { x: 0, y: 0 });
  });
  it('snaps intersections on finite straight segments, never their imaginary extensions', () => {
    const f = setup('intersections'); line(f, 'shape:a'); line(f, 'shape:b', { x: 40, y: -50 }, { x: 40, y: 50 });
    const result = findCadSnap(f.editor, { x: 42, y: 2 }, null); assert.equal(result?.kind, 'intersections'); close(result?.point, { x: 40, y: 0 });
    assert.equal(lineSnapIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: -1 }, { x: 2, y: 1 }), null);
    assert.equal(lineSnapIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 2, y: 0 }, { x: 8, y: 0 }), null);
    writeCadSnapSettings(f.editor, { intersections: false }); assert.equal(findCadSnap(f.editor, { x: 42, y: 2 }, null), null);
  });
  it('finds nearest points on straight edges, ellipses, arcs and the original Bézier curve', () => {
    const f = setup('nearest'); line(f, 'shape:path');
    close(findCadSnap(f.editor, { x: 33, y: 3 }, null)?.point, { x: 33, y: 0 });
    f.editor.deleteShapes(['shape:path']); f.editor.createShape({ id: 'shape:circle', type: 'cad-ellipse', props: { w: 200, h: 200 } });
    const angle = 0.37, expected = { x: 100 + 100 * Math.cos(angle), y: 100 - 100 * Math.sin(angle) };
    close(findCadSnap(f.editor, { x: 100 + 104 * Math.cos(angle), y: 100 - 104 * Math.sin(angle) }, null)?.point, expected, 1e-4);
    f.editor.deleteShapes(['shape:circle']);
    const points = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 }], at = cubicAt(points, 0.38);
    close(nearestCubicPoint(at, points), at, 1e-5);
    f.editor.createShape({ id: 'shape:curve', type: 'cad-bezier', props: { contours: [{ closed: false, nodes: [{ ...nodeAt(points[0]), outY: 100 }, { ...nodeAt(points[3]), inY: 100 }] }] } });
    close(findCadSnap(f.editor, { x: 50, y: 78 }, null)?.point, { x: 50, y: 75 }, 1e-4);
    writeCadSnapSettings(f.editor, { nearest: false, midpoints: true });
    close(findCadSnap(f.editor, { x: 51, y: 76 }, null)?.point, { x: 50, y: 75 }, 1e-4);
  });
  it('prioritizes exact endpoints over nearest edges and grid, uses displayed grid origin and step', () => {
    const f = setup('endpoints', 'nearest', 'grid'); line(f, 'shape:path', { x: 3, y: 3 }, { x: 100, y: 3 });
    const result = findCadSnap(f.editor, { x: 5, y: 4 }, null); assert.equal(result?.kind, 'endpoints'); close(result?.point, { x: 3, y: 3 });
    f.editor.deleteShapes(['shape:path']);
    close(findCadSnap(f.editor, { x: -18, y: 22 }, null)?.point, { x: -20, y: 20 });
    f.editor.updatePage({ meta: { ...f.editor.getCurrentPage().meta, omsCad: { originX: 7, originY: 9 } } });
    close(findCadSnap(f.editor, { x: -18, y: 22 }, null)?.point, { x: -20, y: 20 });
  });
  it('excludes self, invisible and clipped artwork, but permits locked reference geometry', () => {
    const f = setup('endpoints'); line(f, 'shape:path');
    assert.equal(findCadSnap(f.editor, { x: 1, y: 0 }, 'shape:path' as any), null);
    f.editor.updateShape({ id: 'shape:path', opacity: 0 }); assert.equal(findCadSnap(f.editor, { x: 1, y: 0 }, null), null);
    f.editor.updateShape({ id: 'shape:path', opacity: 1, isLocked: true }); assert.ok(findCadSnap(f.editor, { x: 1, y: 0 }, null));
    f.editor.updateShape({ id: 'shape:path', mask: [{ x: 20, y: 20 }] }); assert.equal(findCadSnap(f.editor, { x: 1, y: 0 }, null), null);
  });
  it('shows and clears a point marker without deleting native alignment guides', () => {
    const f = setup('endpoints'); line(f, 'shape:path');
    close(snapCadPoint(f.editor, { x: 1, y: 1 }, null), { x: 0, y: 0 }); assert.equal(cadSnapIndicator(f.editor).get()?.kind, 'endpoints');
    assert.equal(f.editor.snaps.getIndicators()[0].id, 'oms-cad-snap');
    snapCadPoint(f.editor, { x: 40, y: 40 }, null); assert.equal(f.editor.snaps.getIndicators().length, 0); assert.equal(cadSnapIndicator(f.editor).get(), null);
    f.editor.snaps.setIndicators([{ id: 'native-guide' }]); clearCadSnap(f.editor); assert.equal(f.editor.snaps.getIndicators()[0].id, 'native-guide');
  });
  it('shares target settings with all CAD drawing tools and clears markers on cancel', () => {
    for (const Tool of [CadPolylineTool, CadCircleTool, CadDimensionTool, CadBezierTool, CadArcThreePointTool]) {
      const f = setup('midpoints'); line(f, 'shape:reference'); const tool = new Tool(f.editor, undefined as any); tool.onEnter();
      f.editor.inputs.currentPagePoint = { x: 51, y: 2 }; tool.onPointerMove();
      assert.equal(cadSnapIndicator(f.editor).get()?.kind, 'midpoints', Tool.id);
      tool.onPointerDown({ button: 0 } as any); tool.onCancel();
      assert.equal(cadSnapIndicator(f.editor).get(), null); assert.equal(f.shapes.size, 1);
    }
  });
  it('keeps Shift angle constraints authoritative and applies snap targets during node edits', () => {
    const f = setup('endpoints', 'midpoints'); line(f, 'shape:reference', { x: 50, y: 3 }, { x: 100, y: 3 });
    const tool = new CadPolylineTool(f.editor, undefined as any); tool.onEnter();
    f.editor.inputs.currentPagePoint = { x: 0, y: 0 }; tool.onPointerDown({ button: 0 } as any);
    f.editor.inputs.shiftKey = true; f.editor.inputs.currentPagePoint = { x: 51, y: 2 }; tool.onPointerDown({ button: 0 } as any);
    const added = [...f.shapes.values()].find(s => s.id !== 'shape:reference'); close(added.props.points[1], { x: Math.hypot(51, 2), y: 0 }); tool.onCancel();
    f.editor.inputs.shiftKey = false; line(f, 'shape:edit', { x: 0, y: 0 }, { x: 10, y: 0 }); f.editor.updateShape({ id: 'shape:edit', x: 20, y: 3 });
    const shape = f.editor.getShape('shape:edit'); close(snapCadHandle(f.editor, shape, { x: 53, y: 1 }), { x: 55, y: 0 });
    const util = new CadPathShapeUtil(f.editor), update = util.onHandleDrag(shape, { handle: { id: '1', x: 53, y: 1 } } as any)!;
    assert.ok(update); close(update.props!.points![1], { x: 55, y: 0 }); assert.equal(util.getHandles(shape)[1].canSnap, false);
    const dim = new CadDimensionShapeUtil(f.editor); f.editor.createShape({ id: 'shape:dim', type: 'cad-dimension' });
    const d = dim.onHandleDrag(f.editor.getShape('shape:dim'), { handle: { id: 'end', x: 73, y: 4 } } as any)!;
    assert.ok(d); close({ x: d.props!.endX!, y: d.props!.endY! }, { x: 75, y: 3 });
  });
});

describe('saved snap settings', () => {
  it('sanitizes saved values, rejects invalid writes and protects readonly drawings', () => {
    const f = fixture(); assert.deepEqual(readCadSnapSettings(f.editor), DEFAULT_CAD_SNAP_SETTINGS);
    f.editor.updatePage({ meta: { keep: true, omsCadSnap: { endpoints: 'no', tolerance: Infinity } } });
    assert.deepEqual(readCadSnapSettings(f.editor), DEFAULT_CAD_SNAP_SETTINGS);
    for (const patch of [{ tolerance: 31 }, { tolerance: NaN }, { gridSpacing: 0 }, { nearest: undefined }, { other: true }]) assert.equal(writeCadSnapSettings(f.editor, patch as any), false);
    f.state.isReadonly = true; assert.equal(writeCadSnapSettings(f.editor, { midpoints: true }), false); assert.equal(f.marks.length, 0);
    f.state.isReadonly = false; assert.equal(writeCadSnapSettings(f.editor, { midpoints: true }), true); assert.equal(f.editor.getCurrentPage().meta.keep, true);
    const count = f.marks.length; assert.equal(writeCadSnapSettings(f.editor, { midpoints: true }), true); assert.equal(f.marks.length, count);
  });
  it('undoes target choices and the real document grid together, without touching artwork', () => {
    const store = createTLStore({ shapeUtils: defaultShapeUtils });
    store.put([{ id: 'document:document', typeName: 'document', name: 'Snap test', gridSize: 10, meta: {} }, { id: 'page:page', typeName: 'page', name: 'Page', index: 'a1', meta: { keep: true } }] as any);
    const history = new HistoryManager({ store });
    const editor: any = { store, getInstanceState: () => ({ isReadonly: false }), getCurrentPage: () => store.get('page:page' as any), getDocumentSettings: () => store.get('document:document' as any),
      updatePage: (patch: any) => store.put([{ ...editor.getCurrentPage(), ...patch }]), run: history.batch, mark: history.mark.bind(history), bailToMark: history.bailToMark };
    try {
      assert.equal(writeCadSnapSettings(editor, { midpoints: true, grid: true, gridSpacing: 25, tolerance: 12 }), true);
      const saved = JSON.parse(JSON.stringify(store.serialize())); assert.equal(saved['page:page'].meta.omsCadSnap.midpoints, true); assert.equal(saved['document:document'].gridSize, 25);
      history.undo(); assert.deepEqual(readCadSnapSettings(editor), DEFAULT_CAD_SNAP_SETTINGS);
      history.redo(); assert.equal(readCadSnapSettings(editor).gridSpacing, 25); assert.equal(readCadSnapSettings(editor).midpoints, true); assert.equal(editor.getCurrentPage().meta.keep, true);
    } finally { history.dispose(); }
  });
});
