import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';
import { applyPathRepeat, preparePathRepeat } from '../../src/lib/components/canvas/drawing-path-repeat';
import type { PathRepeatOptions } from '../../src/lib/components/canvas/cad-path-repeat-layout';

const guide = 'shape:guide' as TLShapeId;
const source = 'shape:source' as TLShapeId;
const options: PathRepeatOptions = {
  mode: 'count', count: 3, startInset: 0, endInset: 0, offset: 0, reverse: false, followTangent: true,
};
const page = { id: 'page:pattern', meta: { omsCad: DEFAULT_CAD_SETTINGS } };
interface Shape { id: TLShapeId; type: 'cad-path'; parentId: string; x: number; y: number; rotation: number; opacity: number; props: { points: { x: number; y: number }[]; closed: boolean }; meta: { label: string }; }

function fixture() {
  const makeShape = (id: TLShapeId, x: number, y: number, last: { x: number; y: number }): Shape => ({
    id, type: 'cad-path', parentId: page.id, x, y, rotation: 0, opacity: 1, props: { points: [{ x: 0, y: 0 }, last], closed: false }, meta: { label: id },
  });
  const original = makeShape(source, 10, 100, { x: 20, y: 0 });
  const shapes = new Map([[source, original], [guide, makeShape(guide, 200, 300, { x: 0, y: 100 })]]);
  let selected = [source, guide], serial = 0, snapshot: { shapes: Map<TLShapeId, Shape>; selected: TLShapeId[] } | undefined;
  let isReadonly = false, failCopyAt = -1, marks = 0;
  const editor = {
    getCurrentPage: () => page, getCurrentPageId: () => page.id,
    getSelectedShapeIds: () => selected, setSelectedShapes: (value: TLShapeId[]) => { selected = value; },
    getShape: (id: TLShapeId) => shapes.get(id),
    getShapeAndDescendantIds: (ids: TLShapeId[]) => new Set(ids),
    getInstanceState: () => ({ isReadonly }), isShapeOrAncestorLocked: () => false,
    getShapeMask: () => null, getBindingsInvolvingShape: () => [],
    getShapePageTransform: (shape: Shape) => ({
      applyToPoint: ({ x, y }: { x: number; y: number }) => ({
        x: shape.x + x * Math.cos(shape.rotation) - y * Math.sin(shape.rotation),
        y: shape.y + x * Math.sin(shape.rotation) + y * Math.cos(shape.rotation),
      }),
    }),
    getCurrentPageShapeIds: () => new Set(shapes.keys()), getCurrentPageShapesSorted: () => [...shapes.values()],
    options: { maxShapesPerPage: 100 }, store: { getStoreSnapshot: () => [...shapes.values()] },
    complete: () => {}, setCurrentTool: () => {},
    mark: () => { marks++; snapshot ??= { shapes: structuredClone(shapes), selected: [...selected] }; },
    run: (action: () => void) => action(),
    bailToMark: () => {
      assert.ok(snapshot);
      shapes.clear();
      for (const [id, shape] of snapshot.shapes) shapes.set(id, shape);
      selected = snapshot.selected;
    },
    duplicateShapes: (ids: TLShapeId[]) => {
      if (serial === failCopyAt) return;
      selected = ids.map(id => {
        const copy = structuredClone(shapes.get(id)!);
        copy.id = `shape:copy-${++serial}` as TLShapeId;
        shapes.set(copy.id, copy);
        return copy.id;
      });
    },
    updateShapes: (updates: Pick<Shape, 'id' | 'x' | 'y' | 'rotation'>[]) => {
      for (const update of updates) Object.assign(shapes.get(update.id)!, update);
    },
  };
  return { editor: editor as unknown as Editor, shapes, original: structuredClone(original), get selected() { return selected; },
    get marks() { return marks; }, setReadOnly: () => { isReadonly = true; }, failAfterOneCopy: () => { failCopyAt = 1; } };
}

describe('repeat artwork along a guide', () => {
  it('preserves the guide and artwork while creating editable, rotated copies in one undo group', () => {
    const f = fixture();
    const { editor, shapes, original } = f;
    const guideBefore = structuredClone(shapes.get(guide));
    const plan = preparePathRepeat(editor, guide, options);
    assert.equal(plan.created, 3);
    assert.equal(applyPathRepeat(editor, plan), true);
    assert.equal(f.marks, 2);
    assert.deepEqual(shapes.get(source), original);
    assert.deepEqual(shapes.get(guide), guideBefore);
    const ids = editor.getSelectedShapeIds();
    assert.equal(ids.length, 3);
    assert.deepEqual(ids.map(id => Math.round(shapes.get(id)!.y)), [290, 340, 390]);
    for (const id of ids) {
      const copy = shapes.get(id)!;
      assert.ok(Math.abs(copy.x - 200) < 1e-6);
      assert.equal(copy.rotation, Math.PI / 2);
      assert.deepEqual(copy.meta, original.meta);
      assert.deepEqual(copy.props, original.props);
    }
  });

  it('rejects stale geometry and edits in a read-only drawing', () => {
    const first = fixture(), plan = preparePathRepeat(first.editor, guide, options);
    first.shapes.get(guide)!.x++;
    assert.equal(applyPathRepeat(first.editor, plan), false);
    assert.equal(first.shapes.size, 2);
    const second = fixture(), next = preparePathRepeat(second.editor, guide, options);
    second.setReadOnly();
    assert.equal(applyPathRepeat(second.editor, next), false);
    assert.equal(second.marks, 0);
  });

  it('rolls back copies and restores the selection if duplication refuses a later placement', () => {
    const f = fixture(), plan = preparePathRepeat(f.editor, guide, options);
    f.failAfterOneCopy();
    assert.equal(applyPathRepeat(f.editor, plan), false);
    assert.equal(f.shapes.size, 2);
    assert.deepEqual(f.selected, [source, guide]);
  });
});
