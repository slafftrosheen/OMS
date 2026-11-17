import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createTLStore, defaultShapeUtils, Editor, GroupShapeUtil, HistoryManager, Mat, PageRecordType, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { CadPathShapeUtil } from '../../src/lib/components/canvas/shapes/CadShapes';
import { CadBezierShapeUtil } from '../../src/lib/components/canvas/shapes/CadBezierShape';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { applySkewPlan, prepareSkewPlan, type SkewOptions } from '../../src/lib/components/canvas/drawing-skew';

const shapeUtils = [...defaultShapeUtils, CadPathShapeUtil, CadBezierShapeUtil];
const options: SkewOptions = { axis: 'horizontal', angle: 25, anchor: 'bottom-left', keepOriginal: false };
const path = (id: string, parentId = 'page:skew', index = 'a1', x = 0) => ({ id: `shape:${id}`, type: 'cad-path', parentId, index, x,
  props: { color: 'black', closed: true, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }] } });
const grouped = () => [
  { id: 'shape:g', type: 'group', parentId: 'page:skew', index: 'a1', x: 150, y: 100, rotation: .4, opacity: .7, props: {}, meta: { omsObjectName: 'Grouped sign' } },
  path('a', 'shape:g'),
  { ...path('b', 'shape:g', 'a2', 150), type: 'cad-bezier', props: { color: 'black', fillRule: 'evenodd', contours: [{ closed: true,
    nodes: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 60 }, { x: 0, y: 60 }].map(nodeAt) }] } },
];

/** Native schema, Store and HistoryManager, with the pinned Editor.createShapes
 * and GroupShapeUtil.onChildrenChange code. The DOM-facing editor surface is an
 * adapter; this deliberately does not claim a mounted-browser interaction test. */
function nativeCanvas(initial = grouped()) {
  const store = createTLStore({ shapeUtils });
  const page = PageRecordType.create({ id: PageRecordType.createId('skew'), name: 'Skew', index: 'a1' as any, meta: { omsCad: { ...DEFAULT_CAD_SETTINGS } } });
  store.put([page, ...initial.map(shape => store.schema.types.shape.create(shape as any))]);
  const history = new HistoryManager({ store });
  let selected: TLShapeId[] = ['shape:g' as TLShapeId];
  const records = () => store.allRecords().filter(record => record.typeName === 'shape') as TLShape[];
  const ordered = () => records().sort((a, b) => a.id.localeCompare(b.id));
  const transform = (input: any): Mat => {
    const shape = typeof input === 'string' ? store.get(input as TLShapeId) as TLShape : input;
    const parent = store.get(shape.parentId) as TLShape | undefined;
    const local = Mat.Identity().translate(shape.x, shape.y).rotate(shape.rotation);
    return parent?.typeName === 'shape' ? transform(parent).multiply(local) : local;
  };
  const descendants = (roots: TLShapeId[]) => {
    const result = new Set(roots);
    for (const id of result) for (const shape of records()) if (shape.parentId === id) result.add(shape.id);
    return result;
  };
  const editor: any = {
    store, options: { maxShapesPerPage: 2000 }, styleProps: { group: new Map(), 'cad-path': new Map(), 'cad-bezier': new Map() },
    getShape: (id: TLShapeId) => { const record = store.get(id); return record?.typeName === 'shape' ? record : undefined; }, getCurrentPage: () => store.get(page.id), getCurrentPageId: () => page.id,
    getCurrentPageShapeIds: () => new Set(records().map(shape => shape.id)), getCurrentPageShapesSorted: ordered,
    getFocusedGroupId: () => page.id, getCurrentPageState: () => ({ focusedGroupId: null }), popFocusedGroupId: () => {},
    getSelectedShapeIds: () => [...selected], setSelectedShapes: (ids: TLShapeId[]) => { selected = [...ids]; },
    getInstanceState: () => ({ isReadonly: false, opacityForNextShape: 1 }), getInitialMetaForShape: () => ({}),
    getShapePageTransform: transform, getShapeMask: () => undefined, getBindingsInvolvingShape: () => [],
    getShapeAndDescendantIds: descendants,
    isShapeOrAncestorLocked: (input: any): boolean => {
      const shape = typeof input === 'string' ? store.get(input as TLShapeId) as TLShape : input;
      if (!shape || shape.typeName !== 'shape') return false;
      return shape.isLocked || editor.isShapeOrAncestorLocked(shape.parentId);
    },
    getSortedChildIdsForParent: (id: string) => records().filter(shape => shape.parentId === id).sort((a, b) => a.index < b.index ? -1 : 1).map(shape => shape.id),
    mark: history.mark.bind(history), run: history.batch, bailToMark: history.bailToMark,
    complete: () => {}, setCurrentTool: () => {}, getCamera: () => ({ x: 0, y: 0, z: 1 }), setCamera: () => {},
    createShapes: Editor.prototype.createShapes,
    updateShapes: (patches: any[]) => store.put(patches.map(patch => {
      const previous = store.get(patch.id) as TLShape;
      return { ...previous, ...patch, props: { ...previous.props, ...patch.props } };
    })),
    deleteShapes: (ids: TLShapeId[]) => store.remove([...descendants(ids)]),
    reparentShapes: (ids: TLShapeId[], parentId: any) => {
      const parent = store.get(parentId) as TLShape | undefined;
      const parentTransform = parent?.typeName === 'shape' ? transform(parent) : Mat.Identity();
      const patches = ids.map(id => {
        const shape = store.get(id) as TLShape, matrix = transform(shape), position = parentTransform.clone().invert().applyToPoint(matrix.point());
        return { id, type: shape.type, parentId, x: position.x, y: position.y, rotation: matrix.rotation() - parentTransform.rotation() };
      });
      editor.updateShapes(patches);
    },
  };
  const utils: Record<string, any> = { group: new GroupShapeUtil(editor), 'cad-path': new CadPathShapeUtil(editor), 'cad-bezier': new CadBezierShapeUtil(editor) };
  editor.getShapeUtil = (shape: TLShape) => utils[shape.type];
  // Mirror the pinned editor's group invalidation scheduling while executing
  // the native Store atomic callback lifecycle and actual group utility.
  const invalidParents = new Set<TLShapeId>();
  const removeChange = store.sideEffects.registerAfterChangeHandler('shape', (before, after) => {
    if (before.parentId.startsWith('shape:')) invalidParents.add(before.parentId as TLShapeId);
    if (after.parentId !== before.parentId && after.parentId.startsWith('shape:')) invalidParents.add(after.parentId as TLShapeId);
  });
  const removeDelete = store.sideEffects.registerAfterDeleteHandler('shape', before => {
    if (before.parentId.startsWith('shape:')) invalidParents.add(before.parentId as TLShapeId);
  });
  const removeComplete = store.sideEffects.registerOperationCompleteHandler(() => {
    for (const id of invalidParents) {
      invalidParents.delete(id);
      const parent = store.get(id) as TLShape | undefined;
      if (parent) utils[parent.type].onChildrenChange?.(parent);
    }
  });
  return { editor: editor as Editor, store, history, ordered, select: (ids: TLShapeId[]) => { selected = ids; },
    dispose: () => { removeChange(); removeDelete(); removeComplete(); history.dispose(); } };
}

describe('Skew with native tldraw persistence and history', () => {
  it('edits grouped curve schemas, serializes and restores one Undo/Redo step', () => {
    const f = nativeCanvas(), before = structuredClone(f.ordered());
    try {
      const plan = prepareSkewPlan(f.editor, options); assert.equal(applySkewPlan(f.editor, plan), true);
      const after = structuredClone(f.ordered()); assert.notDeepEqual(after, before); assert.equal(after.length, 3);
      assert.deepEqual(after.find(shape => shape.id === 'shape:g'), before.find(shape => shape.id === 'shape:g'));
      assert.deepEqual(after.map(shape => [shape.id, shape.parentId]), before.map(shape => [shape.id, shape.parentId]));
      const saved = JSON.parse(JSON.stringify(f.store.getStoreSnapshot('document'))), restored = createTLStore({ shapeUtils });
      restored.loadStoreSnapshot(saved);
      for (const shape of after) assert.deepEqual(restored.get(shape.id), shape);
      f.history.undo(); assert.deepEqual(f.ordered(), before);
      f.history.redo(); assert.deepEqual(f.ordered(), after);
    } finally { f.dispose(); }
  });
  it('uses native createShapes to copy a complete rotated group and undo/redo it atomically', () => {
    const f = nativeCanvas(), before = structuredClone(f.ordered());
    try {
      const plan = prepareSkewPlan(f.editor, { ...options, keepOriginal: true });
      assert.equal(applySkewPlan(f.editor, plan), true);
      const after = structuredClone(f.ordered()); assert.equal(after.length, 6);
      for (const shape of before) assert.deepEqual(f.store.get(shape.id), shape);
      const copyGroup = after.find(shape => shape.type === 'group' && shape.id !== 'shape:g')!;
      assert.ok(copyGroup); assert.equal(after.filter(shape => shape.parentId === copyGroup.id).length, 2);
      assert.equal(copyGroup.rotation, .4); assert.equal(copyGroup.opacity, .7);
      const restored = createTLStore({ shapeUtils }); restored.loadStoreSnapshot(JSON.parse(JSON.stringify(f.store.getStoreSnapshot('document'))));
      for (const shape of after) assert.deepEqual(restored.get(shape.id), shape);
      f.history.undo(); assert.deepEqual(f.ordered(), before);
      f.history.redo(); assert.deepEqual(f.ordered(), after);
    } finally { f.dispose(); }
  });
  it('detects the native ungrouping of a legacy singleton and keeps no partial skew', () => {
    const f = nativeCanvas(grouped().slice(0, 2)), before = structuredClone(f.ordered());
    try {
      const plan = prepareSkewPlan(f.editor, options);
      assert.equal(applySkewPlan(f.editor, plan), false);
      assert.deepEqual(f.ordered(), before);
    } finally { f.dispose(); }
  });
});
