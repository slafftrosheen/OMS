import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { drawingObjectAlias, drawingObjectName, drawingPngSize, renameDrawingObject, repeatDrawingSelection, planDrawingExport } from '../../src/lib/components/canvas/drawing-operations';

function fixture() {
  const a: any = { id: 'shape:a', type: 'geo', parentId: 'page:one', props: { text: 'Production artwork', w: 100, h: 50 }, meta: { audit: 'keep' } };
  const b: any = { id: 'shape:b', type: 'arrow', parentId: 'page:one', props: {}, meta: {} };
  const shapes = new Map<string, any>([[a.id, a], [b.id, b]]);
  let selected = [a.id, b.id];
  const state = { isReadonly: false, failAt: 0 };
  const calls: Array<[string, ...any[]]> = [];
  const related = (ids: string[]) => {
    const result = new Set(ids);
    for (const id of result) for (const shape of shapes.values()) if (shape.parentId === id) result.add(shape.id);
    return result;
  };
  let sequence = 0;
  const editor: any = {
    options: { maxShapesPerPage: 4000 }, getShape: (id: string) => shapes.get(id),
    getCurrentPageShapeIds: () => new Set(shapes.keys()), getShapeAndDescendantIds: related,
    getSelectedShapeIds: () => selected, getInstanceState: () => state,
    isShapeOrAncestorLocked: (idOrShape: any) => { let shape = typeof idOrShape === 'string' ? shapes.get(idOrShape) : idOrShape; while (shape) { if (shape.isLocked) return true; shape = shapes.get(shape.parentId); } return false; },
    getSelectionPageBounds: () => ({ x: 0, y: 0, w: 120, h: 50 }),
    getShapeMaskedPageBounds: (id: string) => shapes.get(id)?.bounds ?? { x: id === a.id ? 0 : 100, y: 0, w: 100, h: 50 },
    getCamera: () => ({ x: 12, y: 15, z: 1 }), setCamera: (value: any) => calls.push(['camera', value]),
    complete() {}, setCurrentTool() {},
    mark: (value: string) => calls.push(['mark', value]), bailToMark: (value: string) => calls.push(['rollback', value]),
    run: (fn: () => void) => fn(),
    updateShapes: (updates: any[]) => { calls.push(['update', updates]); for (const update of updates) shapes.set(update.id, { ...shapes.get(update.id), ...update }); },
    setSelectedShapes: (ids: string[]) => { selected = ids; },
    duplicateShapes: (ids: string[], offset: any) => {
      calls.push(['duplicate', [...ids], offset]); sequence++;
      if (state.failAt === sequence) return; // Native page-limit refusal is silent.
      for (const id of related(ids)) shapes.set(`${id}:${sequence}`, { ...shapes.get(id), id: `${id}:${sequence}` });
      selected = ids.map(id => `${id}:${sequence}`);
    }
  };
  return { editor, a, b, shapes, state, calls, selected: () => selected };
}

describe('Drawing names and repeat grid', () => {
  it('stores aliases only in metadata, keeps source form properties and resets aliases without dropping other metadata', () => {
    const f = fixture(); f.a.type = 'order-details';
    assert.equal(renameDrawingObject(f.editor, f.a.id, '  Front elevation  '), true);
    const renamed = f.shapes.get(f.a.id);
    assert.equal(drawingObjectName(renamed), 'Front elevation');
    assert.deepEqual(renamed.props, f.a.props);
    assert.equal(renamed.meta.audit, 'keep');
    assert.equal(renameDrawingObject(f.editor, f.a.id, ''), true);
    assert.equal(drawingObjectAlias(f.shapes.get(f.a.id)), '');
    assert.equal(drawingObjectName(f.shapes.get(f.a.id)), 'Production artwork');
  });
  it('refuses renaming locked or readonly objects and preserves the previous alias', () => {
    const f = fixture(); f.a.isLocked = true;
    assert.equal(renameDrawingObject(f.editor, f.a.id, 'New'), false);
    f.a.isLocked = false; f.state.isReadonly = true;
    assert.equal(renameDrawingObject(f.editor, f.a.id, 'New'), false);
    assert.equal(f.calls.length, 0);
  });
  it('duplicates the same complete selection for every cell in one history transaction, using edge gaps', () => {
    const f = fixture();
    assert.deepEqual(repeatDrawingSelection(f.editor, { rows: 2, columns: 3, gapX: 10, gapY: 20 }, [...f.selected()]), { ok: true, value: 10 });
    assert.deepEqual(f.calls.filter(call => call[0] === 'duplicate').map(call => [call[1], call[2]]), [
      [[f.a.id, f.b.id], { x: 130, y: 0 }], [[f.a.id, f.b.id], { x: 260, y: 0 }],
      [[f.a.id, f.b.id], { x: 0, y: 70 }], [[f.a.id, f.b.id], { x: 130, y: 70 }], [[f.a.id, f.b.id], { x: 260, y: 70 }]
    ]);
    assert.equal(f.calls.filter(call => call[0] === 'mark').length, 2);
    assert.equal(f.selected().length, 12);
  });
  it('counts grouped children toward limits and rejects forms hidden inside groups', () => {
    const f = fixture(); f.a.type = 'group'; f.b.parentId = f.a.id;
    assert.deepEqual(repeatDrawingSelection(f.editor, { rows: 20, columns: 20, gapX: 0, gapY: 0 }, [...f.selected()]), { ok: false, error: 'repeatLimit' });
    f.b.type = 'profile-7st';
    assert.deepEqual(repeatDrawingSelection(f.editor, { rows: 2, columns: 2, gapX: 0, gapY: 0 }, [...f.selected()]), { ok: false, error: 'repeatProtected' });
    assert.equal(f.calls.length, 0);
  });
  it('removes selected descendants from duplicate roots and prevents lock, readonly and changed-selection bypasses', () => {
    const f = fixture(); f.a.type = 'group'; f.b.parentId = f.a.id;
    const options = { rows: 1, columns: 2, gapX: 0, gapY: 0 };
    f.b.isLocked = true;
    assert.deepEqual(repeatDrawingSelection(f.editor, options, [...f.selected()]), { ok: false, error: 'repeatProtected' });
    f.b.isLocked = false; f.state.isReadonly = true;
    assert.deepEqual(repeatDrawingSelection(f.editor, options, [...f.selected()]), { ok: false, error: 'repeatProtected' });
    f.state.isReadonly = false;
    assert.deepEqual(repeatDrawingSelection(f.editor, options, [f.a.id]), { ok: false, error: 'selectionChanged' });
    assert.equal(repeatDrawingSelection(f.editor, options, [...f.selected()]).ok, true);
    assert.deepEqual(f.calls.find(call => call[0] === 'duplicate')?.[1], [f.a.id]);
  });
  it('requests rollback on partial native duplication instead of claiming a complete grid', () => {
    const f = fixture(); f.state.failAt = 2;
    assert.deepEqual(repeatDrawingSelection(f.editor, { rows: 2, columns: 2, gapX: 4, gapY: 4 }, [...f.selected()]), { ok: false, error: 'changedFailed' });
    assert.equal(f.calls.filter(call => call[0] === 'rollback').length, 1);
    assert.deepEqual(f.calls.at(-1), ['camera', { x: 12, y: 15, z: 1 }]);
  });
});

describe('Drawing export resource bounds', () => {
  it('reads saved PNG dimensions instead of assuming requested browser resolution, and rejects malformed output', async () => {
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const header = new DataView(bytes.buffer);
    header.setUint32(8, 13); header.setUint32(12, 0x49484452);
    header.setUint32(16, 4096); header.setUint32(20, 2048);
    assert.deepEqual(await drawingPngSize(new Blob([bytes])), { width: 4096, height: 2048 });
    await assert.rejects(drawingPngSize(new Blob(['not a PNG'])), /Invalid PNG/);
    header.setUint32(16, 0);
    await assert.rejects(drawingPngSize(new Blob([bytes])), /Empty PNG/);
  });
  const options = { scope: 'selected' as const, scale: 1 as const, background: false, padding: 10 };
  it('computes actual PNG pixels for all supported scales and accounts for native 2x rasterization', () => {
    const f = fixture();
    for (const scale of [1, 2, 4] as const) {
      const plan = planDrawingExport(f.editor, 'png', { ...options, scale });
      assert.equal(plan.ok, true); if (!plan.ok) continue;
      assert.equal(plan.value.width, 220 * scale);
      assert.equal(plan.value.height, 70 * scale);
      assert.equal(plan.value.nativeScale, scale / 2);
    }
  });
  it('does not silently export the whole page when selection is empty and reports omitted non-artwork', () => {
    const f = fixture(); f.editor.setSelectedShapes([]);
    assert.deepEqual(planDrawingExport(f.editor, 'svg', options), { ok: false, error: 'exportEmpty' });
    f.a.type = 'order-details';
    const plan = planDrawingExport(f.editor, 'svg', { ...options, scope: 'all' });
    assert.equal(plan.ok, true); if (!plan.ok) return;
    assert.deepEqual(plan.value.ids, [f.b.id]); assert.equal(plan.value.omitted, 1);
  });
  it('rejects both excessive side lengths and aggregate pixels before native raster export', () => {
    const f = fixture(); f.a.bounds = { x: 0, y: 0, w: 9000, h: 100 };
    assert.deepEqual(planDrawingExport(f.editor, 'png', options), { ok: false, error: 'exportTooLarge' });
    f.a.bounds = { x: 0, y: 0, w: 6000, h: 6000 };
    assert.deepEqual(planDrawingExport(f.editor, 'png', options), { ok: false, error: 'exportTooLarge' });
    assert.equal(planDrawingExport(f.editor, 'svg', options).ok, true);
    assert.deepEqual(planDrawingExport(f.editor, 'png', { ...options, padding: NaN }), { ok: false, error: 'invalidOptions' });
    assert.equal(f.calls.length, 0);
  });
});
