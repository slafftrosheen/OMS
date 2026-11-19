import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createTLStore, defaultShapeUtils, HistoryManager } from '@tldraw/tldraw';
import { fixture } from '../helpers/cad-editor';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';
import { DEFAULT_CAD_SNAP_SETTINGS, readCadSnapSettings, writeCadSnapSettings } from '../../src/lib/components/canvas/cad-snap-settings';
import { cadSnapIndicator, clearCadSnap, findCadSnap, snapCadHandle, snapCadPoint } from '../../src/lib/components/canvas/cad-snap';
import { applyDrawingGuideChange, prepareDrawingGuideChange, readDrawingGuides, type DrawingGuide } from '../../src/lib/components/canvas/drawing-guides';
import { CadPolylineTool } from '../../src/lib/components/canvas/CadPolylineTool';
import { CadCircleTool, CadDimensionTool } from '../../src/lib/components/canvas/CadTwoPointTool';
import { CadBezierTool } from '../../src/lib/components/canvas/CadBezierTool';
import { CadArcThreePointTool, CadCircleThreePointTool } from '../../src/lib/components/canvas/CadThreePointTool';

const guide = (id = 'guide:x', axis: 'x' | 'y' = 'x', position = 100): DrawingGuide => ({ id, axis, position, visible: true, locked: false });
function setup(...guides: DrawingGuide[]) {
  const f = fixture(); f.state.snap = true;
  f.editor.updatePage({ meta: { retained: 'metadata', omsGuides: { version: 1, visible: true, locked: false, guides },
    omsCadSnap: { ...DEFAULT_CAD_SNAP_SETTINGS, endpoints: false, centers: false, quadrants: false, guidelines: true } } });
  let indicators: any[] = [];
  f.editor.snaps = { getIndicators: () => indicators, setIndicators: (value: any[]) => indicators = value, clearIndicators: () => indicators = [] };
  f.editor.getDocumentSettings = () => ({ gridSize: 10 });
  return f;
}
const close = (actual: { x: number; y: number } | undefined, expected: { x: number; y: number }) =>
  assert.ok(actual && Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-7, `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);

describe('document guidelines in the central CAD snap pipeline', () => {
  it('places guide lines and their crossings after discrete targets, before nearest edges and grid', () => {
    const f = setup(guide('guide:x', 'x', 10));
    f.editor.createShape({ id: 'shape:line', type: 'cad-path', props: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] } });
    writeCadSnapSettings(f.editor, { endpoints: true, nearest: true, grid: true });
    const point = { x: 4, y: 2 };
    let result = findCadSnap(f.editor, point, null); assert.equal(result?.kind, 'endpoints'); close(result?.point, { x: 0, y: 0 });
    writeCadSnapSettings(f.editor, { endpoints: false });
    result = findCadSnap(f.editor, point, null); assert.equal(result?.kind, 'guidelines'); close(result?.point, { x: 10, y: 2 });
    writeCadSnapSettings(f.editor, { guidelines: false });
    result = findCadSnap(f.editor, point, null); assert.equal(result?.kind, 'nearest'); close(result?.point, { x: 4, y: 0 });
    writeCadSnapSettings(f.editor, { nearest: false });
    result = findCadSnap(f.editor, point, null); assert.equal(result?.kind, 'grid'); close(result?.point, { x: 0, y: 0 });
  });

  it('preserves object intersections and perpendicular construction targets over a nearer guide', () => {
    const f = setup(guide('guide:x', 'x', 40.5));
    f.editor.createShape({ id: 'shape:a', type: 'cad-path', props: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] } });
    f.editor.createShape({ id: 'shape:b', type: 'cad-path', props: { points: [{ x: 40, y: -100 }, { x: 40, y: 100 }] } });
    writeCadSnapSettings(f.editor, { intersections: true });
    let result = findCadSnap(f.editor, { x: 41, y: 2 }, null);
    assert.equal(result?.kind, 'intersections'); close(result?.point, { x: 40, y: 0 });
    writeCadSnapSettings(f.editor, { intersections: false, perpendicular: true });
    result = findCadSnap(f.editor, { x: 41, y: 2 }, null, { x: 41, y: 50 });
    assert.equal(result?.kind, 'perpendicular'); close(result?.point, { x: 41, y: 0 });
  });

  it('keeps visibility, individual locks, global locks and guideline snap choice independent', () => {
    const f = setup({ ...guide(), visible: false, locked: true });
    f.editor.updatePage({ meta: { ...f.editor.getCurrentPage().meta, omsGuides: { ...readDrawingGuides(f.editor), visible: false, locked: true } } });
    const metadata = structuredClone(f.editor.getCurrentPage().meta.omsGuides);
    assert.equal(findCadSnap(f.editor, { x: 103, y: 20 }, null)?.kind, 'guidelines');
    assert.equal(writeCadSnapSettings(f.editor, { guidelines: false }), true);
    assert.equal(findCadSnap(f.editor, { x: 103, y: 20 }, null), null);
    assert.equal(writeCadSnapSettings(f.editor, { guidelines: true }), true);
    close(findCadSnap(f.editor, { x: 103, y: 20 }, null)?.point, { x: 100, y: 20 });
    assert.deepEqual(f.editor.getCurrentPage().meta.omsGuides, metadata);
    f.state.isReadonly = true; assert.equal(writeCadSnapSettings(f.editor, { guidelines: false }), false);
    assert.equal(readCadSnapSettings(f.editor).guidelines, true);
  });

  it('uses screen-space tolerance and the existing master/Ctrl toggle independently of units', () => {
    const f = setup(guide()); f.state.zoom = 2;
    assert.equal(findCadSnap(f.editor, { x: 105, y: 30 }, null), null);
    close(findCadSnap(f.editor, { x: 103, y: 30 }, null)?.point, { x: 100, y: 30 });
    f.editor.inputs.ctrlKey = true; assert.equal(findCadSnap(f.editor, { x: 103, y: 30 }, null), null);
    f.state.snap = false; assert.equal(findCadSnap(f.editor, { x: 103, y: 30 }, null)?.kind, 'guidelines');
    f.editor.inputs.ctrlKey = false; assert.equal(findCadSnap(f.editor, { x: 103, y: 30 }, null), null);
    f.state.snap = true;
    f.editor.updatePage({ meta: { ...f.editor.getCurrentPage().meta, omsCad: { ...DEFAULT_CAD_SETTINGS, unit: 'm', scale: 100, originX: -300, originY: 700 } } });
    close(findCadSnap(f.editor, { x: 103, y: 30 }, null)?.point, { x: 100, y: 30 });
    writeCadSnapSettings(f.editor, { tolerance: 12 }); close(findCadSnap(f.editor, { x: 105, y: 30 }, null)?.point, { x: 100, y: 30 });
  });

  it('acquires a visible crossing without a diagonal tolerance jump and ignores invalid metadata', () => {
    const f = setup(guide('guide:x', 'x', 100), guide('guide:y', 'y', 200));
    close(findCadSnap(f.editor, { x: 103, y: 204 }, null)?.point, { x: 100, y: 200 });
    close(findCadSnap(f.editor, { x: 106, y: 207 }, null)?.point, { x: 100, y: 207 });
    f.editor.updatePage({ meta: { ...f.editor.getCurrentPage().meta, omsGuides: { version: 2, guides: [{ position: 100 }] } } });
    assert.equal(findCadSnap(f.editor, { x: 103, y: 204 }, null), null);
  });

  it('shares targets with all CAD creation tools and clears its marker on cancellation', () => {
    for (const Tool of [CadPolylineTool, CadCircleTool, CadDimensionTool, CadBezierTool, CadArcThreePointTool, CadCircleThreePointTool]) {
      const f = setup(guide());
      const tool = new Tool(f.editor, undefined as any); tool.onEnter();
      f.editor.inputs.currentPagePoint = { x: 103, y: 20 }; tool.onPointerMove();
      assert.equal(cadSnapIndicator(f.editor).get()?.kind, 'guidelines', Tool.id);
      close(cadSnapIndicator(f.editor).get()?.point, { x: 100, y: 20 });
      assert.equal(f.editor.snaps.getIndicators()[0].id, 'oms-cad-snap');
      tool.onPointerDown({ button: 0 } as any); tool.onCancel();
      assert.equal(cadSnapIndicator(f.editor).get(), null, Tool.id); assert.equal(f.shapes.size, 0, Tool.id);
      assert.equal(readDrawingGuides(f.editor).guides.length, 1);
    }
  });

  it('commits dimension endpoints snapped to two guides in document coordinates', () => {
    const f = setup(guide('guide:x', 'x', 100), guide('guide:y', 'y', 200));
    const tool = new CadDimensionTool(f.editor, undefined as any); tool.onEnter();
    f.editor.inputs.currentPagePoint = { x: 103, y: 10 }; tool.onPointerDown({ button: 0 } as any);
    f.editor.inputs.currentPagePoint = { x: 300, y: 204 }; tool.onPointerDown({ button: 0 } as any);
    const shape = f.only(); assert.ok(shape); assert.equal(shape.type, 'cad-dimension');
    close(shape, { x: 100, y: 10 }); close({ x: shape.props.endX, y: shape.props.endY }, { x: 200, y: 190 });
    assert.equal(cadSnapIndicator(f.editor).get(), null); assert.equal(f.marks.length, 2);
  });

  it('maps guide snapping into rotated group-local path, Bézier node and dimension coordinates', () => {
    const f = setup(guide('guide:x', 'x', 195));
    f.editor.createShape({ id: 'shape:group', type: 'group', x: 200, y: 80, rotation: Math.PI / 2 });
    f.editor.createShape({ id: 'shape:path', type: 'cad-path', parentId: 'shape:group', props: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] } });
    const shape = f.editor.getShape('shape:path');
    close(snapCadHandle(f.editor, shape, { x: 20, y: 3 }), { x: 20, y: 5 });
    const path = f.utils['cad-path'].onHandleDrag(shape, { handle: { id: '1', x: 20, y: 3 } });
    assert.ok(path); close(path.props.points[1], { x: 20, y: 5 });
    f.editor.createShape({ id: 'shape:curve', type: 'cad-bezier', parentId: 'shape:group', props: { contours: [{ closed: false, nodes: [nodeAt({ x: 0, y: 0 }), nodeAt({ x: 10, y: 0 })] }] } });
    const curve = f.utils['cad-bezier'].onHandleDrag(f.editor.getShape('shape:curve'), { handle: { id: '0:1:node', x: 20, y: 3 } });
    assert.ok(curve); close(curve.props.contours[0].nodes[1], { x: 20, y: 5 });
    f.editor.createShape({ id: 'shape:dim', type: 'cad-dimension', parentId: 'shape:group' });
    const dimension = f.utils['cad-dimension'].onHandleDrag(f.editor.getShape('shape:dim'), { handle: { id: 'end', x: 20, y: 3 } });
    assert.ok(dimension); close({ x: dimension.props.endX, y: dimension.props.endY }, { x: 20, y: 5 });
  });

  it('keeps explicit Shift constraints authoritative while dragging nodes and drawing segments', () => {
    const f = setup(guide('guide:x', 'x', 50));
    const tool = new CadPolylineTool(f.editor, undefined as any); tool.onEnter();
    f.editor.inputs.currentPagePoint = { x: 0, y: 0 }; tool.onPointerDown({ button: 0 } as any);
    f.editor.inputs.shiftKey = true; f.editor.inputs.currentPagePoint = { x: 51, y: 2 }; tool.onPointerDown({ button: 0 } as any);
    const shape = [...f.shapes.values()][0]; close(shape.props.points[1], { x: Math.hypot(51, 2), y: 0 });
    assert.equal(cadSnapIndicator(f.editor).get(), null); tool.onCancel();
    f.editor.createShape({ id: 'shape:edit', type: 'cad-path', props: { points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] } });
    const update = f.utils['cad-path'].onHandleDrag(f.editor.getShape('shape:edit'), { handle: { id: '1', x: 51, y: 2 } });
    assert.ok(update); close(update.props.points[1], { x: 51, y: 2 });
  });

  it('clears only its own marker and does not modify native alignment indicators', () => {
    const f = setup(guide());
    close(snapCadPoint(f.editor, { x: 101, y: 0 }, null), { x: 100, y: 0 });
    assert.equal(cadSnapIndicator(f.editor).get()?.kind, 'guidelines');
    close(snapCadPoint(f.editor, { x: 150, y: 0 }, null), { x: 150, y: 0 });
    assert.equal(cadSnapIndicator(f.editor).get(), null); assert.equal(f.editor.snaps.getIndicators().length, 0);
    f.editor.snaps.setIndicators([{ id: 'native-move-indicator', type: 'points', points: [] }]);
    clearCadSnap(f.editor); assert.equal(f.editor.snaps.getIndicators()[0].id, 'native-move-indicator');
  });

  it('persists the dedicated snap toggle per page and undoes it independently of visibility', () => {
    const store = createTLStore({ shapeUtils: defaultShapeUtils });
    store.put([
      { id: 'document:document', typeName: 'document', name: 'Guidelines', gridSize: 10, meta: {} },
      { id: 'page:one', typeName: 'page', name: 'First', index: 'a1', meta: { omsGuides: { version: 1, visible: true, locked: false, guides: [guide()] } } },
      { id: 'page:two', typeName: 'page', name: 'Second', index: 'a2', meta: {} },
    ] as any);
    const history = new HistoryManager({ store }); let pageId = 'page:one';
    const editor: any = { store, getInstanceState: () => ({ isReadonly: false }), getCurrentPageId: () => pageId,
      getCurrentPage: () => store.get(pageId as any), getDocumentSettings: () => store.get('document:document' as any),
      updatePage: (patch: any) => store.put([{ ...store.get(patch.id), ...patch }]),
      run: history.batch, mark: history.mark.bind(history), bailToMark: history.bailToMark };
    try {
      assert.equal(readCadSnapSettings(editor).guidelines, true);
      assert.equal(writeCadSnapSettings(editor, { guidelines: false }), true);
      assert.equal(applyDrawingGuideChange(editor, prepareDrawingGuideChange(editor, { kind: 'settings', visible: false })), true);
      assert.equal(readCadSnapSettings(editor).guidelines, false); assert.equal(readDrawingGuides(editor).visible, false);
      history.undo(); assert.equal(readDrawingGuides(editor).visible, true); assert.equal(readCadSnapSettings(editor).guidelines, false);
      history.undo(); assert.equal(readCadSnapSettings(editor).guidelines, true);
      history.redo(); assert.equal(readCadSnapSettings(editor).guidelines, false);
      history.redo(); assert.equal(readDrawingGuides(editor).visible, false);
      const snapshot = JSON.parse(JSON.stringify(store.serialize()));
      assert.equal(snapshot['page:one'].meta.omsCadSnap.guidelines, false);
      pageId = 'page:two'; assert.equal(readCadSnapSettings(editor).guidelines, true);
      assert.deepEqual(readDrawingGuides(editor).guides, []);
    } finally { history.dispose(); }
  });
});
