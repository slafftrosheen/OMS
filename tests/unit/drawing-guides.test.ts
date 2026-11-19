import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createTLStore, defaultShapeUtils, HistoryManager } from '@tldraw/tldraw';
import { fixture } from '../helpers/cad-editor';
import { DEFAULT_CAD_SETTINGS, CAD_MAX_COORDINATE } from '../../src/lib/components/canvas/cad-settings';
import { hasCanvasDraft } from '../../src/lib/components/canvas/canvas-document';
import { CadPolylineTool } from '../../src/lib/components/canvas/CadPolylineTool';
import {
  DRAWING_GUIDES_META_KEY, MAX_DRAWING_GUIDES, DrawingGuideError, applyDrawingGuideChange,
  drawingGuidesAreValid, drawingGuidesBusy, drawingGuidesRevision, guidePositionFromUnit, guidePositionToUnit,
  nearestDrawingGuidePoint, prepareDrawingGuideChange, readDrawingGuides, selectedDrawingGuide,
  selectDrawingGuide, validateDrawingGuides, type DrawingGuide, type DrawingGuideChange,
} from '../../src/lib/components/canvas/drawing-guides';

const guide = (id = 'guide:one', axis: 'x' | 'y' = 'x', position = 100): DrawingGuide => ({ id, axis, position, visible: true, locked: false });
const state = (...guides: DrawingGuide[]) => ({ version: 1 as const, visible: true, locked: false, guides });
const put = (editor: any, value: unknown) => editor.updatePage({ meta: { ...editor.getCurrentPage().meta, [DRAWING_GUIDES_META_KEY]: value } });
const change = (editor: any, operation: DrawingGuideChange) => applyDrawingGuideChange(editor, prepareDrawingGuideChange(editor, operation));
const error = (code: string) => (value: unknown) => value instanceof DrawingGuideError && value.code === code;
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

describe('per-page document guideline data', () => {
  it('reads an empty older drawing without a migration and returns independent data', () => {
    const f = fixture(), before = structuredClone(f.editor.getCurrentPage());
    assert.equal(drawingGuidesAreValid(f.editor), true);
    const empty = readDrawingGuides(f.editor); assert.deepEqual(empty, state());
    empty.guides.push(guide()); assert.deepEqual(readDrawingGuides(f.editor), state());
    assert.deepEqual(f.editor.getCurrentPage(), before); assert.equal(f.marks.length, 0);
    put(f.editor, state(guide()));
    const result = readDrawingGuides(f.editor); result.guides[0].position = 900;
    assert.equal(readDrawingGuides(f.editor).guides[0].position, 100);
  });

  it('refuses malformed or future metadata without rewriting it as an empty collection', () => {
    const bad: unknown[] = [null, [], true, 'guides', { ...state(), version: 2 }, { ...state(), visible: 1 },
      { ...state(), locked: 'yes' }, { ...state(), guides: {} }, state(guide(), guide()),
      state({ ...guide(), id: 'shape:artwork' }), state({ ...guide(), id: 'guide:' }),
      state({ ...guide(), id: 'guide:' + 'x'.repeat(81) }), state({ ...guide(), axis: 'z' } as any),
      state({ ...guide(), position: NaN }), state({ ...guide(), position: Infinity }),
      state({ ...guide(), position: CAD_MAX_COORDINATE + 1 }), state({ ...guide(), visible: undefined } as any),
      state({ ...guide(), locked: null } as any), state(...Array.from({ length: MAX_DRAWING_GUIDES + 1 }, (_, i) => guide(`guide:${i}`)))];
    for (const metadata of bad) {
      const f = fixture(); put(f.editor, metadata); const before = f.editor.getCurrentPage();
      assert.equal(validateDrawingGuides(metadata), null);
      assert.equal(drawingGuidesAreValid(f.editor), false); assert.deepEqual(readDrawingGuides(f.editor), state());
      assert.throws(() => prepareDrawingGuideChange(f.editor, { kind: 'add', axis: 'x', position: 0 }), error('corrupt'));
      assert.equal(f.editor.getCurrentPage(), before); assert.equal(f.marks.length, 0);
    }
  });

  it('round-trips physical positions with scale and shifted upward Y, without changing geometry', () => {
    const settings = { ...DEFAULT_CAD_SETTINGS, originX: 125, originY: 800, scale: 2 };
    close(guidePositionFromUnit('x', 25.4, settings), 173);
    close(guidePositionFromUnit('y', 25.4, settings), 752);
    close(guidePositionToUnit('x', 173, settings), 25.4);
    close(guidePositionToUnit('y', 752, settings), 25.4);
    for (const unit of ['mm', 'cm', 'm', 'in'] as const) for (const axis of ['x', 'y'] as const) {
      const calibrated = { ...settings, unit };
      for (const coordinate of [-1000, 0, 42.75, 800]) close(guidePositionFromUnit(axis, guidePositionToUnit(axis, coordinate, calibrated), calibrated), coordinate);
    }
    close(guidePositionToUnit('x', 173, { ...settings, unit: 'in' }), 1);
    close(guidePositionToUnit('y', 752, { ...settings, originY: 848, unit: 'in' }), 2);
    assert.equal(guidePositionFromUnit('y', 75, null), 75); assert.equal(guidePositionToUnit('y', 75, null), 75);
    const f = fixture(); put(f.editor, state(guide('guide:x', 'x', 173), guide('guide:y', 'y', 752)));
    const before = readDrawingGuides(f.editor);
    f.editor.updatePage({ meta: { ...f.editor.getCurrentPage().meta, omsCad: { ...settings, unit: 'm', originX: 10 } } });
    assert.deepEqual(readDrawingGuides(f.editor), before);
  });

  it('keeps shared guide selection per editor and page, and does not persist it', () => {
    const f = fixture(); put(f.editor, state(guide('guide:a')));
    assert.equal(selectDrawingGuide(f.editor, 'guide:missing'), false);
    assert.equal(selectedDrawingGuide(f.editor).get(), null);
    assert.equal(selectDrawingGuide(f.editor, 'guide:a'), true);
    const pageA = structuredClone(f.editor.getCurrentPage());
    f.editor.updatePage({ id: 'page:two', meta: { omsGuides: state(guide('guide:b')) } });
    assert.equal(selectedDrawingGuide(f.editor).get(), null);
    assert.equal(selectDrawingGuide(f.editor, 'guide:b'), true);
    const pageB = structuredClone(f.editor.getCurrentPage());
    f.editor.updatePage(pageA); assert.equal(selectedDrawingGuide(f.editor).get(), 'guide:a');
    f.editor.updatePage(pageB); assert.equal(selectedDrawingGuide(f.editor).get(), 'guide:b');
    assert.equal(selectDrawingGuide(f.editor, null), true); assert.equal(selectedDrawingGuide(f.editor).get(), null);
    const other = fixture(); put(other.editor, state(guide('guide:a'))); assert.equal(selectedDrawingGuide(other.editor).get(), null);
    assert.deepEqual(pageA.meta.omsGuides, state(guide('guide:a'))); assert.equal(f.marks.length, 0);
  });
});

describe('guarded document guideline transactions', () => {
  it('keeps guide writes outside an unfinished CAD draft rollback while allowing its idle tool', () => {
    const f = fixture(); put(f.editor, state(guide())); f.state.tool = 'cad-polyline';
    const tool = new CadPolylineTool(f.editor, undefined as any); tool.onEnter();
    assert.equal(hasCanvasDraft(f.editor), false); assert.equal(drawingGuidesBusy(f.editor), false);
    const plan = prepareDrawingGuideChange(f.editor, { kind: 'add', id: 'guide:after', axis: 'y', position: 50 });
    f.editor.inputs.currentPagePoint = { x: 10, y: 10 }; tool.onPointerDown({ button: 0 } as any);
    assert.equal(hasCanvasDraft(f.editor), true); assert.equal(drawingGuidesBusy(f.editor), true); assert.equal(f.shapes.size, 1);
    const marks = f.marks.length;
    assert.throws(() => prepareDrawingGuideChange(f.editor, { kind: 'settings', visible: false }), error('busy'));
    assert.equal(applyDrawingGuideChange(f.editor, plan), false); assert.equal(f.marks.length, marks);
    tool.onCancel(); assert.equal(hasCanvasDraft(f.editor), false); assert.equal(f.shapes.size, 0);
    assert.deepEqual(readDrawingGuides(f.editor), state(guide()));
    assert.equal(applyDrawingGuideChange(f.editor, plan), true); assert.equal(readDrawingGuides(f.editor).guides.length, 2);
    f.state.tool = 'cad-polyline'; tool.onEnter(); tool.onPointerDown({ button: 0 } as any); tool.onCancel();
    assert.equal(readDrawingGuides(f.editor).guides.length, 2, 'later CAD cancellation cannot erase the committed guide');
    assert.equal(f.marks.length, 2);
  });

  it('blocks pending native pointer gestures before metadata edits and allows idle CAD tools', () => {
    const f = fixture(); put(f.editor, state(guide()));
    const plan = prepareDrawingGuideChange(f.editor, { kind: 'move', id: 'guide:one', position: 200 });
    f.editor.getPath = () => 'select.translating'; f.editor.inputs.isDragging = true;
    assert.equal(drawingGuidesBusy(f.editor), true); assert.equal(applyDrawingGuideChange(f.editor, plan), false);
    f.editor.inputs.isDragging = false; f.editor.inputs.isPointing = true;
    assert.equal(drawingGuidesBusy(f.editor), true); assert.equal(applyDrawingGuideChange(f.editor, plan), false);
    f.editor.inputs.isPointing = false; f.editor.getPath = () => 'cad-circle';
    assert.equal(drawingGuidesBusy(f.editor), false); assert.equal(applyDrawingGuideChange(f.editor, plan), true);
    assert.equal(f.marks.length, 2);
  });

  it('adds, moves and deletes only page metadata, with explicit history boundaries', () => {
    const f = fixture(); f.state.tool = 'cad-polyline';
    f.editor.createShape({ id: 'shape:art', type: 'cad-path', props: { points: [{ x: 0, y: 0 }, { x: 100, y: 30 }] } });
    f.editor.setSelectedShapes(['shape:art']);
    const art = structuredClone([...f.shapes.values()]);
    const document = { ...DEFAULT_CAD_SETTINGS, originX: 25, originY: 500 };
    f.editor.updatePage({ meta: { retained: 'metadata', omsCad: document, omsCadSnap: { endpoints: false }, profile: { reference: 'unchanged' } } });
    const plan = prepareDrawingGuideChange(f.editor, { kind: 'add', axis: 'y', position: 40 });
    assert.equal(f.marks.length, 0); assert.equal(readDrawingGuides(f.editor).guides.length, 0);
    assert.equal(applyDrawingGuideChange(f.editor, plan), true);
    const id = readDrawingGuides(f.editor).guides[0].id;
    assert.match(id, /^guide:/); assert.equal(selectedDrawingGuide(f.editor).get(), id);
    assert.equal(f.marks.length, 2); assert.equal(change(f.editor, { kind: 'move', id, position: -250 }), true);
    assert.equal(readDrawingGuides(f.editor).guides[0].position, -250); assert.equal(f.marks.length, 4);
    assert.equal(change(f.editor, { kind: 'remove', ids: [id] }), true); assert.deepEqual(readDrawingGuides(f.editor), state());
    assert.equal(selectedDrawingGuide(f.editor).get(), null); assert.equal(f.marks.length, 6);
    assert.deepEqual([...f.shapes.values()], art); assert.deepEqual(f.editor.getSelectedShapeIds(), ['shape:art']);
    assert.equal(f.state.tool, 'cad-polyline');
    assert.deepEqual(f.editor.getCurrentPage().meta, { retained: 'metadata', omsCad: document, omsCadSnap: { endpoints: false }, profile: { reference: 'unchanged' }, omsGuides: state() });
  });

  it('reveals hidden guidelines when adding and leaves pre-existing per-guide visibility alone', () => {
    const f = fixture(); put(f.editor, { ...state({ ...guide(), visible: false }), visible: false });
    assert.equal(change(f.editor, { kind: 'add', id: 'guide:added', axis: 'y', position: 25 }), true);
    const saved = readDrawingGuides(f.editor); assert.equal(saved.visible, true);
    assert.equal(saved.guides[0].visible, false); assert.deepEqual(saved.guides[1], guide('guide:added', 'y', 25));
    assert.equal(f.marks.length, 2);
  });

  it('does not consume an Undo entry for a no-op', () => {
    const f = fixture();
    assert.equal(change(f.editor, { kind: 'settings', visible: true, locked: false }), true);
    assert.equal(f.editor.getCurrentPage().meta.omsGuides, undefined); assert.equal(f.marks.length, 0);
    put(f.editor, state(guide()));
    for (const operation of [{ kind: 'move', id: 'guide:one', position: 100 }, { kind: 'guide-visible', id: 'guide:one', visible: true },
      { kind: 'guide-locked', id: 'guide:one', locked: false }] as DrawingGuideChange[]) assert.equal(change(f.editor, operation), true);
    assert.equal(f.marks.length, 0);
  });

  it('rejects invalid positions, invalid IDs and duplicate or partial deletions before history', () => {
    const f = fixture(); put(f.editor, state(guide()));
    for (const operation of [
      { kind: 'add', axis: 'x', position: NaN }, { kind: 'add', axis: 'x', position: Infinity },
      { kind: 'add', axis: 'x', position: CAD_MAX_COORDINATE + 0.1 }, { kind: 'add', axis: 'x', position: 0, id: 'guide:one' },
      { kind: 'add', axis: 'z', position: 0 }, { kind: 'add', axis: 'x', position: 0, id: 'bad' },
      { kind: 'move', id: 'guide:one', position: -Infinity }, { kind: 'remove', ids: [] },
      { kind: 'remove', ids: ['guide:one', 'guide:one'] }, { kind: 'settings' }, { kind: 'settings', visible: 'false' },
      { kind: 'settings', visible: true, extra: true }, { kind: 'guide-locked', id: 'guide:one', locked: 'yes' },
      { kind: 'guide-visible', id: 'guide:one', visible: null }, { kind: 'unknown' }, null,
    ]) assert.throws(() => prepareDrawingGuideChange(f.editor, operation as any), error('invalid'));
    assert.throws(() => prepareDrawingGuideChange(f.editor, { kind: 'remove', ids: ['guide:one', 'guide:missing'] }), error('missing'));
    assert.throws(() => prepareDrawingGuideChange(f.editor, { kind: 'move', id: 'guide:missing', position: 0 }), error('missing'));
    assert.deepEqual(readDrawingGuides(f.editor), state(guide())); assert.equal(f.marks.length, 0);
  });

  it('respects individual and global locks while still allowing their controls to unlock or hide', () => {
    const f = fixture(); put(f.editor, state({ ...guide(), locked: true }, guide('guide:two', 'y', 25)));
    for (const operation of [{ kind: 'move', id: 'guide:one', position: 101 }, { kind: 'remove', ids: ['guide:two', 'guide:one'] }] as DrawingGuideChange[]) {
      assert.throws(() => prepareDrawingGuideChange(f.editor, operation), error('locked'));
    }
    assert.equal(f.marks.length, 0);
    assert.equal(change(f.editor, { kind: 'guide-visible', id: 'guide:one', visible: false }), true);
    assert.equal(change(f.editor, { kind: 'settings', locked: true }), true);
    for (const operation of [{ kind: 'move', id: 'guide:two', position: 1 }, { kind: 'remove', ids: ['guide:two'] }, { kind: 'add', axis: 'x', position: 1 }] as DrawingGuideChange[]) {
      assert.throws(() => prepareDrawingGuideChange(f.editor, operation), error('locked'));
    }
    assert.equal(change(f.editor, { kind: 'guide-locked', id: 'guide:one', locked: false }), true);
    assert.equal(change(f.editor, { kind: 'settings', visible: false, locked: false }), true);
    assert.equal(change(f.editor, { kind: 'move', id: 'guide:one', position: 101 }), true);
    assert.equal(readDrawingGuides(f.editor).guides[0].visible, false); assert.equal(readDrawingGuides(f.editor).visible, false);
  });

  it('rejects readonly changes at preparation, application and the transaction boundary', () => {
    const f = fixture(); put(f.editor, state(guide()));
    const plan = prepareDrawingGuideChange(f.editor, { kind: 'move', id: 'guide:one', position: 200 });
    f.state.isReadonly = true;
    assert.throws(() => prepareDrawingGuideChange(f.editor, { kind: 'settings', visible: false }), error('readonly'));
    assert.equal(applyDrawingGuideChange(f.editor, plan), false); assert.equal(f.marks.length, 0);
    f.state.isReadonly = false;
    f.editor.run = (callback: () => void) => { f.state.isReadonly = true; callback(); };
    assert.equal(applyDrawingGuideChange(f.editor, plan), false);
    assert.deepEqual(readDrawingGuides(f.editor), state(guide())); assert.equal(f.marks.length, 0);
  });

  it('rejects stale page, guide and calibration revisions without marking history', () => {
    for (const update of [
      (f: ReturnType<typeof fixture>) => put(f.editor, state(guide('guide:one', 'x', 300))),
      (f: ReturnType<typeof fixture>) => f.editor.updatePage({ meta: { ...f.editor.getCurrentPage().meta, omsCad: DEFAULT_CAD_SETTINGS } }),
      (f: ReturnType<typeof fixture>) => f.editor.updatePage({ id: 'page:two' }),
      (f: ReturnType<typeof fixture>) => put(f.editor, { ...state(guide()), locked: true }),
    ]) {
      const f = fixture(); put(f.editor, state(guide()));
      const revision = drawingGuidesRevision(f.editor), plan = prepareDrawingGuideChange(f.editor, { kind: 'move', id: 'guide:one', position: 200 }, revision);
      update(f); const changed = structuredClone(f.editor.getCurrentPage());
      assert.equal(applyDrawingGuideChange(f.editor, plan), false);
      assert.throws(() => prepareDrawingGuideChange(f.editor, { kind: 'move', id: 'guide:one', position: 200 }, revision), error('stale'));
      assert.deepEqual(f.editor.getCurrentPage(), changed); assert.equal(f.marks.length, 0);
    }
  });

  it('merges unrelated page edits made after preparation and ignores caller-supplied next state', () => {
    const f = fixture(); put(f.editor, state(guide()));
    const plan = prepareDrawingGuideChange(f.editor, { kind: 'move', id: 'guide:one', position: 200 });
    plan.next.guides[0].position = 900;
    f.editor.updatePage({ meta: { ...f.editor.getCurrentPage().meta, otherFeature: { version: 4 }, retained: 'new value' } });
    assert.equal(applyDrawingGuideChange(f.editor, plan), true);
    assert.equal(readDrawingGuides(f.editor).guides[0].position, 200);
    assert.deepEqual(f.editor.getCurrentPage().meta.otherFeature, { version: 4 }); assert.equal(f.editor.getCurrentPage().meta.retained, 'new value');
  });

  it('rolls back refused, partial and throwing writes and keeps the guide selection', () => {
    for (const mode of ['refuse', 'partial', 'throw'] as const) {
      const f = fixture(); put(f.editor, state(guide())); selectDrawingGuide(f.editor, 'guide:one');
      const updatePage = f.editor.updatePage;
      f.editor.updatePage = (value: any) => {
        if (mode !== 'refuse') updatePage({ ...value, meta: { ...value.meta, omsGuides: state() } });
        if (mode === 'throw') throw new Error('failed');
      };
      const plan = prepareDrawingGuideChange(f.editor, { kind: 'move', id: 'guide:one', position: 200 });
      assert.equal(applyDrawingGuideChange(f.editor, plan), false);
      assert.deepEqual(readDrawingGuides(f.editor), state(guide())); assert.equal(f.editor.getCurrentPage().meta.retained, 'metadata');
      assert.equal(selectedDrawingGuide(f.editor).get(), 'guide:one'); assert.equal(f.marks.length, 0);
    }
  });

  it('bounds metadata and snapshot growth while allowing oversized drawings to remove guides', () => {
    const f = fixture(); put(f.editor, state(...Array.from({ length: MAX_DRAWING_GUIDES }, (_, i) => guide(`guide:${i}`))));
    assert.throws(() => prepareDrawingGuideChange(f.editor, { kind: 'add', axis: 'x', position: 0 }), error('limit'));
    put(f.editor, state(guide()));
    f.editor.store = { getStoreSnapshot: () => ({ padding: 'x'.repeat(1_900_000) }) };
    assert.throws(() => prepareDrawingGuideChange(f.editor, { kind: 'add', axis: 'x', position: 0 }), error('saveLimit'));
    assert.throws(() => prepareDrawingGuideChange(f.editor, { kind: 'move', id: 'guide:one', position: 100_000 }), error('saveLimit'));
    assert.equal(change(f.editor, { kind: 'settings', visible: false }), true);
    assert.equal(change(f.editor, { kind: 'remove', ids: ['guide:one'] }), true);
    assert.equal(readDrawingGuides(f.editor).guides.length, 0);
  });

  it('persists across real-store reloads and undoes each change once, including auto-reveal', () => {
    const store = createTLStore({ shapeUtils: defaultShapeUtils });
    store.put([
      { id: 'document:document', typeName: 'document', name: 'Guidelines', gridSize: 10, meta: {} },
      { id: 'page:one', typeName: 'page', name: 'First', index: 'a1', meta: { keep: 'first', omsGuides: { ...state(guide()), visible: false } } },
      { id: 'page:two', typeName: 'page', name: 'Second', index: 'a2', meta: { keep: 'second' } },
    ] as any);
    const history = new HistoryManager({ store }); let pageId = 'page:one';
    const editor: any = { store, getInstanceState: () => ({ isReadonly: false }), getCurrentPageId: () => pageId,
      getCurrentPage: () => store.get(pageId as any), updatePage: (patch: any) => store.put([{ ...store.get(patch.id), ...patch }]),
      run: history.batch, mark: history.mark.bind(history), bailToMark: history.bailToMark };
    try {
      const before = JSON.parse(JSON.stringify(store.serialize()));
      assert.equal(change(editor, { kind: 'add', id: 'guide:second', axis: 'y', position: 42 }), true);
      assert.equal(readDrawingGuides(editor).visible, true); assert.equal(readDrawingGuides(editor).guides.length, 2);
      history.undo(); assert.deepEqual(JSON.parse(JSON.stringify(store.serialize())), before);
      history.redo(); assert.equal(readDrawingGuides(editor).guides[1].position, 42);
      assert.equal(change(editor, { kind: 'move', id: 'guide:second', position: -20 }), true);
      history.undo(); assert.equal(readDrawingGuides(editor).guides[1].position, 42);
      history.redo(); assert.equal(readDrawingGuides(editor).guides[1].position, -20);
      assert.equal(change(editor, { kind: 'guide-locked', id: 'guide:second', locked: true }), true);
      history.undo(); assert.equal(readDrawingGuides(editor).guides[1].locked, false);
      history.redo(); assert.equal(readDrawingGuides(editor).guides[1].locked, true);
      assert.equal(change(editor, { kind: 'settings', visible: false, locked: true }), true);
      history.undo(); assert.equal(readDrawingGuides(editor).visible, true); assert.equal(readDrawingGuides(editor).locked, false);
      history.redo(); assert.equal(readDrawingGuides(editor).visible, false); assert.equal(readDrawingGuides(editor).locked, true);
      pageId = 'page:two'; assert.deepEqual(readDrawingGuides(editor), state());
      assert.equal(change(editor, { kind: 'add', id: 'guide:page-two', axis: 'x', position: 750 }), true);
      assert.equal(readDrawingGuides(editor).guides[0].id, 'guide:page-two');
      pageId = 'page:one'; assert.equal(readDrawingGuides(editor).guides.length, 2);
      const saved = JSON.parse(JSON.stringify(store.serialize()));
      assert.equal(Object.keys(saved).filter(id => id.startsWith('shape:')).length, 0);
      assert.equal(saved['page:one'].meta.keep, 'first'); assert.equal(saved['page:two'].meta.keep, 'second');
      const restored = createTLStore({ shapeUtils: defaultShapeUtils }); restored.put(Object.values(saved) as any);
      const restoredEditor: any = { getCurrentPage: () => restored.get('page:one' as any) };
      assert.deepEqual(readDrawingGuides(restoredEditor), readDrawingGuides(editor));
      assert.equal(selectDrawingGuide(editor, 'guide:one'), true);
      assert.equal(saved['page:one'].meta.selectedGuide, undefined);
    } finally { history.dispose(); }
  });
});

describe('bounded guideline snap geometry', () => {
  it('projects to each line and acquires a crossing only within the circular tolerance', () => {
    const guides = state(guide('guide:x', 'x', 10), guide('guide:y', 'y', 20));
    assert.deepEqual(nearestDrawingGuidePoint(guides, { x: 12, y: 300 }, 8), { x: 10, y: 300 });
    assert.deepEqual(nearestDrawingGuidePoint(guides, { x: -300, y: 17 }, 8), { x: -300, y: 20 });
    assert.deepEqual(nearestDrawingGuidePoint(guides, { x: 13, y: 24 }, 8), { x: 10, y: 20 });
    assert.deepEqual(nearestDrawingGuidePoint(guides, { x: 16, y: 27 }, 8), { x: 10, y: 27 });
    assert.deepEqual(nearestDrawingGuidePoint(guides, { x: 17, y: 26 }, 8), { x: 17, y: 20 });
    assert.equal(nearestDrawingGuidePoint(guides, { x: 50, y: 60 }, 8), null);
  });

  it('chooses the closest parallel guide and rejects invalid queries within bounded work', () => {
    const guides = state(guide('guide:one', 'x', 8), guide('guide:two', 'x', 12), guide('guide:three', 'x', 14));
    assert.deepEqual(nearestDrawingGuidePoint(guides, { x: 13.5, y: 0 }, 8), { x: 14, y: 0 });
    for (const tolerance of [0, -1, NaN, Infinity]) assert.equal(nearestDrawingGuidePoint(guides, { x: 10, y: 10 }, tolerance), null);
    for (const point of [{ x: NaN, y: 0 }, { x: 0, y: Infinity }, { x: CAD_MAX_COORDINATE + 1, y: 0 }]) assert.equal(nearestDrawingGuidePoint(guides, point, 8), null);
    const many = state(...Array.from({ length: MAX_DRAWING_GUIDES }, (_, i) => guide(`guide:${i}`, 'x', 1000 + i)), guide('guide:beyond-budget', 'x', 1));
    assert.equal(nearestDrawingGuidePoint(many, { x: 0, y: 0 }, 8), null);
  });
});
