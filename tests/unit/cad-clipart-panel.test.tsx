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
  const { CadProductionClipart } = await import('../../src/lib/components/canvas/CadProductionTools');
  const { CadBezierShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadBezierShape');
  const { CadPathShapeUtil, CadEllipseShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadShapes');
  const calibration = await import('../../src/lib/components/canvas/cad-settings');
  const { buildCadDxf } = await import('../../src/lib/components/canvas/cad-dxf');
  const { locale } = await import('svelte-i18n'); locale.set('en');
  const container = document.createElement('div'); document.body.append(container);
  const shapeUtils = [...tldraw.defaultShapeUtils, CadBezierShapeUtil, CadPathShapeUtil, CadEllipseShapeUtil];
  const editor = new tldraw.Editor({
    store: tldraw.createTLStore({ shapeUtils, bindingUtils: tldraw.defaultBindingUtils }), shapeUtils,
    bindingUtils: tldraw.defaultBindingUtils, tools: [...tldraw.defaultTools, ...tldraw.defaultShapeTools],
    getContainer: () => container, initialState: 'select',
  });
  editor.updateViewportScreenBounds(new tldraw.Box(0, 0, 800, 600));
  editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...calibration.DEFAULT_CAD_SETTINGS } } });
  const root = createRoot(container);
  function Panel() {
    const settings = tldraw.useValue('clipart test calibration', () => calibration.readCadSettings(editor), [editor]);
    return <EditorContext.Provider value={editor}><CadProductionClipart settings={settings} onSetup={() => {}} /></EditorContext.Provider>;
  }
  const tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); };
  const get = (testId: string) => { const element = container.querySelector(`[data-testid="${testId}"]`) as HTMLElement; assert.ok(element, testId); return element; };
  const click = async (testId: string) => { await act(async () => get(testId).click()); await tick(); };
  const input = async (testId: string, value: string) => {
    await act(async () => {
      const element = get(testId) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(env.win.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }); await tick();
  };
  try {
    await act(async () => root.render(<Panel />)); await tick();
    await run({ editor, env, container, get, click, input, locale, act, tick, calibration, buildCadDxf });
  } finally { await act(async () => root.unmount()); editor.dispose(); container.remove(); env.restore(); }
}

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

describe('Production clipart docker', () => {
  it('searches translated labels, prevents hidden-result insertion and preserves proportions', async () => {
    await harness(async ({ editor, container, get, click, input, locale, act, tick, calibration, buildCadDxf }) => {
      assert.equal(container.querySelectorAll('.drawing-clipart-list li').length, 35);
      await input('drawing-clipart-search', 'arrow');
      assert.equal(container.querySelectorAll('.drawing-clipart-list li').length, 7);
      assert.equal(container.querySelector('.drawing-clipart-form'), null, 'a hidden old selection must not remain insertable');
      await act(async () => locale.set('ru')); await tick();
      await input('drawing-clipart-search', 'сердце');
      assert.equal(container.querySelectorAll('.drawing-clipart-list li').length, 1);
      await click('drawing-clipart-heart');
      assert.equal((get('drawing-clipart-lock-aspect') as HTMLInputElement).checked, true);
      await input('drawing-clipart-width', '200');
      assert.equal((get('drawing-clipart-height') as HTMLInputElement).value, '180');
      await click('drawing-clipart-insert');
      const shape = editor.getOnlySelectedShape(); assert.equal(shape?.type, 'cad-bezier');
      assert.ok(shape.props.contours[0].nodes.some((node: any) => node.inX || node.outY));
      const exported = buildCadDxf(editor, 'selected', calibration.readCadSettings(editor));
      near(exported.widthMm, 200); near(exported.heightMm, 180);
      assert.deepEqual(exported.omitted, []);
      await act(async () => editor.undo()); await tick(); assert.equal(editor.getCurrentPageShapeIds().size, 0);
      await input('drawing-clipart-search', 'not-a-template');
      assert.ok(get('drawing-clipart-empty'));
      assert.equal(container.querySelector('.drawing-clipart-form'), null);
      const search = get('drawing-clipart-search');
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      assert.equal(editor.getCurrentPageShapeIds().size, 0);
      await act(async () => locale.set('lv')); await tick();
      await input('drawing-clipart-search', 'bulta');
      assert.equal(container.querySelectorAll('.drawing-clipart-list li').length, 7);
    });
  });

  it('inserts a grouped cutout at real millimetre size on an inch drawing and respects read-only', async () => {
    await harness(async ({ editor, get, click, input, act, tick, calibration, buildCadDxf }) => {
      await act(async () => calibration.writeCadSettings(editor, { ...calibration.readCadSettings(editor), unit: 'in', scale: 10 })); await tick();
      await click('drawing-clipart-washer');
      await input('drawing-clipart-width', '50');
      await click('drawing-clipart-insert');
      const group = editor.getOnlySelectedShape(); assert.equal(group?.type, 'group');
      const members = [...editor.getShapeAndDescendantIds([group.id])].map(id => editor.getShape(id)).filter(shape => shape.type !== 'group');
      assert.equal(members.length, 2); assert.ok(members.every(shape => shape.type === 'cad-ellipse'));
      const exported = buildCadDxf(editor, 'selected', calibration.readCadSettings(editor));
      near(exported.widthMm, 50); near(exported.heightMm, 50); assert.equal(exported.closedContours, 2);
      await act(async () => editor.undo()); await tick(); assert.equal(editor.getCurrentPageShapeIds().size, 0);
      await input('drawing-clipart-width', '-5');
      assert.equal(get('drawing-clipart-insert').matches(':disabled'), true);
      await input('drawing-clipart-width', '50');
      await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
      assert.equal(get('drawing-clipart-insert').matches(':disabled'), true);
      assert.equal(get('drawing-clipart-width').matches(':disabled'), true);
    });
  });
});
