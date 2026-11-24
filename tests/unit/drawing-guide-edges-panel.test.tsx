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
  return { restore() {
    channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  } };
}

async function harness(run: (h: any) => Promise<void>) {
  const env = environment();
  const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client');
  const tldraw = await import('@tldraw/tldraw');
  const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
  const { DrawingGuideAlignment } = await import('../../src/lib/components/canvas/DrawingGuideAlignment');
  const guides = await import('../../src/lib/components/canvas/drawing-guides');
  const { CadEllipseShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadShapes');
  const { getCadShapePageProjection } = await import('../../src/lib/components/canvas/cad-projected-bounds');
  const { locale } = await import('svelte-i18n'); locale.set('en');
  const container = document.createElement('div'); document.body.append(container);
  const shapeUtils = [...tldraw.defaultShapeUtils, CadEllipseShapeUtil];
  const editor = new tldraw.Editor({
    store: tldraw.createTLStore({ shapeUtils, bindingUtils: tldraw.defaultBindingUtils }), shapeUtils,
    bindingUtils: tldraw.defaultBindingUtils, tools: [...tldraw.defaultTools, ...tldraw.defaultShapeTools],
    getContainer: () => container, initialState: 'select',
  });
  editor.updateViewportScreenBounds(new tldraw.Box(0, 0, 800, 600)); editor.updateInstanceState({ isFocused: true });
  assert.equal(guides.applyDrawingGuideChange(editor, guides.prepareDrawingGuideChange(editor,
    { kind: 'add', id: 'guide:edges', axis: 'angle', pivot: { x: 0, y: 0 }, angle: 31 })), true);
  const root = createRoot(container);
  function Panel() {
    const guide = tldraw.useValue('edge test guideline', () => guides.readDrawingGuides(editor).guides[0] ?? null, [editor]);
    return <EditorContext.Provider value={editor}><DrawingGuideAlignment guide={guide} /></EditorContext.Provider>;
  }
  const tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); };
  const get = (testId: string) => { const element = container.querySelector(`[data-testid="${testId}"]`) as HTMLElement; assert.ok(element, testId); return element; };
  const click = async (testId: string) => { await act(async () => get(testId).click()); await tick(); };
  const projection = (id: string) => getCadShapePageProjection(editor, editor.getShape(id)!, guides.drawingGuideLine(guides.readDrawingGuides(editor).guides[0]).normal)!;
  const pointer = async (name: string, point: { x: number; y: number }, extra = {}) => {
    await act(async () => editor.dispatch({ type: 'pointer', name, point: { ...point, z: .5 }, target: 'canvas', button: 0, pointerId: 1, isPen: false,
      shiftKey: false, ctrlKey: false, altKey: false, ...extra } as any)); await tick();
  };
  try {
    await act(async () => root.render(<Panel />)); await tick();
    await run({ editor, container, get, click, projection, locale, act, tick, pointer, guides });
  } finally { await act(async () => root.unmount()); editor.dispose(); container.remove(); env.restore(); }
}

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
describe('Angled guideline edge actions with a real React and tldraw editor', () => {
  it('aligns exact motif and individual edges, retains native curves, and supports one undo/redo', async () => {
    await harness(async ({ editor, container, get, click, projection, act, tick }) => {
      await act(async () => {
        editor.createShapes([
          { id: 'shape:ellipse', type: 'cad-ellipse', x: 100, y: 60, rotation: Math.PI / 7, props: { w: 80, h: 30 } },
          { id: 'shape:line', type: 'line', x: 250, y: 100, props: { spline: 'cubic', dash: 'solid', points: {
            a1: { id: 'a1', index: 'a1', x: 0, y: 0 }, a2: { id: 'a2', index: 'a2', x: 80, y: 100 },
            a3: { id: 'a3', index: 'a3', x: 150, y: -20 }, a4: { id: 'a4', index: 'a4', x: 160, y: -80 },
          } } },
        ]);
        editor.select('shape:ellipse', 'shape:line');
      }); await tick();
      for (const alignment of ['start', 'center', 'end']) assert.equal(get(`drawing-guide-align-${alignment}`).matches(':disabled'), false);
      const before = structuredClone(editor.getSelectedShapes());
      await click('drawing-guide-align-start');
      near(Math.min(projection('shape:ellipse').min, projection('shape:line').min), 0);
      const after = structuredClone(editor.getSelectedShapes());
      near(after[0].x - before[0].x, after[1].x - before[1].x);
      near(after[0].y - before[0].y, after[1].y - before[1].y);
      for (let i = 0; i < 2; i++) { assert.deepEqual(after[i].props, before[i].props); assert.equal(after[i].rotation, before[i].rotation); }
      assert.match(container.querySelector('[role="status"]')?.textContent ?? '', /Artwork aligned/);
      await act(async () => editor.undo()); await tick(); assert.deepEqual(editor.getSelectedShapes(), before);
      await act(async () => editor.redo()); await tick(); assert.deepEqual(editor.getSelectedShapes(), after);
      await click('drawing-guide-align-together'); await click('drawing-guide-align-end');
      near(projection('shape:ellipse').max, 0); near(projection('shape:line').max, 0);
      assert.equal(editor.getShape('shape:line').type, 'line');
    });
  });

  it('explains unsupported exact edges, keeps center usable, and localizes all three actions', async () => {
    await harness(async ({ editor, container, get, click, locale, act, tick }) => {
      await act(async () => {
        editor.createShape({ id: 'shape:cloud', type: 'geo', x: 200, y: 150, props: { geo: 'cloud', dash: 'solid' } });
        editor.select('shape:cloud');
      }); await tick();
      assert.equal(get('drawing-guide-align-start').matches(':disabled'), true);
      assert.equal(get('drawing-guide-align-end').matches(':disabled'), true);
      assert.equal(get('drawing-guide-align-center').matches(':disabled'), false);
      const describedBy = get('drawing-guide-align-start').getAttribute('aria-describedby');
      assert.ok(describedBy); assert.match(document.getElementById(describedBy!)?.textContent ?? '', /native hearts\/clouds/);
      const before = structuredClone(editor.getShape('shape:cloud'));
      await click('drawing-guide-align-start'); assert.deepEqual(editor.getShape('shape:cloud'), before);
      await click('drawing-guide-align-center'); assert.notDeepEqual(editor.getShape('shape:cloud'), before);
      for (const [language, start, end] of [['ru', 'Начальный край', 'Конечный край'], ['lv', 'Sākuma mala', 'Beigu mala']]) {
        await act(async () => locale.set(language)); await tick();
        assert.equal(get('drawing-guide-align-start').textContent, start); assert.equal(get('drawing-guide-align-end').textContent, end);
      }
      await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
      for (const alignment of ['start', 'center', 'end', 'together']) assert.equal(get(`drawing-guide-align-${alignment}`).matches(':disabled'), true);
      assert.ok(container.querySelector('[role="status"]'));
    });
  });

  it('blocks edge actions during a native gesture and keeps the canceled gesture out of alignment history', async () => {
    await harness(async ({ editor, get, click, projection, act, tick, pointer, guides }) => {
      await act(async () => {
        editor.createShape({ id: 'shape:box', type: 'geo', x: 100, y: 100, props: { w: 80, h: 40, dash: 'solid' } });
        editor.select('shape:box');
      }); await tick();
      const before = structuredClone(editor.getShape('shape:box'));
      await pointer('pointer_down', { x: 110, y: 110 }, { target: 'shape', shape: editor.getShape('shape:box') });
      await pointer('pointer_move', { x: 160, y: 150 });
      assert.equal(guides.drawingGuidesBusy(editor), true);
      for (const alignment of ['start', 'center', 'end']) assert.equal(get(`drawing-guide-align-${alignment}`).matches(':disabled'), true);
      await act(async () => editor.cancel()); await tick();
      assert.deepEqual(editor.getShape('shape:box'), before);
      await click('drawing-guide-align-end'); near(projection('shape:box').max, 0);
      await act(async () => editor.undo()); await tick(); assert.deepEqual(editor.getShape('shape:box'), before);
    });
  });
});
