import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`);
function environment() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window; win.fetch = globalThis.fetch.bind(globalThis);
  const media = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  win.matchMedia = media;
  const values: Record<string, unknown> = { matchMedia: media, getComputedStyle: win.getComputedStyle.bind(win),
    requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  for (const key of ['window', 'document', 'navigator', 'self', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement',
    'HTMLSelectElement', 'SVGElement', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'DOMRect', 'MutationObserver', 'Image', 'localStorage']) {
    values[key] = key === 'window' || key === 'self' ? win : win[key];
  }
  win.HTMLElement.prototype.setPointerCapture = () => {}; win.HTMLElement.prototype.releasePointerCapture = () => {};
  win.HTMLElement.prototype.hasPointerCapture = () => false; win.HTMLImageElement.prototype.decode = async () => {};
  // Native long-press uses window timers; canceling them must use that timer
  // namespace while the test runner keeps its Node timer handles.
  const clearNodeTimeout = globalThis.clearTimeout, clearNodeInterval = globalThis.clearInterval;
  values.clearTimeout = (id: any) => typeof id === 'number' ? win.clearTimeout(id) : clearNodeTimeout(id);
  values.clearInterval = (id: any) => typeof id === 'number' ? win.clearInterval(id) : clearNodeInterval(id);
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  return { win, restore() { dom.window.close(); for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  } } };
}

/** Real pinned Editor, Store, native translating state, side effects, Alt-copy
 * and HistoryManager. Only DOM measurement is provided by jsdom. */
async function harness(run: (h: any) => Promise<void>) {
  const env = environment(), tl = await import('@tldraw/tldraw');
  const snapping = await import('../../src/lib/components/canvas/drawing-pick-guide-snap');
  const guides = await import('../../src/lib/components/canvas/drawing-guides');
  const snaps = await import('../../src/lib/components/canvas/cad-snap-settings');
  const cad = await import('../../src/lib/components/canvas/cad-settings');
  const { CadPathShapeUtil, CadEllipseShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadShapes');
  const { CadBezierShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadBezierShape');
  const { getCadSelectionPageBounds } = await import('../../src/lib/components/canvas/cad-bounds');
  const { nodeAt } = await import('../../src/lib/components/canvas/cad-curves');
  class Form extends tl.BaseBoxShapeUtil<any> {
    static override type = 'order-details'; static override props = { w: tl.T.number, h: tl.T.number };
    getDefaultProps() { return { w: 80, h: 40 }; } component() { return null; } indicator() { return null; }
  }
  const container = document.createElement('div'); document.body.append(container);
  const rect = env.win.DOMRect.fromRect({ x: 120, y: 80, width: 1000, height: 800 }); container.getBoundingClientRect = () => rect;
  const shapeUtils = [...tl.defaultShapeUtils, CadPathShapeUtil, CadEllipseShapeUtil, CadBezierShapeUtil, Form];
  const editor = new tl.Editor({ store: tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }),
    shapeUtils, bindingUtils: tl.defaultBindingUtils, tools: [...tl.defaultTools, ...tl.defaultShapeTools], getContainer: () => container, initialState: 'select' });
  editor.updateViewportScreenBounds(new tl.Box(rect.x, rect.y, rect.width, rect.height)); editor.updateInstanceState({ isFocused: true });
  editor.user.updateUserPreferences({ isSnapMode: true });
  const dispose = snapping.installDrawingPickGuideSnapping(editor);
  const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
  const pointer = async (name: string, page: { x: number; y: number }, extra = {}) => {
    const point = editor.pageToScreen(page);
    editor.dispatch({ type: 'pointer', name, point: { ...point, z: .5 }, target: 'canvas', button: 0, pointerId: 1, isPen: false,
      shiftKey: false, ctrlKey: false, altKey: false, ...extra } as any); await tick();
  };
  const key = async (name: 'key_down' | 'key_up', key: 'Alt' | 'Control' | 'Shift', extra = {}) => {
    editor.dispatch({ type: 'keyboard', name, key, code: `${key}Left`, shiftKey: false, ctrlKey: false, altKey: false, ...extra }); await tick(name === 'key_up' ? 190 : 30);
  };
  const add = (id = 'shape:art', x = 100, y = 100, w = 80, h = 40) => {
    editor.createShape({ id: id as any, type: 'geo', x, y, props: { geo: 'rectangle', w, h, fill: 'solid', dash: 'solid', size: 's' } }); return id;
  };
  const addGroup = () => {
    editor.createShapes([{ id: 'shape:group' as any, type: 'group', x: 100, y: 100 },
      ...[0, 120, 240].map((x, i) => ({ id: `shape:child-${i}` as any, type: 'geo' as const, parentId: 'shape:group' as any, x, y: 0, props: { w: 80, h: 40 } }))]);
    return 'shape:group';
  };
  const addGuide = (axis: 'x' | 'y', position: number, id = `guide:${axis}`) =>
    assert.equal(guides.applyDrawingGuideChange(editor, guides.prepareDrawingGuideChange(editor, { kind: 'add', axis, position, id })), true);
  const ready = (...ids: string[]) => { editor.select(...ids as any); editor.mark('pick-guide-ready'); };
  const down = async (page: { x: number; y: number }, extra = {}) => { await pointer('pointer_down', page, { target: 'selection', handle: 'background', ...extra }); await tick(150); };
  const move = async (page: { x: number; y: number }, extra = {}) => {
    await pointer('pointer_move', page, extra); await tick(150); await pointer('pointer_move', page, extra);
  };
  const up = (page: { x: number; y: number }, extra = {}) => pointer('pointer_up', page, extra);
  const snapshot = () => structuredClone(editor.store.getStoreSnapshot('document'));
  try { await run({ env, editor, tl, snapping, guides, snaps, cad, nodeAt, add, addGroup, addGuide, ready, down, move, up, pointer, key, tick, snapshot,
    bounds: () => getCadSelectionPageBounds(editor), dispose }); }
  finally { dispose(); editor.dispose(); container.remove(); env.restore(); }
}

describe('ordinary Pick guideline snapping through native public hooks', () => {
  for (const duplicate of [false, true]) it(`acquires the exact fast release${duplicate ? ' on native Alt copies' : ''} before the same Undo completes`, async () => {
    await harness(async ({ editor, add, addGuide, ready, down, snapshot, tick }) => {
      const id = add(); addGuide('x', 300); addGuide('y', 500); ready(id); const before = snapshot();
      await down({ x: 110, y: 110 }, { altKey: duplicate });
      editor.inputs.pointerVelocity.set(10, 10);
      const point = editor.pageToScreen({ x: 313, y: 514 });
      for (const name of ['pointer_move', 'pointer_up']) editor.dispatch({ type: 'pointer', name, point: { ...point, z: .5 }, target: 'canvas', button: 0,
        pointerId: 1, isPen: false, shiftKey: false, ctrlKey: false, altKey: duplicate });
      await tick(); const shape = editor.getOnlySelectedShape(); near(shape.x, 300); near(shape.y, 500); assert.equal(editor.getPath(), 'select.idle');
      if (duplicate) { assert.notEqual(shape.id, id); near(editor.getInstanceState().duplicateProps.offset.x, 200); near(editor.getInstanceState().duplicateProps.offset.y, 400); }
      const after = snapshot(); editor.undo(); assert.deepEqual(snapshot(), before); editor.redo(); assert.deepEqual(snapshot(), after);
    });
  });

  it('acquires a stationary pointer after native updateShapes skips an unchanged record', async () => {
    await harness(async ({ editor, snapping, add, addGuide, ready, down, pointer, tick, up, snapshot }) => {
      const id = add(); addGuide('x', 300); ready(id); const before = snapshot(); await down({ x: 110, y: 110 });
      editor.inputs.pointerVelocity.set(20, 20);
      await pointer('pointer_move', { x: 313, y: 370 }); near(editor.getShape(id).x, 303);
      await tick(300); near(editor.getShape(id).x, 300); assert.equal(snapping.drawingPickGuideSnap(editor).get()?.guides[0].id, 'guide:x');
      await up({ x: 313, y: 370 }); near(editor.getShape(id).x, 300);
      const after = snapshot(); editor.undo(); assert.deepEqual(snapshot(), before); editor.redo(); assert.deepEqual(snapshot(), after);
    });
  });

  it('snaps a moving selection to two guides and keeps one native Undo/Redo without helper records', async () => {
    await harness(async ({ editor, snapping, add, addGuide, ready, down, move, up, snapshot }) => {
      const id = add(); addGuide('x', 300); addGuide('y', 300); ready(id); const before = snapshot();
      await down({ x: 110, y: 110 }); await move({ x: 313, y: 314 });
      assert.equal(editor.getPath(), 'select.translating'); near(editor.getShape(id).x, 300); near(editor.getShape(id).y, 300);
      assert.deepEqual(snapping.drawingPickGuideSnap(editor).get()?.guides.map((g: any) => [g.id, g.anchor]), [['guide:x', 'start'], ['guide:y', 'start']]);
      await up({ x: 313, y: 314 }); near(editor.getShape(id).x, 300); near(editor.getShape(id).y, 300);
      assert.equal(editor.getCurrentPageShapeIds().size, 1); assert.equal(snapping.drawingPickGuideSnap(editor).get(), null);
      const after = snapshot(); editor.undo(); assert.deepEqual(snapshot(), before); editor.redo(); assert.deepEqual(snapshot(), after);
    });
  });

  for (const [anchor, guide, raw, expected] of [['center', 350, 307, 310], ['end', 400, 323, 320]] as const) {
    it(`acquires the ${anchor} anchor of the selection bounds`, async () => {
      await harness(async ({ editor, snapping, add, addGuide, ready, down, move, up }) => {
        const id = add(); addGuide('x', guide); ready(id);
        await down({ x: 110, y: 110 }); await move({ x: raw + 10, y: 370 });
        near(editor.getShape(id).x, expected); assert.equal(snapping.drawingPickGuideSnap(editor).get()?.guides[0].anchor, anchor);
        await up({ x: raw + 10, y: 370 }); near(editor.getShape(id).x, expected);
      });
    });
  }

  it('lets native Escape restore exact original coordinates even beside a guide', async () => {
    await harness(async ({ editor, snapping, add, addGuide, ready, down, move, snapshot, tick }) => {
      const id = add(); addGuide('x', 103, 'guide:near-start'); addGuide('x', 300, 'guide:finish'); ready(id); const before = snapshot();
      await down({ x: 110, y: 110 }); await move({ x: 313, y: 370 }); near(editor.getShape(id).x, 300);
      editor.cancel(); await tick(); assert.equal(editor.getPath(), 'select.idle'); assert.deepEqual(snapshot(), before);
      assert.equal(snapping.drawingPickGuideSnap(editor).get(), null);
    });
  });

  it('preserves native object snapping on its axis and acquires a guide on the free axis', async () => {
    await harness(async ({ editor, snapping, add, addGuide, ready, down, move, up }) => {
      const id = add(); add('shape:reference', 306, 200, 60, 60); addGuide('x', 300); addGuide('y', 500); ready(id);
      await down({ x: 110, y: 110 }); await move({ x: 310, y: 475 });
      near(editor.getShape(id).x, 296); near(editor.getShape(id).y, 460);
      assert.ok(editor.snaps.getIndicators().length); assert.deepEqual(snapping.drawingPickGuideSnap(editor).get()?.guides.map((g: any) => g.axis), ['y']);
      await up({ x: 310, y: 475 }); near(editor.getShape(id).x, 296); near(editor.getShape(id).y, 460);
    });
  });

  it('keeps Alt duplication, repeat-duplicate offset and native cancel/undo exact', async () => {
    await harness(async ({ editor, add, addGuide, ready, down, move, up, snapshot, tick }) => {
      const original = add(); addGuide('x', 300); addGuide('y', 500); ready(original); const before = snapshot();
      await down({ x: 110, y: 110 }, { altKey: true }); await move({ x: 313, y: 514 }, { altKey: true });
      const copy = editor.getOnlySelectedShape(); assert.notEqual(copy.id, original); near(copy.x, 300); near(copy.y, 500);
      near(editor.getShape(original).x, 100); near(editor.getShape(original).y, 100);
      await up({ x: 313, y: 514 }, { altKey: true });
      const props = editor.getInstanceState().duplicateProps; assert.deepEqual(props.shapeIds, [copy.id]); near(props.offset.x, 200); near(props.offset.y, 400);
      const after = snapshot(); editor.undo(); assert.deepEqual(snapshot(), before); editor.redo(); assert.deepEqual(snapshot(), after);
      editor.undo(); editor.select(original); await tick(200);
      await down({ x: 110, y: 110 }, { altKey: true }); await move({ x: 313, y: 514 }, { altKey: true });
      editor.cancel(); await tick(); assert.deepEqual(snapshot(), before); assert.equal(editor.getCurrentPageShapeIds().size, 1);
    });
  });

  it('applies one page-space delta to a rotated group and a child of a different rotated parent', async () => {
    await harness(async ({ editor, addGuide, ready, down, move, up, snapshot, bounds }) => {
      editor.createShapes([
        { id: 'shape:g1', type: 'group', x: 160, y: 160, rotation: .35 },
        { id: 'shape:g2', type: 'group', x: 500, y: 200, rotation: -.55 },
        { id: 'shape:a', type: 'geo', parentId: 'shape:g1', x: 0, y: 0, props: { w: 80, h: 40 } },
        { id: 'shape:a2', type: 'geo', parentId: 'shape:g1', x: 130, y: 60, props: { w: 40, h: 30 } },
        { id: 'shape:b', type: 'geo', parentId: 'shape:g2', x: 0, y: 0, props: { w: 60, h: 50 } },
        { id: 'shape:b2', type: 'geo', parentId: 'shape:g2', x: 160, y: 130, props: { w: 70, h: 40 } },
      ]);
      editor.select('shape:g1', 'shape:b'); const initial = bounds();
      addGuide('x', initial.x + 500); addGuide('y', initial.y + 300); ready('shape:g1', 'shape:b');
      const before = snapshot(), roots = ['shape:g1', 'shape:b'].map(id => editor.getShapePageTransform(id).point());
      const fixed = ['shape:a', 'shape:a2', 'shape:g2', 'shape:b2'].map(id => structuredClone(editor.getShape(id)));
      const start = { x: initial.center.x, y: initial.center.y }, finish = { x: start.x + 503, y: start.y + 304 };
      await down(start); await move(finish); await up(finish);
      for (const [i, id] of ['shape:g1', 'shape:b'].entries()) {
        const point = editor.getShapePageTransform(id).point(); near(point.x - roots[i].x, 500); near(point.y - roots[i].y, 300);
      }
      near(bounds().x, initial.x + 500); near(bounds().y, initial.y + 300);
      assert.equal(editor.getShape('shape:b').parentId, 'shape:g2');
      for (const shape of fixed) assert.deepEqual(editor.getShape(shape.id), shape);
      const after = snapshot(); editor.undo(); assert.deepEqual(snapshot(), before); editor.redo(); assert.deepEqual(snapshot(), after);
    });
  });

  it('preserves native Alt press/release rollback while a snapped translation is active', async () => {
    await harness(async ({ editor, add, addGuide, ready, down, move, up, key, snapshot }) => {
      const id = add(); addGuide('x', 300); addGuide('y', 500); ready(id); const before = snapshot();
      await down({ x: 110, y: 110 }); await move({ x: 313, y: 514 }); near(editor.getShape(id).x, 300);
      await key('key_down', 'Alt', { altKey: true });
      const copy = editor.getOnlySelectedShape(); assert.notEqual(copy.id, id); near(copy.x, 300); near(copy.y, 500);
      near(editor.getShape(id).x, 100); near(editor.getShape(id).y, 100);
      await key('key_up', 'Alt'); assert.equal(editor.getOnlySelectedShape().id, id); assert.equal(editor.getShape(copy.id), undefined);
      near(editor.getShape(id).x, 300); near(editor.getShape(id).y, 500);
      await up({ x: 313, y: 514 }); assert.equal(editor.getCurrentPageShapeIds().size, 1);
      const after = snapshot(); editor.undo(); assert.deepEqual(snapshot(), before); editor.redo(); assert.deepEqual(snapshot(), after);
    });
  });

  for (const [name, master, ctrl, enabled, hidden, expected] of [
    ['disabled guidelines', true, false, false, false, 303],
    ['master disabled', false, false, true, false, 303],
    ['Ctrl enabling the disabled master', false, true, true, false, 300],
    ['Ctrl disabling the enabled master', true, true, true, false, 303],
    ['hidden and locked guidelines', true, false, true, true, 300],
  ] as const) it(`respects ${name} during ordinary dragging`, async () => {
    await harness(async ({ editor, snaps, add, addGuide, ready, down, pointer, move, up, key }) => {
      const id = add(); addGuide('x', 300); snaps.writeCadSnapSettings(editor, { guidelines: enabled });
      editor.user.updateUserPreferences({ isSnapMode: master });
      if (hidden) {
        const page = editor.getCurrentPage(), state = page.meta.omsGuides;
        editor.updatePage({ id: page.id, meta: { ...page.meta, omsGuides: { ...state, visible: false, locked: true,
          guides: state.guides.map((guide: any) => ({ ...guide, visible: false, locked: true })) } } });
      }
      ready(id); await down({ x: 110, y: 110 }); await pointer('pointer_move', { x: 313, y: 370 });
      if (ctrl) await key('key_down', 'Control', { ctrlKey: true });
      await move({ x: 313, y: 370 }, { ctrlKey: ctrl }); await up({ x: 313, y: 370 }, { ctrlKey: ctrl }); near(editor.getShape(id).x, expected);
    });
  });

  it('respects Shift locked axes and screen-pixel tolerance at zoom', async () => {
    await harness(async ({ editor, snapping, add, addGuide, ready, down, move, up, tick }) => {
      const id = add(); addGuide('x', 103); addGuide('y', 300); ready(id);
      await down({ x: 110, y: 110 }, { shiftKey: true }); await move({ x: 112, y: 314 }, { shiftKey: true });
      near(editor.getShape(id).x, 100); near(editor.getShape(id).y, 300);
      assert.deepEqual(snapping.drawingPickGuideSnap(editor).get()?.guides.map((guide: any) => guide.axis), ['y']);
      editor.cancel(); await tick(200);
      editor.setCamera({ x: 0, y: 0, z: 2 }); addGuide('x', 300, 'guide:zoom'); ready(id);
      await down({ x: 110, y: 110 }); await move({ x: 316, y: 370 }); near(editor.getShape(id).x, 306);
      await move({ x: 313, y: 370 }); near(editor.getShape(id).x, 300); await up({ x: 313, y: 370 }); near(editor.getShape(id).x, 300);
    });
  });

  for (const kind of ['protected-form', 'locked-child', 'bound-shape', 'readonly'] as const) it(`does not add guide correction to ${kind}`, async () => {
    await harness(async ({ editor, snapping, add, addGuide, ready, down, move, up }) => {
      let id = 'shape:art';
      if (kind === 'protected-form') editor.createShape({ id, type: 'order-details', x: 100, y: 100 });
      else if (kind === 'locked-child') {
        id = 'shape:g'; editor.createShapes([{ id, type: 'group', x: 100, y: 100 },
          { id: 'shape:locked', type: 'geo', parentId: id, isLocked: true, props: { w: 80, h: 40 } },
          { id: 'shape:other', type: 'geo', parentId: id, x: 100, props: { w: 30, h: 40 } }]);
      } else {
        add();
        if (kind === 'bound-shape') {
          editor.createShape({ id: 'shape:arrow', type: 'arrow', x: 800, y: 600 });
          editor.createBinding({ id: 'binding:test', type: 'arrow', fromId: 'shape:arrow', toId: id,
            props: { terminal: 'start', normalizedAnchor: { x: .5, y: .5 }, isExact: false, isPrecise: true } });
        }
      }
      addGuide('x', 300); ready(id); if (kind === 'readonly') editor.updateInstanceState({ isReadonly: true });
      await down({ x: 110, y: 110 }); await move({ x: 313, y: 370 }); await up({ x: 313, y: 370 });
      assert.equal(snapping.drawingPickGuideSnap(editor).get(), null);
      near(editor.getShape(id).x, kind === 'readonly' ? 100 : 303);
    });
  });

  for (const change of ['guide-position', 'selected-geometry', 'ancestor-transform'] as const) it(`invalidates a drag after a stale ${change}`, async () => {
    await harness(async ({ editor, snapping, add, addGuide, ready, down, move, up }) => {
      const id = add();
      if (change === 'ancestor-transform') {
        add('shape:spare', 800, 600); editor.groupShapes([id, 'shape:spare'], { groupId: 'shape:parent' });
      }
      addGuide('x', 300); ready(id); const initial = editor.getShapePageTransform(id).point();
      await down({ x: initial.x + 10, y: initial.y + 10 });
      if (change === 'guide-position') {
        const page = editor.getCurrentPage(), state = page.meta.omsGuides;
        editor.updatePage({ id: page.id, meta: { ...page.meta, omsGuides: { ...state, guides: state.guides.map((guide: any) => ({ ...guide, position: 302 })) } } });
      } else if (change === 'selected-geometry') editor.updateShape({ id, type: 'geo', props: { w: 84 } });
      else editor.updateShape({ id: 'shape:parent', type: 'group', x: editor.getShape('shape:parent').x + 10 });
      await move({ x: initial.x + 213, y: initial.y + 270 }); await up({ x: initial.x + 213, y: initial.y + 270 });
      assert.equal(snapping.drawingPickGuideSnap(editor).get(), null);
      near(editor.getShapePageTransform(id).point().x, change === 'ancestor-transform' ? 313 : 303);
    });
  });

  for (const source of ['user', 'remote'] as const) for (const operation of ['create', 'delete'] as const) {
    it(`invalidates guideline correction after ${source} descendant ${operation} without blocking the edit`, async () => {
      await harness(async ({ editor, snapping, addGroup, addGuide, ready, down, move, up }) => {
        const id = addGroup(); addGuide('x', 300); ready(id);
        await down({ x: 110, y: 110 }); await move({ x: 313, y: 370 }); near(editor.getShape(id).x, 300);
        assert.equal(snapping.drawingPickGuideSnap(editor).get()?.guides[0].id, 'guide:x');
        const change = () => operation === 'create'
          ? editor.createShape({ id: 'shape:new-child', type: 'geo', parentId: id, x: -60, y: 0, props: { w: 30, h: 40 } })
          : editor.deleteShape('shape:child-2');
        if (source === 'remote') editor.store.mergeRemoteChanges(change); else change();
        assert.equal(snapping.drawingPickGuideSnap(editor).get(), null);
        await move({ x: 314, y: 371 }); await up({ x: 314, y: 371 }); near(editor.getShape(id).x, 304);
        if (operation === 'create') { assert.equal(editor.getShape('shape:new-child').parentId, id); near(editor.getShape('shape:new-child').x, -60); }
        else assert.equal(editor.getShape('shape:child-2'), undefined);
      });
    });
  }

  it('keeps guideline correction active when unrelated shapes are created and deleted', async () => {
    await harness(async ({ editor, snapping, add, addGroup, addGuide, ready, down, move, up }) => {
      const id = addGroup(); add('shape:unrelated', 2000, 2000); addGuide('x', 300); ready(id);
      await down({ x: 110, y: 110 }); await move({ x: 313, y: 370 }); near(editor.getShape(id).x, 300);
      editor.store.mergeRemoteChanges(() => { add('shape:new-unrelated', 2500, 2500); editor.deleteShape('shape:unrelated'); });
      assert.equal(snapping.drawingPickGuideSnap(editor).get()?.guides[0].id, 'guide:x');
      await move({ x: 314, y: 371 }); await up({ x: 314, y: 371 }); near(editor.getShape(id).x, 300);
      assert.ok(editor.getShape('shape:new-unrelated')); assert.equal(editor.getShape('shape:unrelated'), undefined);
    });
  });

  it('keeps a snapped Alt group rollback exact when native reset deletes its copied subtree', async () => {
    await harness(async ({ editor, addGroup, addGuide, ready, down, move, up, key, snapshot }) => {
      const id = addGroup(); addGuide('x', 300); ready(id); const before = snapshot();
      await down({ x: 110, y: 110 }); await move({ x: 313, y: 370 }); near(editor.getShape(id).x, 300);
      await key('key_down', 'Alt', { altKey: true }); const copy = editor.getOnlySelectedShape();
      assert.notEqual(copy.id, id); near(copy.x, 300); assert.equal(editor.getCurrentPageShapeIds().size, 8); near(editor.getShape(id).x, 100);
      await key('key_up', 'Alt'); assert.equal(editor.getOnlySelectedShape().id, id); assert.equal(editor.getCurrentPageShapeIds().size, 4);
      near(editor.getShape(id).x, 300); await up({ x: 313, y: 370 }); near(editor.getShape(id).x, 300);
      const after = snapshot(); editor.undo(); assert.deepEqual(snapshot(), before); editor.redo(); assert.deepEqual(snapshot(), after);
    });
  });

  it('invalidates an active Alt copy when its descendant is externally deleted', async () => {
    await harness(async ({ editor, snapping, addGroup, addGuide, ready, down, move, up }) => {
      const original = addGroup(); addGuide('x', 700); ready(original);
      await down({ x: 110, y: 110 }, { altKey: true }); await move({ x: 713, y: 370 }, { altKey: true });
      const copy = editor.getOnlySelectedShape(); assert.notEqual(copy.id, original); near(copy.x, 700);
      const child = editor.getSortedChildIdsForParent(copy.id)[2]; editor.deleteShape(child);
      assert.equal(snapping.drawingPickGuideSnap(editor).get(), null);
      await move({ x: 714, y: 371 }, { altKey: true }); await up({ x: 714, y: 371 }, { altKey: true });
      near(editor.getShape(copy.id).x, 704); near(editor.getShape(original).x, 100); assert.equal(editor.getShape(child), undefined);
      assert.equal(editor.getSortedChildIdsForParent(original).length, 3);
    });
  });
});
