import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createTLStore, defaultShapeUtils, HistoryManager, type Editor, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { applyDrawingObjectOrder, captureDrawingObjectStack, drawingObjectAncestors, prepareDrawingObjectOrder, type DrawingObjectOrderOperation } from '../../src/lib/components/canvas/drawing-object-tree';

const id = (name: string) => `shape:${name}` as TLShapeId;
const shape = (name: string, index: string, parentId = 'page:one', type = 'geo') => ({ id: id(name), type, parentId, index, x: 12, y: 34, rotation: .25,
  isLocked: false, opacity: .8, meta: { omsObjectName: name }, props: { geo: 'rectangle', w: 30, h: 50 } }) as unknown as TLShape;
const fixture = () => ['a', 'b', 'c', 'd', 'e', 'f'].map((name, i) => shape(name, `a${i + 1}`));
function fakeEditor(initial = fixture()) {
  let shapes = structuredClone(initial), selected: TLShapeId[] = [], readonly = false, page = 'page:one';
  const marks: string[] = [], snapshots = new Map<string, TLShape[]>();
  const get = (value: TLShapeId | TLShape) => typeof value === 'string' ? shapes.find(shape => shape.id === value) : value;
  const api = {
    getShape: get, getCurrentPageId: () => page, getCurrentPageShapesSorted: () => shapes,
    getCurrentPageShapeIds: () => new Set(shapes.map(shape => shape.id)),
    getSelectedShapeIds: () => selected, getSelectedShapes: () => selected.map(get).filter(Boolean),
    getInstanceState: () => ({ isReadonly: readonly }), complete: () => {}, setCurrentTool: () => {},
    getShapeAndDescendantIds: (ids: TLShapeId[]) => new Set(shapes.filter(shape => ids.includes(shape.id) || drawingObjectAncestors(shapes, shape.id).some(parent => ids.includes(parent))).map(shape => shape.id)),
    isShapeOrAncestorLocked: (value: TLShapeId | TLShape) => { const shape = get(value); return !!shape && [shape.id, ...drawingObjectAncestors(shapes, shape.id)].some(id => get(id)?.isLocked); },
    updateShapes: (updates: Array<Partial<TLShape> & { id: TLShapeId }>) => { for (const update of updates) { const current = get(update.id); if (current) Object.assign(current, update); } },
    mark: (mark: string) => { marks.push(mark); snapshots.set(mark, structuredClone(shapes)); }, run: (change: () => void) => change(),
    bailToMark: (mark: string) => { shapes = snapshots.get(mark)!; }
  };
  const editor = api as unknown as Editor;
  return { editor, api, marks, shapes: () => shapes, select: (...names: string[]) => { selected = names.map(id); },
    readonly: () => { readonly = true; }, page: (value: string) => { page = value; },
    remove: (name: string) => { shapes = shapes.filter(shape => shape.id !== id(name)); },
    order: (parent = 'page:one') => shapes.filter(shape => shape.parentId === parent).sort((a, b) => a.index < b.index ? -1 : 1).map(shape => shape.id.slice(6)),
    apply: (operation: DrawingObjectOrderOperation) => { const plan = prepareDrawingObjectOrder(editor, operation); assert.ok(plan); return applyDrawingObjectOrder(editor, plan); }
  };
}
const relative = (target: string, side: 'front' | 'behind'): DrawingObjectOrderOperation => ({ kind: 'relative', target: id(target), side });

describe('Relative object order', () => {
  it('moves a disjoint selection in front of a target in its original stack order', () => {
    const f = fakeEditor(); f.select('e', 'a');
    const original = structuredClone(f.shapes());
    assert.equal(f.apply(relative('c', 'front')), true);
    assert.deepEqual(f.order(), ['b', 'c', 'a', 'e', 'd', 'f']);
    assert.deepEqual(f.api.getSelectedShapeIds(), [id('e'), id('a')]);
    assert.equal(f.marks.length, 2);
    for (const before of original) {
      const after = f.api.getShape(before.id)!;
      assert.deepEqual({ ...after, index: before.index }, before);
      if (!['a', 'e'].includes(before.id.slice(6))) assert.equal(after.index, before.index);
    }
    f.api.bailToMark(f.marks[0]);
    assert.deepEqual(f.shapes(), original);
  });
  it('moves selected siblings directly behind a reference without crossing parents', () => {
    const f = fakeEditor([shape('group', 'a2', 'page:one', 'group'), shape('other', 'a3'),
      shape('a', 'a1', id('group')), shape('b', 'a2', id('group')), shape('c', 'a3', id('group')), shape('d', 'a4', id('group'))]);
    f.select('d', 'b');
    assert.equal(f.apply(relative('a', 'behind')), true);
    assert.deepEqual(f.order(id('group')), ['b', 'd', 'a', 'c']);
    assert.deepEqual(f.order(), ['group', 'other']);
    assert.ok(['a', 'b', 'c', 'd'].every(name => f.api.getShape(id(name))?.parentId === id('group')));
  });
  it('handles reference objects at the back and front ends', () => {
    const f = fakeEditor(); f.select('b', 'd');
    assert.equal(f.apply(relative('f', 'front')), true);
    assert.deepEqual(f.order(), ['a', 'c', 'e', 'f', 'b', 'd']);
    assert.equal(f.apply(relative('a', 'behind')), true);
    assert.deepEqual(f.order(), ['b', 'd', 'a', 'c', 'e', 'f']);
  });
  it('uses a locked reference without modifying or unlocking it', () => {
    const f = fakeEditor(); f.select('e'); f.api.getShape(id('b'))!.isLocked = true;
    const reference = structuredClone(f.api.getShape(id('b')));
    assert.equal(f.apply(relative('b', 'behind')), true);
    assert.deepEqual(f.order(), ['a', 'e', 'b', 'c', 'd', 'f']);
    assert.deepEqual(f.api.getShape(id('b')), reference);
  });
  it('retains order-form contents and production pockets when changing only sibling indices', () => {
    const order = shape('order', 'a1', 'page:one', 'order-details');
    order.props = { orderId: 'order-123', clientName: 'Client', quantity: 6 } as unknown as TLShape['props'];
    const f = fakeEditor([order, shape('drawing', 'a2'), shape('pocket', 'a3', 'page:one', 'frame'), shape('file', 'a1', id('pocket'), 'document')]);
    const original = structuredClone(f.shapes()); f.select('order');
    assert.equal(f.apply(relative('pocket', 'front')), true);
    assert.deepEqual(f.order(), ['drawing', 'pocket', 'order']);
    for (const before of original) assert.deepEqual({ ...f.api.getShape(before.id), index: before.index }, before);
    f.api.getShape(id('order'))!.isLocked = true;
    assert.equal(prepareDrawingObjectOrder(f.editor, relative('drawing', 'behind')), null);
    f.select('pocket'); f.api.getShape(id('file'))!.isLocked = true;
    assert.equal(prepareDrawingObjectOrder(f.editor, relative('drawing', 'behind')), null);
  });
  it('does not create an undo entry for an already adjacent block', () => {
    const f = fakeEditor(); f.select('c', 'b');
    assert.equal(f.apply(relative('a', 'front')), true);
    assert.equal(f.apply(relative('d', 'behind')), true);
    assert.deepEqual(f.marks, []);
    assert.deepEqual(f.order(), ['a', 'b', 'c', 'd', 'e', 'f']);
  });
  it('rejects a missing, selected, non-sibling or invalid reference', () => {
    const f = fakeEditor([...fixture(), shape('child', 'a1', id('a'))]); f.select('a');
    for (const operation of [relative('missing', 'front'), relative('a', 'behind'), relative('child', 'front'),
      { kind: 'relative', target: id('b'), side: 'invalid' } as unknown as DrawingObjectOrderOperation]) {
      assert.equal(prepareDrawingObjectOrder(f.editor, operation), null);
    }
    assert.deepEqual(f.marks, []);
  });
});

describe('Reverse object order', () => {
  it('reverses only selected slots, leaving intervening objects fixed', () => {
    const f = fakeEditor(); f.select('e', 'a', 'c');
    const fixed = ['b', 'd', 'f'].map(name => structuredClone(f.api.getShape(id(name))));
    assert.equal(f.apply({ kind: 'reverse' }), true);
    assert.deepEqual(f.order(), ['e', 'b', 'c', 'd', 'a', 'f']);
    assert.deepEqual(['b', 'd', 'f'].map(name => f.api.getShape(id(name))), fixed);
    assert.equal(f.marks.length, 2);
    assert.equal(f.apply({ kind: 'reverse' }), true);
    assert.deepEqual(f.order(), ['a', 'b', 'c', 'd', 'e', 'f']);
  });
  it('reverses an entire group as siblings without modifying child records', () => {
    const f = fakeEditor([shape('a', 'a1', 'page:one', 'group'), shape('b', 'a2'), shape('c', 'a3'), shape('child', 'a1', id('a'))]);
    const child = structuredClone(f.api.getShape(id('child'))); f.select('a', 'b', 'c');
    assert.equal(f.apply({ kind: 'reverse' }), true);
    assert.deepEqual(f.order(), ['c', 'b', 'a']);
    assert.deepEqual(f.api.getShape(id('child')), child);
  });
  it('requires at least two selected siblings and rejects mixed parents', () => {
    const f = fakeEditor([...fixture(), shape('child', 'a1', id('a'))]);
    assert.equal(prepareDrawingObjectOrder(f.editor, { kind: 'reverse' }), null);
    f.select('b'); assert.equal(prepareDrawingObjectOrder(f.editor, { kind: 'reverse' }), null);
    f.select('b', 'child'); assert.equal(prepareDrawingObjectOrder(f.editor, { kind: 'reverse' }), null);
  });
});

describe('Order validation and atomic history', () => {
  it('persists the real store indices and undoes/redoes a whole selection in one history step', () => {
    const store = createTLStore({ shapeUtils: defaultShapeUtils });
    store.put(fixture().map(source => store.schema.types.shape.create({ ...source, type: 'text', props: {
      text: source.meta.omsObjectName as string, color: 'black', size: 'm', font: 'sans', textAlign: 'start', autoSize: true, scale: 1, w: 100
    } })));
    const history = new HistoryManager({ store }), selected = [id('a'), id('c')];
    const shapes = () => store.allRecords().filter(record => record.typeName === 'shape') as TLShape[];
    const order = () => shapes().sort((a, b) => a.index < b.index ? -1 : 1).map(shape => shape.id.slice(6));
    const editor = {
      getShape: (id: TLShapeId) => store.get(id), getSelectedShapeIds: () => selected,
      getSelectedShapes: () => selected.map(id => store.get(id)), getCurrentPageId: () => 'page:one',
      getCurrentPageShapesSorted: shapes, getCurrentPageShapeIds: () => new Set(shapes().map(shape => shape.id)),
      getInstanceState: () => ({ isReadonly: false }), getShapeAndDescendantIds: (ids: TLShapeId[]) => new Set(ids),
      isShapeOrAncestorLocked: () => false, complete: () => {}, setCurrentTool: () => {},
      run: history.batch, mark: history.mark.bind(history), bailToMark: history.bailToMark,
      updateShapes: (updates: Array<Partial<TLShape> & { id: TLShapeId }>) => store.put(updates.map(patch => ({ ...store.get(patch.id) as TLShape, ...patch }) as TLShape))
    } as unknown as Editor;
    try {
      const plan = prepareDrawingObjectOrder(editor, relative('f', 'front'))!;
      assert.equal(applyDrawingObjectOrder(editor, plan), true);
      assert.deepEqual(order(), ['b', 'd', 'e', 'f', 'a', 'c']);
      const saved = JSON.parse(JSON.stringify(store.getStoreSnapshot()));
      const restored = createTLStore({ shapeUtils: defaultShapeUtils }); restored.loadStoreSnapshot(saved);
      for (const source of shapes()) assert.deepEqual(restored.get(source.id), source);
      history.undo(); assert.deepEqual(order(), ['a', 'b', 'c', 'd', 'e', 'f']);
      history.redo(); assert.deepEqual(order(), ['b', 'd', 'e', 'f', 'a', 'c']);
    } finally { history.dispose(); }
  });
  it('rejects stale selection, changed stack, added siblings and page changes', () => {
    for (const mutate of [
      (f: ReturnType<typeof fakeEditor>) => f.select('c'),
      (f: ReturnType<typeof fakeEditor>) => { f.api.getShape(id('d'))!.index = 'a7' as TLShape['index']; },
      (f: ReturnType<typeof fakeEditor>) => { f.shapes().push(shape('new', 'a8')); },
      (f: ReturnType<typeof fakeEditor>) => f.page('page:two'),
      (f: ReturnType<typeof fakeEditor>) => f.remove('f'),
    ]) {
      const f = fakeEditor(); f.select('a', 'b'); const plan = prepareDrawingObjectOrder(f.editor, relative('f', 'front'))!;
      mutate(f); const changed = structuredClone(f.shapes());
      assert.equal(applyDrawingObjectOrder(f.editor, plan), false);
      assert.deepEqual(f.shapes(), changed); assert.deepEqual(f.marks, []);
    }
  });
  it('rechecks read-only, inherited locks and locked descendants on apply', () => {
    for (const mutate of [
      (f: ReturnType<typeof fakeEditor>) => f.readonly(),
      (f: ReturnType<typeof fakeEditor>) => { f.api.getShape(id('a'))!.isLocked = true; },
      (f: ReturnType<typeof fakeEditor>) => { f.api.getShape(id('child'))!.isLocked = true; },
    ]) {
      const f = fakeEditor([...fixture(), shape('child', 'a1', id('a'))]); f.select('a');
      const plan = prepareDrawingObjectOrder(f.editor, relative('d', 'front'))!;
      mutate(f); assert.equal(applyDrawingObjectOrder(f.editor, plan), false); assert.deepEqual(f.marks, []);
    }
    const f = fakeEditor([shape('group', 'a1', 'page:one', 'group'), shape('a', 'a1', id('group')), shape('b', 'a2', id('group'))]);
    f.select('a'); f.api.getShape(id('group'))!.isLocked = true;
    assert.equal(prepareDrawingObjectOrder(f.editor, relative('b', 'front')), null);
  });
  it('rechecks selection after completing a gesture', () => {
    const f = fakeEditor(); f.select('a'); const plan = prepareDrawingObjectOrder(f.editor, relative('d', 'front'))!;
    f.api.complete = () => f.select('b');
    assert.equal(applyDrawingObjectOrder(f.editor, plan), false);
    assert.deepEqual(f.order(), ['a', 'b', 'c', 'd', 'e', 'f']); assert.deepEqual(f.marks, []);
  });
  it('permits unrelated geometry edits without applying a stale index operation', () => {
    const f = fakeEditor(); f.select('a'); const plan = prepareDrawingObjectOrder(f.editor, relative('d', 'front'))!;
    f.api.getShape(id('b'))!.x = 123;
    assert.equal(applyDrawingObjectOrder(f.editor, plan), true);
    assert.equal(f.api.getShape(id('b'))!.x, 123);
    assert.deepEqual(f.order(), ['b', 'c', 'd', 'a', 'e', 'f']);
  });
  it('rolls back partial failures and detects silently ignored native updates', () => {
    for (const kind of ['throw', 'ignore'] as const) {
      const f = fakeEditor(); f.select('a', 'b'); const original = structuredClone(f.shapes()), update = f.api.updateShapes;
      f.api.updateShapes = updates => { if (kind === 'throw') { update(updates.slice(0, 1)); throw new Error('simulated failure'); } };
      assert.equal(f.apply(relative('e', 'front')), false); assert.deepEqual(f.shapes(), original);
      assert.equal(f.marks.length, 1);
    }
  });
  it('rejects missing selected objects and ambiguous duplicate indices', () => {
    const f = fakeEditor(); f.select('missing', 'a');
    assert.equal(captureDrawingObjectStack(f.editor), null);
    f.select('a'); f.api.getShape(id('c'))!.index = f.api.getShape(id('b'))!.index;
    assert.equal(prepareDrawingObjectOrder(f.editor, relative('d', 'front')), null);
  });
});
