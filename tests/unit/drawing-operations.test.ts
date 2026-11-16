import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { drawingObjectAlias, drawingObjectName, drawingPngSize, renameDrawingObject, repeatDrawingSelection, prepareRepeatGrid, applyRepeatGrid, planDrawingExport } from '../../src/lib/components/canvas/drawing-operations';

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
  const marks = new Map<string, { shapes: Array<[string, any]>; selected: string[] }>();
  const editor: any = {
    options: { maxShapesPerPage: 4000 }, getShape: (id: string) => shapes.get(id),
    getCurrentPageId: () => 'page:one', getCurrentPageShapesSorted: () => [...shapes.values()],
    getCurrentPageShapeIds: () => new Set(shapes.keys()), getShapeAndDescendantIds: related,
    getSelectedShapeIds: () => selected, getInstanceState: () => state,
    isShapeOrAncestorLocked: (idOrShape: any) => { let shape = typeof idOrShape === 'string' ? shapes.get(idOrShape) : idOrShape; while (shape) { if (shape.isLocked) return true; shape = shapes.get(shape.parentId); } return false; },
    getSelectionPageBounds: () => ({ x: 0, y: 0, w: 120, h: 50 }),
    getShapeMask: () => undefined, getShapePageTransform: () => ({ point: () => ({ x: 0, y: 0 }) }),
    getPointInParentSpace: (_shape: any, point: any) => point,
    getShapeMaskedPageBounds: (id: string) => shapes.get(id)?.bounds ?? { x: id === a.id ? 0 : 100, y: 0, w: 100, h: 50 },
    getCamera: () => ({ x: 12, y: 15, z: 1 }), setCamera: (value: any) => calls.push(['camera', value]),
    complete() {}, setCurrentTool() {},
    mark: (value: string) => { calls.push(['mark', value]); marks.set(value, { shapes: structuredClone([...shapes.entries()]), selected: [...selected] }); },
    bailToMark: (value: string) => { calls.push(['rollback', value]); const mark = marks.get(value)!; shapes.clear(); for (const [id, shape] of mark.shapes) shapes.set(id, shape); selected = mark.selected; },
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
    assert.deepEqual([...f.shapes.keys()], [f.a.id, f.b.id]);
    assert.deepEqual(f.selected(), [f.a.id, f.b.id]);
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

describe('Step and Repeat preview and apply', () => {
  const options = { rows: 2, columns: 2, gapX: 30, gapY: 40, spacing: 'offset' as const, directionX: -1 as const, directionY: -1 as const };
  it('previews explicit copy offsets in all directions without changing history or selection', () => {
    const f = fixture();
    const plan = prepareRepeatGrid(f.editor, options, [...f.selected()]);
    assert.equal(plan.ok, true); if (!plan.ok) return;
    assert.deepEqual(plan.value.offsets, [{ x: -30, y: -0 }, { x: -0, y: -40 }, { x: -30, y: -40 }]);
    assert.equal(plan.value.generated, 6);
    assert.equal(f.shapes.size, 2); assert.deepEqual(f.calls, []);
    assert.deepEqual(applyRepeatGrid(f.editor, plan.value), { ok: true, value: 6 });
    assert.equal(f.calls.filter(call => call[0] === 'mark').length, 2);
    assert.deepEqual(f.calls.filter(call => call[0] === 'duplicate').map(call => call[2]), plan.value.offsets);
  });
  it('invalidates reviewed geometry and selection and rechecks readonly and descendant locks', () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => { f.a.props.w = 200; },
      (f: ReturnType<typeof fixture>) => { f.editor.setSelectedShapes([f.a.id]); },
    ]) {
      const f = fixture(), plan = prepareRepeatGrid(f.editor, options, [...f.selected()]);
      assert.equal(plan.ok, true); if (!plan.ok) continue;
      change(f);
      assert.deepEqual(applyRepeatGrid(f.editor, plan.value), { ok: false, error: 'selectionChanged' });
      assert.deepEqual(f.calls, []);
    }
    const f = fixture(), plan = prepareRepeatGrid(f.editor, options, [...f.selected()]);
    assert.equal(plan.ok, true); if (!plan.ok) return;
    f.state.isReadonly = true;
    assert.deepEqual(applyRepeatGrid(f.editor, plan.value), { ok: false, error: 'repeatProtected' });
    assert.deepEqual(f.calls, []);
  });
  it('does not trust a cached plan if gesture completion changed the drawing', () => {
    const f = fixture(), plan = prepareRepeatGrid(f.editor, options, [...f.selected()]);
    assert.equal(plan.ok, true); if (!plan.ok) return;
    f.editor.complete = () => { f.a.x = 25; };
    assert.deepEqual(applyRepeatGrid(f.editor, plan.value), { ok: false, error: 'selectionChanged' });
    assert.deepEqual(f.calls, []);
  });
  it('enforces per-page and descendant object limits, supported artwork and save capacity during preview', () => {
    const f = fixture();
    f.editor.options.maxShapesPerPage = 7;
    assert.deepEqual(prepareRepeatGrid(f.editor, options, [...f.selected()]), { ok: false, error: 'repeatLimit' });
    f.editor.options.maxShapesPerPage = 4000;
    f.a.type = 'frame';
    assert.deepEqual(prepareRepeatGrid(f.editor, options, [...f.selected()]), { ok: false, error: 'repeatProtected' });
    f.a.type = 'geo';
    f.editor.getShapeMask = () => [{ x: 0, y: 0 }];
    assert.deepEqual(prepareRepeatGrid(f.editor, options, [...f.selected()]), { ok: false, error: 'repeatProtected' });
    f.editor.getShapeMask = () => undefined;
    f.editor.store = { getStoreSnapshot: () => ({ largeDocument: 'x'.repeat(1_850_000) }) };
    assert.deepEqual(prepareRepeatGrid(f.editor, options, [...f.selected()]), { ok: false, error: 'repeatLimit' });
    assert.deepEqual(f.calls, []);
  });
  it('rejects coincident offsets, negative copy distances and out-of-bounds coordinates', () => {
    const f = fixture();
    for (const update of [{ gapX: 0 }, { gapX: -1 }, { directionX: 0 }, { rows: 21 }])
      assert.deepEqual(prepareRepeatGrid(f.editor, { ...options, ...update } as any, [...f.selected()]), { ok: false, error: 'invalidOptions' });
    assert.deepEqual(prepareRepeatGrid(f.editor, { ...options, spacing: 'gap', gapX: -120 }, [...f.selected()]), { ok: false, error: 'invalidOptions' });
    f.editor.getPointInParentSpace = () => ({ x: 1_000_001, y: 0 });
    assert.deepEqual(prepareRepeatGrid(f.editor, options, [...f.selected()]), { ok: false, error: 'invalidOptions' });
    f.editor.getPointInParentSpace = (_shape: any, point: any) => point;
    f.editor.getSelectionPageBounds = () => ({ x: 1_000_000, y: 0, w: 120, h: 50 });
    assert.deepEqual(prepareRepeatGrid(f.editor, { ...options, directionX: 1 }, [...f.selected()]), { ok: false, error: 'invalidOptions' });
    assert.deepEqual(f.calls, []);
  });
  it('rolls back native copies if the saved document exceeds its payload bound', () => {
    const f = fixture();
    f.editor.store = { getStoreSnapshot: () => ({ document: 'x'.repeat(f.shapes.size > 2 ? 1_900_000 : 10) }) };
    const plan = prepareRepeatGrid(f.editor, options, [...f.selected()]);
    assert.equal(plan.ok, true); if (!plan.ok) return;
    assert.deepEqual(applyRepeatGrid(f.editor, plan.value), { ok: false, error: 'changedFailed' });
    assert.deepEqual([...f.shapes.keys()], [f.a.id, f.b.id]);
    assert.deepEqual(f.selected(), [f.a.id, f.b.id]);
    assert.equal(f.calls.filter(call => call[0] === 'rollback').length, 1);
  });
});

