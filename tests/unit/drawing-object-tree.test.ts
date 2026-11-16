import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { Editor, TLShape, TLShapeId } from '@tldraw/tldraw';
import { canReorderDrawingObjects, drawingObjectAncestors, drawingObjectTree, reorderDrawingObjects, resolveObjectTreeSelection, selectDrawingObject } from '../../src/lib/components/canvas/drawing-object-tree';

const id = (name: string) => `shape:${name}` as TLShapeId;
const shape = (name: string, parent = 'page:one', index = 'a1', type = 'geo', extra: Record<string, unknown> = {}) => ({ id: id(name), type, parentId: parent, index, x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, meta: { omsObjectName: name }, props: { geo: 'rectangle' }, ...extra }) as unknown as TLShape;
const names = (rows: ReturnType<typeof drawingObjectTree>) => rows.map(row => row.shape.id);
const fixture = () => [shape('back', 'page:one', 'a1'), shape('group', 'page:one', 'a3', 'group'), shape('low', id('group'), 'a1'), shape('nested', id('group'), 'a2', 'group'), shape('needle', id('nested'), 'a1'), shape('front', 'page:one', 'a4')];
function fakeEditor(initial = fixture()) {
  let shapes = structuredClone(initial), selected: TLShapeId[] = [], readonly = false;
  const calls: Array<[string, TLShapeId[]]> = [], marks: string[] = [];
  const snapshots = new Map<string, TLShape[]>();
  const get = (value: TLShapeId | TLShape) => typeof value === 'string' ? shapes.find(shape => shape.id === value) : value;
  const editor = {
    getShape: get, getCurrentPageShapesSorted: () => shapes, getCurrentPageShapeIds: () => new Set(shapes.map(shape => shape.id)),
    getSelectedShapeIds: () => selected, getSelectedShapes: () => selected.map(get).filter(Boolean), setSelectedShapes: (ids: TLShapeId[]) => { selected = [...ids]; },
    getInstanceState: () => ({ isReadonly: readonly }), complete: () => {}, setCurrentTool: () => {},
    getShapeAndDescendantIds: (ids: TLShapeId[]) => new Set(shapes.filter(shape => ids.includes(shape.id) || drawingObjectAncestors(shapes, shape.id).some(parent => ids.includes(parent))).map(shape => shape.id)),
    isShapeOrAncestorLocked: (value: TLShapeId | TLShape) => { const shape = get(value); return !!shape && [shape.id, ...drawingObjectAncestors(shapes, shape.id)].some(id => get(id)?.isLocked); },
    mark: (mark: string) => { marks.push(mark); snapshots.set(mark, structuredClone(shapes)); }, run: (change: () => void) => change(), bailToMark: (mark: string) => { shapes = snapshots.get(mark)!; },
    bringToFront: (ids: TLShapeId[]) => { calls.push(['front', ids]); }, sendToBack: (ids: TLShapeId[]) => { calls.push(['back', ids]); },
    bringForward: (ids: TLShapeId[]) => { calls.push(['forward', ids]); }, sendBackward: (ids: TLShapeId[]) => { calls.push(['backward', ids]); }
  };
  return { editor: editor as unknown as Editor, api: editor, calls, marks, select: (...ids: string[]) => { selected = ids.map(id); }, readonly: () => { readonly = true; }, remove: (name: string) => { shapes = shapes.filter(shape => shape.id !== id(name)); }, shapes: () => shapes };
}

describe('Objects hierarchy and selection', () => {
  it('sorts each sibling stack front-first and retains nested depth', () => {
    const rows = drawingObjectTree(fixture(), new Set());
    assert.deepEqual(names(rows), ['front', 'group', 'nested', 'needle', 'low', 'back'].map(id));
    assert.deepEqual(rows.map(row => row.depth), [0, 0, 1, 2, 1, 0]);
    assert.deepEqual([rows[2].position, rows[2].siblings, rows[3].parent], [1, 2, id('nested')]);
  });
  it('collapses descendants without promoting them to roots', () => {
    assert.deepEqual(names(drawingObjectTree(fixture(), new Set([id('group')]))), ['front', 'group', 'back'].map(id));
  });
  it('finds a deeply nested label through collapsed ancestors without changing collapse state', () => {
    const collapsed = new Set([id('group'), id('nested')]);
    const rows = drawingObjectTree(fixture(), collapsed, 'NEEDLE');
    assert.deepEqual(names(rows), ['group', 'nested', 'needle'].map(id));
    assert.deepEqual(rows.map(row => row.matched), [false, false, true]);
    assert.deepEqual([...collapsed], [id('group'), id('nested')]);
  });
  it('a matching group exposes its contents and nonmatching searches are empty', () => {
    assert.deepEqual(names(drawingObjectTree(fixture(), new Set(), 'group')), ['group', 'nested', 'needle', 'low'].map(id));
    assert.deepEqual(drawingObjectTree(fixture(), new Set(), 'absent'), []);
  });
  it('keeps file cards and order form nodes in the hierarchy', () => {
    const shapes = [shape('files', 'page:one', 'a2', 'frame'), shape('drawing.pdf', id('files'), 'a1', 'document'), shape('order', 'page:one', 'a1', 'order-details')];
    assert.deepEqual(names(drawingObjectTree(shapes, new Set())), ['files', 'drawing.pdf', 'order'].map(id));
  });
  it('terminates on corrupted cycles and displays orphan nodes', () => {
    const shapes = [shape('a', id('b')), shape('b', id('a')), shape('lost', id('missing'))];
    const rows = drawingObjectTree(shapes, new Set());
    assert.equal(rows.length, 3); assert.equal(new Set(names(rows)).size, 3);
    assert.deepEqual(drawingObjectAncestors(shapes, id('a')), [id('b')]);
  });
  it('Ctrl selection replaces an ancestor with its child, or children with their parent', () => {
    const shapes = fixture(), visible = names(drawingObjectTree(shapes, new Set()));
    assert.deepEqual(resolveObjectTreeSelection(shapes, visible, [id('group'), id('back')], id('needle'), { toggle: true }), ['back', 'needle'].map(id));
    assert.deepEqual(resolveObjectTreeSelection(shapes, visible, [id('needle'), id('low')], id('group'), { toggle: true }), [id('group')]);
    assert.deepEqual(resolveObjectTreeSelection(shapes, visible, [id('needle')], id('needle'), { toggle: true }), []);
  });
  it('ranges use the visible filtered order and suppress covered descendants', () => {
    const shapes = fixture(), visible = names(drawingObjectTree(shapes, new Set([id('nested')])));
    assert.deepEqual(resolveObjectTreeSelection(shapes, visible, [], id('low'), { range: true, anchor: id('nested') }), ['nested', 'low'].map(id));
    assert.deepEqual(resolveObjectTreeSelection(shapes, visible, [], id('low'), { range: true, anchor: id('front') }), ['front', 'group'].map(id));
    assert.deepEqual(resolveObjectTreeSelection(shapes, visible, [id('back')], id('low'), { range: true, toggle: true, anchor: id('nested') }), ['back', 'nested', 'low'].map(id));
  });
  it('ignores stale targets, hidden range anchors and removed selections', () => {
    const shapes = fixture(), visible = names(drawingObjectTree(shapes, new Set([id('group')])));
    assert.deepEqual(resolveObjectTreeSelection(shapes, visible, [id('gone'), id('back')], id('gone')), [id('back')]);
    assert.deepEqual(resolveObjectTreeSelection(shapes, visible, [id('back')], id('front'), { range: true, anchor: id('needle') }), [id('front')]);
  });
  it('permits read-only selection and rechecks a removed target after completing a gesture', () => {
    const f = fakeEditor(); f.readonly();
    assert.equal(selectDrawingObject(f.editor, [id('back')], id('back')), true);
    assert.deepEqual(f.api.getSelectedShapeIds(), [id('back')]);
    f.api.complete = () => f.remove('front');
    assert.equal(selectDrawingObject(f.editor, [id('front')], id('front')), false);
  });
});

describe('Objects stacking', () => {
  it('passes only selected siblings to native stacking in one undo boundary', () => {
    for (const action of ['front', 'back', 'forward', 'backward'] as const) {
      const f = fakeEditor(); f.select('nested', 'low');
      assert.equal(reorderDrawingObjects(f.editor, action), true);
      assert.deepEqual(f.calls, [[action, [id('nested'), id('low')]]]);
      assert.equal(f.marks.length, 2);
      assert.equal(f.shapes().find(shape => shape.id === id('nested'))?.parentId, id('group'));
    }
  });
  it('blocks mixed parents, readonly and groups with locked descendants', () => {
    const f = fakeEditor(); f.select('front', 'low'); assert.equal(canReorderDrawingObjects(f.editor), false);
    f.select('group'); const child = f.shapes().find(shape => shape.id === id('needle'))!; child.isLocked = true;
    assert.equal(reorderDrawingObjects(f.editor, 'forward'), false);
    child.isLocked = false; f.readonly(); assert.equal(reorderDrawingObjects(f.editor, 'front'), false);
    assert.deepEqual(f.calls, []);
  });
  it('rechecks locks after a gesture and rolls back native failures', () => {
    const f = fakeEditor(); f.select('front');
    f.api.complete = () => { f.shapes().find(shape => shape.id === id('front'))!.isLocked = true; };
    assert.equal(reorderDrawingObjects(f.editor, 'front'), false);
    f.api.complete = () => {}; f.shapes().find(shape => shape.id === id('front'))!.isLocked = false;
    f.api.bringToFront = () => { f.shapes().find(shape => shape.id === id('front'))!.index = 'z9' as TLShape['index']; throw new Error('native failure'); };
    assert.equal(reorderDrawingObjects(f.editor, 'front'), false);
    assert.equal(f.shapes().find(shape => shape.id === id('front'))!.index, 'a4');
  });
});
