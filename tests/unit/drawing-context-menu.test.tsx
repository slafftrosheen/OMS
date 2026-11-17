import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Keep jsdom external to the lightweight runner's esbuild bundle: its runtime
// loads its own packaged resources. No browser process or network is needed.
const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');

function domEnvironment() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/', pretendToBeVisual: true,
  });
  const win = dom.window;
  win.fetch = globalThis.fetch.bind(globalThis);
  const values: Record<string, unknown> = {};
  // Bundled React act uses its browser MessageChannel fallback. Own and close
  // those real Node ports with this DOM so the lightweight runner can exit.
  const channels: MessageChannel[] = [];
  const NativeMessageChannel = globalThis.MessageChannel;
  values.MessageChannel = class extends NativeMessageChannel {
    constructor() { super(); channels.push(this); }
  };
  for (const key of ['window', 'document', 'navigator', 'self', 'Element', 'HTMLElement', 'HTMLInputElement',
    'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'SVGElement', 'Node', 'NodeFilter',
    'Event', 'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent', 'FocusEvent', 'DOMRect',
    'MutationObserver', 'Image', 'localStorage']) values[key] = key === 'window' || key === 'self' ? win : win[key];
  const media = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  win.matchMedia = media;
  win.HTMLElement.prototype.setPointerCapture = () => {};
  win.HTMLElement.prototype.releasePointerCapture = () => {};
  win.HTMLElement.prototype.hasPointerCapture = () => false;
  win.HTMLImageElement.prototype.decode = async () => {};
  values.matchMedia = media;
  values.getComputedStyle = win.getComputedStyle.bind(win);
  values.requestAnimationFrame = win.requestAnimationFrame.bind(win);
  values.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
  values.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  values.IS_REACT_ACT_ENVIRONMENT = true;
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  return { win, restore() {
    for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  } };
}

async function harness(run: (value: any) => Promise<void>) {
  const env = domEnvironment();
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const tldraw = await import('@tldraw/tldraw');
  // These are the same providers/hooks used by installed tldraw 2.4.6, with a
  // small canvas so tests exercise the real menu and editor event handlers.
  const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
  const { EditorComponentsProvider } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditorComponents.mjs');
  const { useCanvasEvents } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useCanvasEvents.mjs');
  const { useDocumentEvents } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useDocumentEvents.mjs');
  const { AssetUrlsProvider } = await import('../../node_modules/tldraw/dist-esm/lib/ui/context/asset-urls.mjs');
  const { TranslationProvider } = await import('../../node_modules/tldraw/dist-esm/lib/ui/hooks/useTranslation/useTranslation.mjs');
  const { UiEventsProvider } = await import('../../node_modules/tldraw/dist-esm/lib/ui/context/events.mjs');
  const { BreakPointProvider } = await import('../../node_modules/tldraw/dist-esm/lib/ui/context/breakpoints.mjs');
  const { DrawingContextMenu, openDrawingContextMenu } = await import('../../src/lib/components/canvas/DrawingContextMenu');
  const requests = await import('../../src/lib/components/canvas/drawing-ui-requests');
  const { t } = await import('svelte-i18n');
  // The surrounding Svelte application keeps the translator subscribed.
  const stopTranslation = t.subscribe(() => {});
  const viewport = document.createElement('div'); viewport.className = 'drawing-viewport';
  const container = document.createElement('div'); container.className = 'tl-container'; container.tabIndex = 0;
  viewport.append(container); document.body.append(viewport);
  const rect = env.win.DOMRect.fromRect({ x: 100, y: 60, width: 800, height: 600 });
  container.getBoundingClientRect = () => rect;
  const editor = new tldraw.Editor({
    store: tldraw.createTLStore({ shapeUtils: tldraw.defaultShapeUtils, bindingUtils: tldraw.defaultBindingUtils }),
    shapeUtils: tldraw.defaultShapeUtils, bindingUtils: tldraw.defaultBindingUtils,
    tools: [...tldraw.defaultTools, ...tldraw.defaultShapeTools], getContainer: () => container,
    initialState: 'select',
  });
  editor.updateViewportScreenBounds(new tldraw.Box(100, 60, 800, 600));
  editor.updateInstanceState({ isFocused: true });
  function Canvas() {
    useDocumentEvents();
    const events = useCanvasEvents();
    return <div className="tl-canvas" tabIndex={0} {...events} ref={node => { if (node) node.getBoundingClientRect = () => rect; }}>
      <div onPointerDown={event => event.stopPropagation()}>
        <input aria-label="Draft address" defaultValue="Rīga" />
        <textarea aria-label="Draft notes" defaultValue="Production" />
        <div contentEditable suppressContentEditableWarning aria-label="Editable text">Lettering</div>
        <div contentEditable="plaintext-only" suppressContentEditableWarning aria-label="Plain text"><span>Lettering</span></div>
        <div {...{ contentEditable: '' as any }} suppressContentEditableWarning aria-label="Inherited editable"><span>Lettering</span></div>
        <a href="https://example.test/file">File</a>
      </div>
    </div>;
  }
  const root = createRoot(container);
  const sent: unknown[] = [];
  const received = (event: Event) => sent.push((event as CustomEvent).detail);
  container.addEventListener(requests.DRAWING_UI_REQUEST, received);
  try {
    await act(async () => {
      root.render(<tldraw.ContainerProvider container={container}>
        <EditorContext.Provider value={editor}>
          <EditorComponentsProvider overrides={{ Canvas }}>
            <AssetUrlsProvider assetUrls={{ icons: { 'chevron-right': 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' }, embedIcons: {}, translations: { en: 'data:application/json,{}' } } as any}>
              <TranslationProvider><UiEventsProvider><BreakPointProvider>
                <DrawingContextMenu />
              </BreakPointProvider></UiEventsProvider></TranslationProvider>
            </AssetUrlsProvider>
          </EditorComponentsProvider>
        </EditorContext.Provider>
      </tldraw.ContainerProvider>);
    });
    const canvas = container.querySelector('.tl-canvas') as HTMLElement;
    assert.ok(canvas, 'real context-menu wrapper renders its canvas');
    const tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
    const open = async () => { await act(async () => { assert.equal(openDrawingContextMenu(editor), true); }); await tick(); };
    const key = async (element: Element, value: string, options = {}) => {
      await act(async () => { element.dispatchEvent(new KeyboardEvent('keydown', { key: value, code: value, bubbles: true, cancelable: true, ...options })); });
      await tick();
    };
    const pointer = async (element: Element, name: string, pointerType: string, options = {}) => {
      const event = new MouseEvent(name, { bubbles: true, cancelable: true, clientX: 300, clientY: 260, buttons: 1, ...options });
      Object.defineProperties(event, {
        pointerId: { value: 1 }, pointerType: { value: pointerType }, isPrimary: { value: true }, pressure: { value: 0.5 },
      });
      await act(async () => { element.dispatchEvent(event); }); await tick();
    };
    const add = async (name: string, x = 100, y = 100) => {
      const id = tldraw.createShapeId(name);
      await act(async () => { editor.createShape({ id, type: 'geo', x, y, props: { w: 80, h: 40 } }); editor.select(id); });
      return id;
    };
    await run({ env, editor, container, canvas, rect, sent, requests, open, key, pointer, tick, add, act, openDrawingContextMenu });
  } finally {
    await act(async () => root.unmount());
    editor.dispose(); stopTranslation(); viewport.remove(); env.restore();
  }
}

describe('OMS context menu with native tldraw and Radix', () => {
  it('opens at selection coordinates, keeps keyboard navigation out of geometry, and closes on Escape', async () => {
    await harness(async ({ editor, container, canvas, open, key, add }) => {
      const id = await add('label');
      const before = structuredClone(editor.getShape(id));
      let point: { x: number; y: number } | undefined;
      canvas.addEventListener('contextmenu', (event: MouseEvent) => { point = { x: event.clientX, y: event.clientY }; });
      await open();
      assert.deepEqual(point, { x: 240, y: 180 });
      const menu = container.querySelector('[role="menu"]'); assert.ok(menu);
      assert.equal(editor.getIsMenuOpen(), true);
      await key(menu, 'ArrowDown');
      assert.equal(document.activeElement?.getAttribute('role'), 'menuitem');
      await key(document.activeElement!, 'ArrowDown');
      await key(document.activeElement!, 'ArrowRight');
      assert.deepEqual(editor.getShape(id), before);
      await key(document.activeElement!, 'Escape');
      assert.equal(editor.getIsMenuOpen(), false);
      assert.deepEqual(editor.getSelectedShapeIds(), [id]);
    });
  });

  it('uses the visible viewport for empty and offscreen selections', async () => {
    await harness(async ({ editor, canvas, open, key, add }) => {
      const points: number[][] = [];
      canvas.addEventListener('contextmenu', (event: MouseEvent) => points.push([event.clientX, event.clientY]));
      await open(); assert.deepEqual(points.at(-1), [500, 360]);
      await key(document.activeElement!, 'Escape');
      await add('outside', 5000, -5000);
      await open(); assert.deepEqual(points.at(-1), [892, 68]);
      assert.equal(editor.getSelectedShapeIds().length, 1);
    });
  });

  it('preserves native form, editable-text and link context menus', async () => {
    await harness(async ({ editor, container, add, act }) => {
      await add('label');
      for (const selector of ['input', 'textarea', '[contenteditable="true"]',
        '[contenteditable="plaintext-only"] span', '[contenteditable=""] span', 'a[href]']) {
        const target = container.querySelector(selector)!;
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
        await act(async () => { target.dispatchEvent(event); });
        assert.equal(event.defaultPrevented, false, selector);
        assert.equal(editor.getIsMenuOpen(), false, selector);
      }
    });
  });

  it('hides mutation actions for read-only and locked selections while keeping inspection available', async () => {
    await harness(async ({ editor, container, add, open, key, act }) => {
      const id = await add('guarded');
      for (const mode of ['locked', 'readonly']) {
        await act(async () => {
          editor.updateInstanceState({ isReadonly: false });
          editor.run(() => editor.updateShape({ id, type: 'geo', isLocked: mode === 'locked' }), { ignoreShapeLock: true });
          editor.select(id); editor.updateInstanceState({ isReadonly: mode === 'readonly' });
        });
        await open();
        assert.equal(container.querySelector('[data-testid="context-menu.oms-delete"]'), null);
        assert.equal(container.querySelector('[data-testid="context-menu.oms-duplicate"]'), null);
        assert.equal(container.querySelector('[data-testid="context-menu-sub-trigger.oms-transform"]'), null);
        assert.ok(container.querySelector('[data-testid="context-menu.oms-properties"]'));
        await key(document.activeElement!, 'Escape');
      }
    });
  });

  it('sends a typed command only to its owning editor container and closes after activation', async () => {
    await harness(async ({ editor, container, add, open, key, sent, requests, act }) => {
      await add('command');
      let escaped = false;
      const outside = () => { escaped = true; };
      document.body.addEventListener(requests.DRAWING_UI_REQUEST, outside);
      try {
        await open();
        const duplicate = container.querySelector('[data-testid="context-menu.oms-duplicate"]') as HTMLElement;
        assert.ok(duplicate); await act(async () => duplicate.focus()); await key(duplicate, 'Enter');
        assert.deepEqual(sent, [{ kind: 'command', action: 'duplicate' }]);
        assert.equal(escaped, false); assert.equal(editor.getIsMenuOpen(), false);
        assert.equal(requests.isDrawingUiRequest({ kind: 'command', action: 'delete-all' }), false);
        assert.equal(requests.isDrawingUiRequest({ kind: 'panel', action: 'duplicate' }), false);
      } finally { document.body.removeEventListener(requests.DRAWING_UI_REQUEST, outside); }
    });
  });

  it('uses native submenu keyboard navigation and displays whole key names', async () => {
    await harness(async ({ editor, container, add, open, key, act }) => {
      const id = await add('ordered');
      const before = structuredClone(editor.getShape(id));
      await open();
      assert.equal(container.querySelector('[data-testid="context-menu.oms-outline"] kbd')?.textContent, 'F12');
      assert.equal(container.querySelector('[data-testid="context-menu.oms-fit-selection"] kbd')?.textContent, 'Shift+F2');
      const order = container.querySelector('[data-testid="context-menu-sub-trigger.oms-order"]') as HTMLElement;
      assert.ok(order); await act(async () => order.focus()); await key(order, 'ArrowRight');
      assert.ok(container.querySelector('[data-testid="context-menu-sub-content.oms-order"]'));
      for (const [name, shortcut] of [['front', 'Ctrl+Home'], ['forward', 'Ctrl+PageUp'], ['backward', 'Ctrl+PageDown'], ['back', 'Ctrl+End']]) {
        const item = container.querySelector(`[data-testid="context-menu.oms-${name}"]`)!;
        assert.equal(item.querySelectorAll('kbd').length, 1);
        assert.equal(item.querySelector('kbd')?.textContent, shortcut);
      }
      await key(document.activeElement!, 'ArrowDown');
      await key(document.activeElement!, 'ArrowLeft');
      assert.equal(container.querySelector('[data-testid="context-menu-sub-content.oms-order"]'), null);
      assert.equal(document.activeElement, order);
      assert.deepEqual(editor.getShape(id), before);
      await key(order, 'Escape');
      assert.equal(editor.getIsMenuOpen(), false);
      assert.deepEqual(editor.getSelectedShapeIds(), [id]);
    });
  });

  it('does not complete touch or pen drawing gestures when a long-press timer could open a menu', async () => {
    await harness(async ({ editor, canvas, pointer, act }) => {
      for (const pointerType of ['touch', 'pen']) {
        await act(async () => { editor.setCurrentTool('draw'); });
        await pointer(canvas, 'pointerdown', pointerType);
        assert.equal(editor.getPath(), 'draw.drawing');
        const before = structuredClone(editor.getCurrentPageShapes());
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 750)); });
        assert.equal(editor.getIsMenuOpen(), false, pointerType);
        assert.equal(editor.getPath(), 'draw.drawing', pointerType);
        assert.deepEqual(editor.getCurrentPageShapes(), before);
        await pointer(canvas, 'pointerup', pointerType, { buttons: 0 });
      }
    });
  });

  it('refuses mouse and keyboard opening while a drawing tool is active', async () => {
    await harness(async ({ editor, canvas, act, openDrawingContextMenu }) => {
      await act(async () => { editor.setCurrentTool('draw'); });
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
      await act(async () => { canvas.dispatchEvent(event); });
      assert.equal(event.defaultPrevented, true);
      assert.equal(editor.getIsMenuOpen(), false);
      assert.equal(openDrawingContextMenu(editor), false);
      assert.equal(editor.getCurrentToolId(), 'draw');
    });
  });
});
