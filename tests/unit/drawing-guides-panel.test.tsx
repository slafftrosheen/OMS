import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');

function environment() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window, channels: MessageChannel[] = [], NativeMessageChannel = globalThis.MessageChannel;
  win.fetch = globalThis.fetch.bind(globalThis);
  const media = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  win.matchMedia = media;
  const values: Record<string, unknown> = {
    MessageChannel: class extends NativeMessageChannel { constructor() { super(); channels.push(this); } },
    getComputedStyle: win.getComputedStyle.bind(win), requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, matchMedia: media, IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const key of ['window', 'document', 'navigator', 'self', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
    'SVGElement', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent', 'FocusEvent', 'DOMRect', 'MutationObserver', 'Image', 'localStorage']) {
    values[key] = key === 'window' || key === 'self' ? win : win[key];
  }
  win.HTMLElement.prototype.setPointerCapture = () => {};
  win.HTMLElement.prototype.releasePointerCapture = () => {};
  win.HTMLElement.prototype.hasPointerCapture = () => false;
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  return { win, restore() {
    channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  } };
}

async function harness(run: (h: any) => Promise<void>) {
  const env = environment();
  const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client');
  const tldraw = await import('@tldraw/tldraw');
  const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
  const { DrawingGuidesPanel } = await import('../../src/lib/components/canvas/DrawingGuidesPanel');
  const guides = await import('../../src/lib/components/canvas/drawing-guides');
  const settings = await import('../../src/lib/components/canvas/cad-settings');
  const { CadCircleTool } = await import('../../src/lib/components/canvas/CadTwoPointTool');
  const { CadEllipseShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadShapes');
  const { hasCanvasDraft } = await import('../../src/lib/components/canvas/canvas-document');
  const { locale } = await import('svelte-i18n'); locale.set('en');
  const container = document.createElement('div'); document.body.append(container);
  const editor = new tldraw.Editor({
    store: tldraw.createTLStore({ shapeUtils: [...tldraw.defaultShapeUtils, CadEllipseShapeUtil], bindingUtils: tldraw.defaultBindingUtils }),
    shapeUtils: [...tldraw.defaultShapeUtils, CadEllipseShapeUtil], bindingUtils: tldraw.defaultBindingUtils,
    tools: [...tldraw.defaultTools, ...tldraw.defaultShapeTools, CadCircleTool], getContainer: () => container, initialState: 'select',
  });
  editor.updateViewportScreenBounds(new tldraw.Box(0, 0, 800, 600)); editor.updateInstanceState({ isFocused: true });
  editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...settings.DEFAULT_CAD_SETTINGS, originX: 100, originY: 200 } } });
  const root = createRoot(container); let focusRequest = 0, documentRequests = 0;
  function Panel() {
    const calibration = tldraw.useValue('guide test calibration', () => settings.readCadSettings(editor), [editor]);
    return <EditorContext.Provider value={editor}><DrawingGuidesPanel settings={calibration} focusRequest={focusRequest}
      onDocument={() => { documentRequests++; }} renderAlignment={guide => <div data-testid="alignment-current">{guide?.id ?? 'none'}</div>} /></EditorContext.Provider>;
  }
  const tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); };
  const view = async () => { await act(async () => root.render(<Panel />)); await tick(); };
  const get = (testId: string) => { const node = container.querySelector(`[data-testid="${testId}"]`) as HTMLElement; assert.ok(node, testId); return node; };
  const input = async (testId: string, value: string) => {
    const element = get(testId) as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(env.win.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }); await tick();
  };
  const select = async (testId: string, value: string) => {
    await act(async () => { const element = get(testId) as HTMLSelectElement; element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })); }); await tick();
  };
  const click = async (testId: string) => { await act(async () => get(testId).click()); await tick(); };
  const change = async (operation: any) => { await act(async () => assert.equal(guides.applyDrawingGuideChange(editor, guides.prepareDrawingGuideChange(editor, operation)), true)); await tick(); };
  const pointer = async (name: string, point: { x: number; y: number }, extra = {}) => {
    await act(async () => editor.dispatch({ type: 'pointer', name, point: { ...point, z: .5 }, target: 'canvas', button: 0, pointerId: 1, isPen: false,
      shiftKey: false, ctrlKey: false, altKey: false, ...extra } as any)); await tick();
  };
  try {
    await view();
    await run({ editor, env, container, guides, settings, locale, get, input, select, click, change, tick, act, pointer, hasCanvasDraft,
      focus: async () => { focusRequest++; await view(); }, documentRequests: () => documentRequests });
  } finally { await act(async () => root.unmount()); editor.dispose(); container.remove(); env.restore(); }
}

describe('Guidelines docker with a real React and tldraw editor', () => {
  it('protects real CAD draft rollback before the first preview record exists', async () => {
    await harness(async ({ editor, guides, get, change, act, tick, pointer, hasCanvasDraft, container }) => {
      await act(async () => editor.setCurrentTool('cad-circle')); await tick();
      assert.equal(hasCanvasDraft(editor), false); assert.equal(get('drawing-guide-add').matches(':disabled'), false);
      await change({ kind: 'add', id: 'guide:before', axis: 'x', position: 350 });
      await pointer('pointer_down', { x: 100, y: 100 }); await pointer('pointer_up', { x: 100, y: 100 });
      assert.equal(hasCanvasDraft(editor), true); assert.equal(editor.getCurrentPageShapeIds().size, 0, 'first radius point has no preview shape yet');
      assert.equal(get('drawing-guide-add').matches(':disabled'), true); assert.match(container.textContent ?? '', /Finish or cancel/);
      assert.throws(() => guides.prepareDrawingGuideChange(editor, { kind: 'add', axis: 'y', position: 50 }), /busy/);
      await act(async () => editor.cancel()); await tick();
      assert.equal(hasCanvasDraft(editor), false); assert.equal(get('drawing-guide-add').matches(':disabled'), false);
      assert.equal(guides.readDrawingGuides(editor).guides.length, 1);
      await change({ kind: 'add', id: 'guide:after', axis: 'y', position: 50 });
      await act(async () => editor.undo()); await tick(); assert.equal(guides.readDrawingGuides(editor).guides.length, 1);
      await act(async () => editor.redo()); await tick(); assert.equal(guides.readDrawingGuides(editor).guides.length, 2);
      await act(async () => editor.setCurrentTool('cad-circle')); await pointer('pointer_down', { x: 120, y: 100 });
      await pointer('pointer_up', { x: 120, y: 100 }); await act(async () => editor.cancel()); await tick();
      assert.equal(guides.readDrawingGuides(editor).guides.length, 2, 'a later canceled draft preserves both earlier guide transactions');
    });
  });

  it('rejects a native move until cancellation and then creates an independently undoable guide', async () => {
    await harness(async ({ editor, guides, get, change, act, tick, pointer }) => {
      await act(async () => { editor.createShape({ id: 'shape:native' as any, type: 'geo', x: 100, y: 100, props: { w: 80, h: 40 } }); editor.select('shape:native' as any); });
      const original = structuredClone(editor.getShape('shape:native' as any));
      await pointer('pointer_down', { x: 110, y: 110 }, { target: 'shape', shape: editor.getShape('shape:native' as any) });
      await pointer('pointer_move', { x: 160, y: 150 });
      assert.equal(editor.getPath(), 'select.translating'); assert.equal(guides.drawingGuidesBusy(editor), true);
      assert.equal(get('drawing-guide-add').matches(':disabled'), true);
      assert.throws(() => guides.prepareDrawingGuideChange(editor, { kind: 'add', axis: 'x', position: 75 }), /busy/);
      await act(async () => editor.cancel()); await tick();
      assert.deepEqual(editor.getShape('shape:native' as any), original);
      assert.equal(guides.drawingGuidesBusy(editor), false); assert.equal(get('drawing-guide-add').matches(':disabled'), false);
      await change({ kind: 'add', id: 'guide:native-after', axis: 'x', position: 75 });
      await act(async () => editor.undo()); await tick(); assert.equal(guides.readDrawingGuides(editor).guides.length, 0);
      assert.deepEqual(editor.getShape('shape:native' as any), original);
    });
  });

  it('adds physical horizontal and vertical positions, synchronizes selection and routes focus', async () => {
    await harness(async ({ editor, guides, settings, get, input, select, click, focus, change }) => {
      await focus(); assert.equal(document.activeElement?.getAttribute('data-testid'), 'drawing-guide-add-position');
      await input('drawing-guide-add-position', '10'); await click('drawing-guide-add');
      let saved = guides.readDrawingGuides(editor); assert.equal(saved.guides.length, 1); assert.equal(saved.guides[0].axis, 'y');
      assert.ok(Math.abs(saved.guides[0].position - (200 - 10 * 96 / 25.4)) < 1e-8);
      assert.ok(Math.abs(guides.guidePositionToUnit('y', saved.guides[0].position, settings.readCadSettings(editor)) - 10) < 1e-8);
      assert.equal(get('alignment-current').textContent, saved.guides[0].id);
      assert.equal((get('drawing-guide-move-position') as HTMLInputElement).value, '10');
      await focus(); assert.equal(document.activeElement?.getAttribute('data-testid'), 'drawing-guide-move-position');
      await change({ kind: 'settings', visible: false });
      await select('drawing-guide-add-axis', 'x'); await input('drawing-guide-add-position', '5'); await click('drawing-guide-add');
      saved = guides.readDrawingGuides(editor); assert.equal(saved.guides.length, 2); assert.equal(saved.visible, true);
      assert.equal(saved.guides[1].axis, 'x'); assert.ok(Math.abs(guides.guidePositionToUnit('x', saved.guides[1].position, settings.readCadSettings(editor)) - 5) < 1e-8);
      await select('drawing-guides-list', saved.guides[0].id); assert.equal(get('alignment-current').textContent, saved.guides[0].id);
      await click('drawing-guide-locked'); assert.equal(get('drawing-guide-move-position').matches(':disabled'), true);
      assert.equal(get('drawing-guide-delete').matches(':disabled'), true);
      await focus(); assert.equal(document.activeElement?.getAttribute('data-testid'), 'drawing-guide-add-position');
    });
  });

  it('retains but blocks stale numeric drafts until reload or an explicit fresh edit', async () => {
    await harness(async ({ editor, guides, settings, get, input, click, change, act, tick }) => {
      await change({ kind: 'add', id: 'guide:edit', axis: 'x', position: 200 });
      await input('drawing-guide-move-position', '30');
      await change({ kind: 'move', id: 'guide:edit', position: 300 });
      assert.equal((get('drawing-guide-move-position') as HTMLInputElement).value, '30');
      assert.equal(get('drawing-guide-move').matches(':disabled'), true);
      assert.equal(get('drawing-guide-move-position').getAttribute('aria-invalid'), 'true');
      await click('drawing-guide-move'); assert.equal(guides.readDrawingGuides(editor).guides[0].position, 300);
      await click('drawing-guide-reset'); assert.equal(get('drawing-guide-move-position').getAttribute('aria-invalid'), 'false');
      assert.equal((get('drawing-guide-move-position') as HTMLInputElement).value, '52.9166666667');
      await input('drawing-guide-move-position', '40');
      await act(async () => settings.writeCadSettings(editor, { ...settings.readCadSettings(editor), unit: 'cm' })); await tick();
      assert.equal((get('drawing-guide-move-position') as HTMLInputElement).value, '4');
      assert.equal(get('drawing-guide-move').matches(':disabled'), true);
      await input('drawing-guide-move-position', '5'); await click('drawing-guide-move');
      assert.ok(Math.abs(guides.guidePositionToUnit('x', guides.readDrawingGuides(editor).guides[0].position, settings.readCadSettings(editor)) - 5) < 1e-8);
      await input('drawing-guide-move-position', '99');
      await act(async () => get('drawing-guide-move-position').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))); await tick();
      assert.equal((get('drawing-guide-move-position') as HTMLInputElement).value, '5');
      assert.equal(get('drawing-guide-move').matches(':disabled'), true);
    });
  });

  it('resets drafts across pages, preserves page selections and disables document writes when readonly', async () => {
    await harness(async ({ editor, guides, get, input, change, act, tick, container, locale }) => {
      const pageA = editor.getCurrentPageId();
      await change({ kind: 'add', id: 'guide:first', axis: 'x', position: 200 });
      await input('drawing-guide-move-position', '999');
      await act(async () => { editor.createPage({ id: 'page:second' as any, name: 'Second' }); editor.setCurrentPage('page:second' as any); }); await tick();
      assert.equal(get('alignment-current').textContent, 'none'); assert.equal(container.querySelector('[data-testid="drawing-guide-move-position"]'), null);
      assert.equal((get('drawing-guide-add-position') as HTMLInputElement).value, '0');
      await change({ kind: 'add', id: 'guide:second', axis: 'y', position: 75 });
      assert.equal(get('alignment-current').textContent, 'guide:second');
      await act(async () => editor.setCurrentPage(pageA)); await tick();
      assert.equal(get('alignment-current').textContent, 'guide:first');
      assert.equal((get('drawing-guide-move-position') as HTMLInputElement).value, '26.4583333333');
      assert.equal(guides.readDrawingGuides(editor).guides[0].position, 200);
      await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
      for (const name of ['drawing-guides-visible', 'drawing-guides-locked', 'drawing-guides-snap', 'drawing-guide-add', 'drawing-guide-move-position', 'drawing-guide-visible', 'drawing-guide-locked', 'drawing-guide-delete']) {
        assert.equal(get(name).matches(':disabled'), true, name);
      }
      assert.equal(get('drawing-guides-list').matches(':disabled'), false);
      await act(async () => locale.set('ru')); await tick(); assert.match(container.textContent ?? '', /Направляющие/);
      await act(async () => locale.set('lv')); await tick(); assert.match(container.textContent ?? '', /Vadlīnijas/);
      assert.match(container.querySelector('.drawing-guide-help summary')?.textContent ?? '', /Kā darbojas/);
    });
  });
});
