import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createTLStore, defaultShapeUtils, HistoryManager } from '@tldraw/tldraw';
import { initializeDrawingDocument, DEFAULT_DRAWING_GRID_MM } from '../../src/lib/components/canvas/drawing-document-defaults';
import { CAD_META_KEY, DEFAULT_CAD_SETTINGS, canvasLengthToUnit, readCadSettings } from '../../src/lib/components/canvas/cad-settings';
import { drawingGridLevels } from '../../src/lib/components/canvas/drawing-grid-state';

function fixture(meta: Record<string, unknown> = {}) {
  const store = createTLStore({ shapeUtils: defaultShapeUtils });
  store.put([
    { id: 'document:document', typeName: 'document', name: 'Draft', gridSize: 10, meta: { keep: true } },
    { id: 'page:page', typeName: 'page', name: 'Page', index: 'a1', meta: { retained: true, ...meta } },
  ] as any);
  const history = new HistoryManager({ store });
  const state = { readonly: false, shapeCount: 0, pageCount: 1 };
  const editor: any = {
    store, getInstanceState: () => ({ isReadonly: state.readonly }),
    getCurrentPage: () => store.get('page:page' as any),
    getPages: () => Array.from({ length: state.pageCount }, () => editor.getCurrentPage()),
    getCurrentPageShapeIds: () => new Set(Array.from({ length: state.shapeCount }, (_, i) => `shape:${i}`)),
    getDocumentSettings: () => store.get('document:document' as any),
    updatePage: (patch: any) => store.put([{ ...editor.getCurrentPage(), ...patch }]),
    run: history.batch,
  };
  return { store, history, state, editor };
}

describe('Physical drawing defaults', () => {
  it('starts a blank document in mm with a 10 mm grid, without adding an undo step', () => {
    const f = fixture();
    try {
      assert.equal(initializeDrawingDocument(f.editor), true);
      assert.deepEqual(readCadSettings(f.editor), DEFAULT_CAD_SETTINGS);
      assert.equal(canvasLengthToUnit(f.editor.getDocumentSettings().gridSize, readCadSettings(f.editor)!), DEFAULT_DRAWING_GRID_MM);
      assert.equal(f.editor.getCurrentPage().meta.retained, true);
      assert.equal(f.editor.getDocumentSettings().meta.keep, true);
      const initialized = f.store.serialize();
      f.history.undo(); assert.deepEqual(f.store.serialize(), initialized);
      assert.equal(initializeDrawingDocument(f.editor), false, 'initialization must be idempotent');
      assert.deepEqual(f.store.serialize(), initialized);
    } finally { f.history.dispose(); }
  });

  it('never resets saved calibration, unknown metadata, artwork, multi-page, or read-only documents', () => {
    for (const reason of ['calibrated', 'unknown', 'artwork', 'multi-page', 'read-only']) {
      const meta = reason === 'calibrated' ? { [CAD_META_KEY]: { ...DEFAULT_CAD_SETTINGS, unit: 'in', scale: 8, originX: 57 } }
        : reason === 'unknown' ? { [CAD_META_KEY]: { version: 2 } } : {};
      const f = fixture(meta);
      try {
        if (reason === 'artwork') f.state.shapeCount = 1;
        if (reason === 'multi-page') f.state.pageCount = 2;
        if (reason === 'read-only') f.state.readonly = true;
        const before = f.store.serialize();
        assert.equal(initializeDrawingDocument(f.editor), false, reason);
        assert.deepEqual(f.store.serialize(), before, reason);
      } finally { f.history.dispose(); }
    }
  });

  it('keeps the grid visible at a full 6000 mm template overview without changing snap spacing', () => {
    const size = 10 / (25.4 / 96);
    const templateWidth = 2680 * 6000 / (1800 * (25.4 / 96));
    const zoom = 900 / templateWidth;
    const levels = drawingGridLevels(size, zoom);
    assert.equal(levels.length, 2);
    assert.ok(levels[0].spacing >= 12 && levels[0].spacing <= 60);
    assert.equal(levels[0].major, false);
    assert.equal(levels[1].major, true);
    for (const level of levels) {
      assert.equal(Number.isSafeInteger(level.step), true);
      assert.ok(Math.abs(level.spacing - level.step * size * zoom) < 1e-8);
      assert.ok(level.spacing > 0);
    }
    for (const z of [.00005, .0001, .0025, .025, .25, 1, 8]) {
      const result = drawingGridLevels(size, z);
      assert.equal(result.length, 2, `grid at zoom ${z}`);
      assert.ok(result[0].spacing >= 12, `no subpixel tiles at zoom ${z}`);
    }
    for (const invalid of [0, -1, NaN, Infinity]) {
      assert.deepEqual(drawingGridLevels(size, invalid), []);
      assert.deepEqual(drawingGridLevels(invalid, 1), []);
    }
  });
});
