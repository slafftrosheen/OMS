import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

/** Real Editor records, history and React forms. CSS layout and visual focus
 * appearance are outside this jsdom test. */
async function harness(run: (h: any) => Promise<void>) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window, channels: MessageChannel[] = [], NativeChannel = globalThis.MessageChannel;
  win.fetch = globalThis.fetch.bind(globalThis);
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  const values: Record<string, unknown> = { matchMedia: win.matchMedia, IS_REACT_ACT_ENVIRONMENT: true,
    getComputedStyle: win.getComputedStyle.bind(win), requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    MessageChannel: class extends NativeChannel { constructor() { super(); channels.push(this); } },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  for (const key of ['window', 'document', 'navigator', 'self', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
    'SVGElement', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'DOMRect', 'DOMParser', 'MutationObserver', 'Image', 'localStorage'])
    values[key] = key === 'window' || key === 'self' ? win : win[key];
  const clearNodeTimeout = globalThis.clearTimeout, clearNodeInterval = globalThis.clearInterval;
  values.clearTimeout = (id: any) => typeof id === 'number' ? win.clearTimeout(id) : clearNodeTimeout(id);
  values.clearInterval = (id: any) => typeof id === 'number' ? win.clearInterval(id) : clearNodeInterval(id);
  win.Element.prototype.setPointerCapture = function () {}; win.Element.prototype.hasPointerCapture = function () { return false; };
  win.Element.prototype.releasePointerCapture = function () {}; win.Element.prototype.scrollIntoView = function () {};
  win.HTMLImageElement.prototype.decode = async () => {};
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client');
  const tl = await import('@tldraw/tldraw'), cad = await import('../../src/lib/components/canvas/cad-settings');
  const defaults = await import('../../src/lib/components/canvas/cad-dimension-defaults');
  const { registerCanvasDraft } = await import('../../src/lib/components/canvas/canvas-document');
  const { CadDimensionControls } = await import('../../src/lib/components/canvas/CadDimensionControls');
  const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
  const { CadPathShapeUtil, CadEllipseShapeUtil, CadArcShapeUtil, CadDimensionShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadShapes');
  const { CadCircleTool, CadDimensionTool } = await import('../../src/lib/components/canvas/CadTwoPointTool');
  const { CadAngularDimensionTool } = await import('../../src/lib/components/canvas/CadAngularDimensionTool');
  const { locale, t } = await import('svelte-i18n'); locale.set('en'); const stopText = t.subscribe(() => {});
  const host = document.createElement('div'); document.body.append(host);
  const shapeUtils = [...tl.defaultShapeUtils, CadPathShapeUtil, CadEllipseShapeUtil, CadArcShapeUtil, CadDimensionShapeUtil];
  const editor = new tl.Editor({ store: tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }), shapeUtils,
    bindingUtils: tl.defaultBindingUtils, tools: [...tl.defaultTools, ...tl.defaultShapeTools, CadCircleTool, CadDimensionTool, CadAngularDimensionTool], getContainer: () => host, initialState: 'select' });
  editor.updateViewportScreenBounds(new tl.Box(0, 0, 1600, 1200));
  editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS } } });
  const root = createRoot(host), tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }); };
  function Scene({ hidden }: { hidden: boolean }) {
    const settings = tl.useValue('dimension test settings', () => cad.readCadSettings(editor), [editor]);
    return <div hidden={hidden}><CadDimensionControls settings={settings}/></div>;
  }
  const render = async (hidden = false) => {
    await act(async () => root.render(<EditorContext.Provider value={editor}><Scene hidden={hidden}/></EditorContext.Provider>)); await tick();
  };
  const get = (testId: string) => { const element = host.querySelector(`[data-testid="${testId}"]`) as HTMLElement; assert.ok(element, testId); return element; };
  const input = async (element: HTMLInputElement, value: string) => {
    await act(async () => { Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true })); }); await tick();
  };
  const select = async (element: HTMLSelectElement, value: string) => {
    await act(async () => { element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })); }); await tick();
  };
  const click = async (testId: string) => { await act(async () => get(testId).click()); await tick(); };
  const submit = async (testId: string) => {
    await act(async () => get(testId).querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await tick();
  };
  const escape = async (element: HTMLElement) => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => element.dispatchEvent(event)); await tick(); assert.equal(event.defaultPrevented, true);
  };
  const snapshot = () => structuredClone(editor.store.getStoreSnapshot('document'));
  const addDimension = (props = {}) => {
    const id = tl.createShapeId(); editor.createShape({ id, type: 'cad-dimension', x: 100, y: 100, props }); editor.select(id); return id;
  };
  const changeSettings = async (patch: any) => {
    await act(async () => editor.updatePage({ id: editor.getCurrentPageId(), meta: { ...editor.getCurrentPage().meta,
      omsCad: patch === null ? null : { ...cad.readCadSettings(editor), ...patch } } })); await tick();
  };
  const pointer = async (name: string, x: number, y: number) => {
    await act(async () => editor.dispatch({ type: 'pointer', name, target: 'canvas', point: { x, y, z: .5 }, button: 0,
      pointerId: 1, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isPen: false } as any)); await tick();
  };
  try { await run({ editor, tl, cad, defaults, registerCanvasDraft, host, render, get, input, select, click, submit, escape, snapshot, addDimension, changeSettings, locale, act, tick, pointer }); }
  finally {
    await act(async () => root.unmount()); editor.dispose(); host.remove(); stopText();
    channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
}

describe('dimension docker defaults and physical annotation editing', () => {
  it('shows defaults without a selection and saves physical units with one Undo while retaining existing dimension records', async () => harness(async h => {
    const { editor, cad, defaults, render, get, select, input, click, snapshot, addDimension, changeSettings, act, tick } = h;
    await changeSettings({ unit: 'cm', scale: 10 }); await render();
    assert.equal(get('drawing-dimension-defaults').querySelector('summary')!.textContent, 'New dimensions on this page');
    assert.equal(h.host.querySelector('[data-testid="drawing-dimension-settings"]'), null);
    await select(get('drawing-dimension-defaults-mode'), 'physical');
    near(Number(get('drawing-dimension-defaults-height').value), .35);
    near(Number(get('drawing-dimension-defaults-offset').value), .8);
    let id: string; await act(async () => { id = addDimension({ decorationScale: 2, offset: -40 }); }); await tick();
    const original = structuredClone(editor.getShape(id!)); editor.mark('defaults-start'); const before = snapshot();
    await input(get('drawing-dimension-defaults-height'), '.75');
    await input(get('drawing-dimension-defaults-offset'), '-2.25');
    await select(get('drawing-dimension-defaults-precision'), '4');
    await select(get('drawing-dimension-defaults-markers'), 'tick'); await click('drawing-dimension-defaults-unit');
    assert.deepEqual(snapshot(), before);
    await click('drawing-dimension-defaults-save');
    assert.deepEqual(defaults.readDimensionDefaults(editor), { version: 1, mode: 'physical', textHeightMm: 7.5, offsetMm: -22.5, precision: 4, showUnit: false, marker: 'tick' });
    assert.deepEqual(editor.getShape(id!), original);
    assert.match(get('drawing-dimension-defaults').textContent, /Defaults for new dimensions saved/);
    await act(async () => editor.undo()); await tick(); assert.deepEqual(snapshot(), before);
    assert.equal(cad.readCadSettings(editor).unit, 'cm');
  }));

  it('preserves dirty physical drafts across calibration, defaults and page changes until Reload or Escape', async () => harness(async h => {
    const { editor, tl, defaults, render, get, input, select, click, submit, escape, snapshot, changeSettings, act, tick } = h;
    await render(); await select(get('drawing-dimension-defaults-mode'), 'physical');
    await input(get('drawing-dimension-defaults-height'), '5.125');
    await changeSettings({ unit: 'cm', scale: 10 }); const changed = snapshot();
    assert.equal(get('drawing-dimension-defaults-height').value, '5.125');
    assert.match(get('drawing-dimension-defaults-height').closest('label')!.textContent, /\(mm\)/);
    assert.equal(get('drawing-dimension-defaults-save').disabled, true);
    assert.match(get('drawing-dimension-defaults').textContent, /Reload the defaults before saving/);
    await submit('drawing-dimension-defaults'); assert.deepEqual(snapshot(), changed);
    let escaped = 0; const listener = () => escaped++; document.addEventListener('keydown', listener);
    await escape(get('drawing-dimension-defaults-height')); document.removeEventListener('keydown', listener); assert.equal(escaped, 0);
    assert.equal(get('drawing-dimension-defaults-mode').value, 'view');
    await select(get('drawing-dimension-defaults-mode'), 'physical');
    near(Number(get('drawing-dimension-defaults-height').value), .35);
    await input(get('drawing-dimension-defaults-height'), '.6');
    await act(async () => defaults.writeDimensionDefaults(editor, defaults.dimensionDefaultsRevision(editor), { ...defaults.readDimensionDefaults(editor), marker: 'arrow' })); await tick();
    const external = snapshot(); await submit('drawing-dimension-defaults'); assert.deepEqual(snapshot(), external);
    assert.equal(get('drawing-dimension-defaults-height').value, '.6'); await click('drawing-dimension-defaults-reload');
    assert.equal(get('drawing-dimension-defaults-markers').value, 'arrow');
    await select(get('drawing-dimension-defaults-precision'), '6');
    const pageId = tl.PageRecordType.createId();
    await act(async () => { editor.createPage({ id: pageId, name: 'Second page' }); editor.setCurrentPage(pageId); }); await tick();
    assert.equal(get('drawing-dimension-defaults-precision').value, '6'); assert.equal(get('drawing-dimension-defaults-save').disabled, true);
    const page = snapshot(); await submit('drawing-dimension-defaults'); assert.deepEqual(snapshot(), page);
    await click('drawing-dimension-defaults-reload'); assert.equal(get('drawing-dimension-defaults-precision').value, 'document');
  }));

  it('rejects invalid heights without a blur write and protects hidden, read-only and active construction sessions', async () => harness(async h => {
    const { editor, render, get, input, select, submit, escape, snapshot, registerCanvasDraft, changeSettings, act, tick } = h;
    await render(); await select(get('drawing-dimension-defaults-mode'), 'physical');
    const before = snapshot(); await input(get('drawing-dimension-defaults-height'), '');
    assert.equal(get('drawing-dimension-defaults-height').getAttribute('aria-invalid'), 'true');
    assert.equal(get('drawing-dimension-defaults-save').disabled, true);
    await act(async () => get('drawing-dimension-defaults-height').dispatchEvent(new FocusEvent('blur', { bubbles: true }))); await tick();
    await submit('drawing-dimension-defaults'); assert.deepEqual(snapshot(), before);
    assert.ok(document.getElementById(get('drawing-dimension-defaults-height').getAttribute('aria-describedby')));
    await escape(get('drawing-dimension-defaults-height'));
    await select(get('drawing-dimension-defaults-precision'), '4');
    await render(true); await submit('drawing-dimension-defaults'); assert.deepEqual(snapshot(), before); await render();
    await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
    assert.equal(get('drawing-dimension-defaults').querySelector('fieldset')!.disabled, true);
    await submit('drawing-dimension-defaults'); assert.deepEqual(snapshot(), before);
    await act(async () => editor.updateInstanceState({ isReadonly: false })); await tick();
    const stop = registerCanvasDraft(editor, () => ({ id: 'shape:unfinished', props: null }));
    await act(async () => editor.updateInstanceState({ isFocused: true })); await tick();
    assert.equal(get('drawing-dimension-defaults').querySelector('fieldset')!.disabled, true);
    await submit('drawing-dimension-defaults'); assert.deepEqual(snapshot(), before); stop();
    await act(async () => editor.updateInstanceState({ isFocused: false })); await tick();
    await changeSettings(null); await h.click('drawing-dimension-defaults-reload');
    assert.equal(get('drawing-dimension-defaults-mode').querySelector('option[value="physical"]')!.disabled, true);
    assert.match(get('drawing-dimension-defaults').textContent, /Apply document units and scale/);
  }));

  it('saves view settings after an unfinished physical draft while preserving valid physical changes', async () => harness(async h => {
    const { editor, defaults, render, get, input, select, click, snapshot } = h; await render();
    const before = snapshot(); await select(get('drawing-dimension-defaults-mode'), 'physical');
    await input(get('drawing-dimension-defaults-height'), ''); await input(get('drawing-dimension-defaults-offset'), '12');
    await select(get('drawing-dimension-defaults-mode'), 'view');
    assert.equal(h.host.querySelector('[data-testid="drawing-dimension-defaults-height"]'), null);
    assert.equal(get('drawing-dimension-defaults-save').disabled, false); assert.deepEqual(snapshot(), before);
    await click('drawing-dimension-defaults-save');
    assert.equal(defaults.readDimensionDefaults(editor).textHeightMm, 3.5); assert.equal(defaults.readDimensionDefaults(editor).offsetMm, 12);
    await select(get('drawing-dimension-defaults-mode'), 'physical');
    assert.equal(get('drawing-dimension-defaults-height').value, ''); assert.equal(get('drawing-dimension-defaults-offset').value, '12');
    await input(get('drawing-dimension-defaults-height'), '7'); await input(get('drawing-dimension-defaults-offset'), '');
    await select(get('drawing-dimension-defaults-mode'), 'view'); await click('drawing-dimension-defaults-save');
    assert.equal(defaults.readDimensionDefaults(editor).textHeightMm, 7); assert.equal(defaults.readDimensionDefaults(editor).offsetMm, 12);
  }));

  it('synchronizes physical height and percentage, stages a signed fit to view and applies it with one Undo', async () => harness(async h => {
    const { editor, cad, render, get, input, click, snapshot, addDimension, changeSettings, act, tick } = h;
    await changeSettings({ unit: 'cm', scale: 10 }); const settings = cad.readCadSettings(editor);
    const id = addDimension({ decorationScale: 2, offset: -40 }); editor.setCamera({ x: 0, y: 0, z: .25 }); editor.mark('annotation-start');
    await render(); const before = snapshot();
    near(Number(get('drawing-dimension-text-height').value), cad.canvasLengthToUnit(28, settings));
    await input(get('drawing-dimension-text-height'), '10');
    near(Number(get('drawing-dimension-size').value), cad.unitLengthToCanvas(10, settings) / 14 * 100);
    await input(get('drawing-dimension-size'), '200');
    near(Number(get('drawing-dimension-text-height').value), cad.canvasLengthToUnit(28, settings));
    assert.deepEqual(snapshot(), before); await click('drawing-dimension-fit-view');
    near(Number(get('drawing-dimension-size').value), 400);
    near(Number(get('drawing-dimension-text-height').value), cad.canvasLengthToUnit(56, settings));
    near(Number(get('drawing-dimension-offset').value), cad.canvasLengthToUnit(-80, settings));
    assert.deepEqual(snapshot(), before); await click('drawing-dimension-apply');
    near(editor.getShape(id).props.decorationScale, 4); near(editor.getShape(id).props.offset, -80);
    await act(async () => editor.undo()); await tick(); assert.deepEqual(snapshot(), before);
  }));

  it('fits the actual angular radius and preserves its minimum radius while staging all changes', async () => harness(async h => {
    const { editor, cad, render, get, click, snapshot, addDimension, act, tick } = h;
    const id = addDimension({ endX: 100, endY: 0, decorationScale: 1, offset: -60, angleSweep: Math.PI / 2 });
    editor.setCamera({ x: 0, y: 0, z: .5 }); await render(); let before = snapshot();
    await click('drawing-dimension-fit-view');
    near(Number(get('drawing-dimension-size').value), 200);
    near(cad.unitLengthToCanvas(Number(get('drawing-dimension-offset').value), cad.readCadSettings(editor)), -20);
    assert.deepEqual(snapshot(), before); await click('drawing-dimension-apply'); near(editor.getShape(id).props.offset, -20);
    await act(async () => { editor.updateShape({ id, type: 'cad-dimension', props: { decorationScale: 1, offset: -92 } }); editor.setCamera({ x: 0, y: 0, z: .25 }); }); await tick();
    before = snapshot(); await click('drawing-dimension-fit-view');
    near(cad.unitLengthToCanvas(Number(get('drawing-dimension-offset').value), cad.readCadSettings(editor)), -68);
    assert.equal(get('drawing-dimension-apply').disabled, false); assert.deepEqual(snapshot(), before);
    await click('drawing-dimension-apply'); near(editor.getShape(id).props.offset + 100, 8 * editor.getShape(id).props.decorationScale);
  }));

  it('edits legacy height in px, blocks stale selected drafts, and disables locked or broken annotations', async () => harness(async h => {
    const { editor, cad, render, get, input, click, submit, snapshot, addDimension, changeSettings, act, tick } = h;
    await changeSettings(null); const id = addDimension(); await render();
    assert.match(get('drawing-dimension-text-height').closest('label')!.textContent, /\(px\)/);
    await input(get('drawing-dimension-text-height'), '28'); assert.equal(get('drawing-dimension-size').value, '200');
    await click('drawing-dimension-apply'); near(editor.getShape(id).props.decorationScale, 2);
    await input(get('drawing-dimension-text-height'), '35');
    await changeSettings(cad.DEFAULT_CAD_SETTINGS); const before = snapshot();
    assert.equal(get('drawing-dimension-text-height').value, '35');
    assert.equal(get('drawing-dimension-apply').disabled, true);
    assert.match(get('drawing-dimension-settings').textContent, /Reload the dimension before applying/);
    await submit('drawing-dimension-settings'); assert.deepEqual(snapshot(), before);
    await click('drawing-dimension-reload'); assert.match(get('drawing-dimension-text-height').closest('label')!.textContent, /\(mm\)/);
    await act(async () => editor.updateShape({ id, type: 'cad-dimension', isLocked: true })); await tick();
    assert.equal(get('drawing-dimension-settings').querySelector('fieldset')!.disabled, true);
    assert.equal(get('drawing-dimension-defaults').querySelector('fieldset')!.disabled, false);
    await act(async () => editor.updateShape({ id, type: 'cad-dimension', isLocked: false, props: { link: { kind: 'horizontal', sourceIds: ['shape:missing'] } } })); await tick();
    assert.equal(get('drawing-dimension-settings').querySelector('fieldset')!.disabled, true);
    assert.match(get('drawing-dimension-links').textContent, /Dimension reference missing/);
  }));

  it('keeps both dimension form scopes translated in Russian and Latvian', async () => harness(async h => {
    const { addDimension, render, get, locale, select, submit, snapshot, act, tick } = h; addDimension(); await render();
    const section = get('drawing-dimension-defaults'); assert.equal(section.open, false);
    await act(async () => section.querySelector('summary')!.click()); await tick(); assert.equal(section.open, true);
    await select(get('drawing-dimension-defaults-precision'), '4'); const before = snapshot();
    await act(async () => section.querySelector('summary')!.click()); await tick(); assert.equal(section.open, false);
    await submit('drawing-dimension-defaults'); assert.deepEqual(snapshot(), before);
    await act(async () => section.querySelector('summary')!.click()); await tick();
    for (const [language, title, height] of [['ru', 'Новые размеры на этой странице', 'Высота текста'], ['lv', 'Jauni izmēri šajā lapā', 'Teksta augstums']]) {
      await act(async () => locale.set(language)); await tick();
      assert.equal(get('drawing-dimension-defaults').querySelector('summary')!.textContent, title);
      assert.ok(get('drawing-dimension-text-height').closest('label')!.textContent!.includes(height));
      assert.equal(section.open, true); assert.equal(get('drawing-dimension-defaults-precision').value, '4');
    }
  }));
});

describe('native circle and dimension construction boundaries', () => {
  it('commits each construction in one Undo and cancels a permission change without touching earlier artwork', async () => harness(async h => {
    const { editor, pointer, snapshot, act, tick } = h;
    for (const tool of ['cad-circle', 'cad-dimension', 'cad-dimension-angular']) {
      await act(async () => editor.setCurrentTool(tool)); await tick(); const before = snapshot();
      await pointer('pointer_down', 100, 100); await pointer('pointer_up', 100, 100);
      if (tool === 'cad-dimension-angular') { await pointer('pointer_down', 300, 100); await pointer('pointer_up', 300, 100); }
      await pointer('pointer_move', 100, 300); await pointer('pointer_down', 100, 300); await pointer('pointer_up', 100, 300);
      const created = structuredClone(editor.getOnlySelectedShape());
      assert.equal(created.type, tool === 'cad-circle' ? 'cad-ellipse' : 'cad-dimension');
      assert.equal(editor.isIn('select.idle'), true);
      if (tool === 'cad-circle') assert.equal(created.meta.omsVectorPaint.hairline, true);
      await act(async () => editor.undo()); await tick(); assert.deepEqual(snapshot(), before);
      await act(async () => editor.redo()); await tick(); assert.deepEqual(editor.getShape(created.id), created);
      const completed = snapshot();
      await act(async () => editor.setCurrentTool(tool)); await tick();
      await pointer('pointer_down', 400, 100); await pointer('pointer_up', 400, 100);
      if (tool === 'cad-dimension-angular') { await pointer('pointer_down', 600, 100); await pointer('pointer_up', 600, 100); }
      await pointer('pointer_move', 400, 300);
      await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
      await pointer('pointer_move', 400, 350);
      assert.deepEqual(snapshot(), completed);
      await act(async () => editor.updateInstanceState({ isReadonly: false })); await tick();
    }
  }));

  it('clears circles whose far side exceeds the canvas, including an invalid endpoint after a valid preview', async () => harness(async h => {
    const { editor, pointer, snapshot, act, tick } = h;
    for (const axis of ['x', 'y']) {
      await act(async () => {
        editor.setCamera({ x: axis === 'x' ? -999500 : 0, y: axis === 'y' ? -999500 : 0, z: 1 });
        editor.setCurrentTool('cad-circle');
      }); await tick();
      const before = snapshot();
      await pointer('pointer_down', 400, 400); await pointer('pointer_up', 400, 400);
      await pointer('pointer_move', axis === 'x' ? 350 : 400, axis === 'y' ? 350 : 400);
      assert.equal(editor.getCurrentPageShapes().length, 1);
      await pointer('pointer_move', axis === 'x' ? 100 : 400, axis === 'y' ? 100 : 400);
      assert.deepEqual(snapshot(), before, `invalid ${axis} extent must remove the preview`);
      await act(async () => editor.dispatch({ type: 'keyboard', name: 'key_down', key: 'Enter', code: 'Enter', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false })); await tick();
      assert.deepEqual(snapshot(), before);
      await act(async () => editor.cancel()); await tick();
    }
  }));

  it('cancels refused or rewritten circle creation and updates without committing a stale radius', async () => harness(async h => {
    const { editor, tl, pointer, snapshot, act, tick } = h;
    const retained = tl.createShapeId('retained-before-circle');
    editor.createShape({ id: retained, type: 'geo', x: 700, y: 500 });
    for (const mode of ['create-refused', 'create-rewritten', 'update-refused', 'update-rewritten']) {
      await act(async () => editor.setCurrentTool('cad-circle')); await tick();
      const before = snapshot();
      await pointer('pointer_down', 100, 100); await pointer('pointer_up', 100, 100);
      const originalCreate = editor.createShape, originalUpdate = editor.updateShape;
      if (mode.startsWith('update')) {
        await pointer('pointer_move', 200, 100); assert.equal(editor.getCurrentPageShapes().length, 2);
      }
      if (mode === 'create-refused') editor.createShape = () => editor;
      if (mode === 'create-rewritten') editor.createShape = (shape: any) => originalCreate.call(editor, { ...shape, props: { ...shape.props, w: shape.props.w / 2 } });
      if (mode === 'update-refused') editor.updateShape = () => editor;
      if (mode === 'update-rewritten') editor.updateShape = (shape: any) => originalUpdate.call(editor, { ...shape, props: { ...shape.props, w: shape.props.w / 2 } });
      try { await pointer('pointer_move', 300, 100); }
      finally { editor.createShape = originalCreate; editor.updateShape = originalUpdate; }
      assert.deepEqual(snapshot(), before, mode);
      assert.equal(editor.isIn('select.idle'), true, mode);
    }
    assert.ok(editor.getShape(retained));
  }));
});
