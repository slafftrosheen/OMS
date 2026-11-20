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
  // Native Timers creates browser numeric IDs; Editor cancels them through the
  // global clear functions. Node's globals cannot cancel a jsdom numeric ID.
  const clearNodeTimeout = globalThis.clearTimeout, clearNodeInterval = globalThis.clearInterval;
  values.clearTimeout = (id: any) => typeof id === 'number' ? win.clearTimeout(id) : clearNodeTimeout(id);
  values.clearInterval = (id: any) => typeof id === 'number' ? win.clearInterval(id) : clearNodeInterval(id);
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
  const env = domEnvironment(), React = await import('react'), { act } = React;
  const { createRoot } = await import('react-dom/client');
  const tldraw = await import('@tldraw/tldraw');
  const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
  const { EditorComponentsProvider } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditorComponents.mjs');
  const { useCanvasEvents } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useCanvasEvents.mjs');
  const { useDocumentEvents } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useDocumentEvents.mjs');
  const { useHandleEvents } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useHandleEvents.mjs');
  const { CadPathShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadShapes');
  const { CadBezierShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadBezierShape');
  const { DrawingPickSelectionForeground, DrawingPickHandles } = await import('../../src/lib/components/canvas/DrawingPickSelectionForeground');
  const skew = await import('../../src/lib/components/canvas/drawing-pick-skew');
  const nodes = await import('../../src/lib/components/canvas/cad-node-selection');
  const feature = await import('../../src/lib/components/canvas/drawing-pick-click-toggle');
  const { nodeAt } = await import('../../src/lib/components/canvas/cad-curves');
  const shapeUtils = [...tldraw.defaultShapeUtils, CadPathShapeUtil, CadBezierShapeUtil];
  const fixtures: Array<{ dispose: () => Promise<void> }> = [];
  const tick = async (duration = 24) => { await act(async () => { await new Promise(resolve => setTimeout(resolve, duration)); }); };
  async function makeCanvas(enabled = true) {
    const container = document.createElement('div'); container.className = 'tl-container'; container.tabIndex = 0;
    document.body.append(container);
    const rect = env.win.DOMRect.fromRect({ x: 100 + fixtures.length * 1000, y: 60, width: 800, height: 600 });
    container.getBoundingClientRect = () => rect;
    const editor = new tldraw.Editor({
      store: tldraw.createTLStore({ shapeUtils, bindingUtils: tldraw.defaultBindingUtils }), shapeUtils,
      bindingUtils: tldraw.defaultBindingUtils, tools: [...tldraw.defaultTools, ...tldraw.defaultShapeTools],
      getContainer: () => container, initialState: 'select', options: { doubleClickDurationMs: 180, multiClickDurationMs: 100 },
    });
    editor.updateViewportScreenBounds(new tldraw.Box(rect.x, rect.y, rect.width, rect.height));
    editor.updateInstanceState({ isFocused: true });
    const stopSkew = skew.installDrawingSkewMode(editor), stopNodes = nodes.installCadNodeSelection(editor);
    const stopToggle = enabled ? feature.installDrawingPickClickToggle(editor) : () => {};
    const eventsSeen: string[] = [];
    editor.on('event', (event: any) => { if (event.type === 'pointer' || event.type === 'click') eventsSeen.push(`${event.name}:${event.phase ?? ''}`); });
    function Handle({ shapeId, handleId }: { shapeId: any; handleId: string }) {
      const events = useHandleEvents(shapeId, handleId);
      return <g {...events} data-testid="native-node-handle"><circle r={6} /></g>;
    }
    function Canvas() {
      useDocumentEvents();
      const events = useCanvasEvents();
      const value = tldraw.useValue('Pick test state', () => {
        const shape = editor.getOnlySelectedShape();
        return { ids: editor.getSelectedShapeIds(), bounds: editor.getSelectionRotatedPageBounds(), rotation: editor.getSelectionRotation(),
          shape, handle: shape ? editor.getShapeHandles(shape)?.[0] : undefined };
      }, []);
      return <div className="tl-canvas" tabIndex={0} {...events}>
        <span data-testid="rendered-selection">{value.ids.join(',')}</span>
        <DrawingPickHandles>{value.shape && value.handle && <Handle shapeId={value.shape.id} handleId={value.handle.id}/>}</DrawingPickHandles>
        {value.bounds && <DrawingPickSelectionForeground bounds={value.bounds} rotation={value.rotation}/>}
        <div onPointerDown={event => event.stopPropagation()}>
          <input aria-label="Form field"/><textarea/><select><option>Form option</option></select><button>Form button</button>
          <a href="#file">File</a><div contentEditable suppressContentEditableWarning><span>Editable</span></div>
          <div contentEditable="plaintext-only" suppressContentEditableWarning><span>Plain text</span></div>
          <audio controls/><video controls/><iframe title="Embedded document"/>
          <span data-drawing-rotation-pivot="true">Pivot</span>
        </div>
      </div>;
    }
    const root = createRoot(container);
    await act(async () => root.render(<tldraw.ContainerProvider container={container}>
      <EditorContext.Provider value={editor}><EditorComponentsProvider><Canvas/></EditorComponentsProvider></EditorContext.Provider>
    </tldraw.ContainerProvider>));
    const canvas = container.querySelector('.tl-canvas')!;
    const screen = (point: { x: number; y: number }) => editor.pageToScreen(point);
    const pointer = async (name: string, point: { x: number; y: number }, options: any = {}, target: EventTarget = canvas) => {
      const { pointerId = 1, pointerType = 'mouse', isPrimary = true, ...mouse } = options;
      const event = new MouseEvent(name, { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y,
        buttons: name === 'pointerup' ? 0 : 1, ...mouse });
      Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType }, isPrimary: { value: isPrimary }, pressure: { value: .5 } });
      await act(async () => target.dispatchEvent(event));
      if (name === 'pointermove') await tick();
      return event;
    };
    const click = async (point = { x: 150, y: 100 }, options = {}, target: EventTarget = canvas) => {
      await pointer('pointerdown', screen(point), options, target); await pointer('pointerup', screen(point), options, target);
    };
    const settle = () => tick(editor.options.doubleClickDurationMs + 30);
    const add = async (name = 'a', extra = {}) => {
      const id = tldraw.createShapeId(name);
      await act(async () => editor.createShape({ id, type: 'cad-path', x: 100, y: 100, parentId: editor.getCurrentPageId(),
        props: { closed: true, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }] }, ...extra } as any));
      return id;
    };
    const select = async (...ids: any[]) => { await act(async () => { editor.select(...ids); }); await tick(); };
    const group = async (nested = false) => {
      const a = await add('group-a'), b = await add('group-b', { x: 270, y: 120 });
      await act(async () => { editor.select(a, b); editor.groupShapes([a, b]); });
      const inner = editor.getOnlySelectedShapeId()!;
      let outer = inner;
      if (nested) {
        const c = await add('group-c', { x: 440, y: 150 });
        await act(async () => { editor.select(inner, c); editor.groupShapes([inner, c]); }); outer = editor.getOnlySelectedShapeId()!;
      }
      await tick(); return { a, b, inner, outer };
    };
    const dispose = async () => { await act(async () => { stopToggle(); root.unmount(); stopSkew(); stopNodes(); }); editor.dispose(); container.remove(); };
    fixtures.push({ dispose });
    return { editor, container, canvas, screen, pointer, click, settle, add, select, group, stopToggle, eventsSeen };
  }
  try { await run({ env, makeCanvas, act, tick, tldraw, skew, nodes, nodeAt, feature }); }
  finally { for (const fixture of fixtures.reverse()) await fixture.dispose(); env.restore(); }
}

describe('Corel ordinary repeated Pick click through native tldraw events', () => {
  it('keeps first selection click native, then toggles on ordinary repeated clicks without document writes', async () => {
    await harness(async ({ makeCanvas, skew }) => {
      const f = await makeCanvas(), id = await f.add(); const before = structuredClone(f.editor.getShape(id));
      await f.click(); await f.settle(); assert.deepEqual(f.editor.getSelectedShapeIds(), [id]); assert.equal(skew.isDrawingSkewMode(f.editor), false);
      await f.click(); assert.equal(skew.isDrawingSkewMode(f.editor), false); await f.settle(); assert.equal(skew.isDrawingSkewMode(f.editor), true);
      await f.click(); await f.settle(); assert.equal(skew.isDrawingSkewMode(f.editor), false, JSON.stringify(f.eventsSeen));
      assert.deepEqual(f.editor.getShape(id), before); assert.equal(f.editor.getPath(), 'select.idle');
    });
  });

  it('retains selected groups and full multiselections throughout the pending click, before handles change', async () => {
    await harness(async ({ makeCanvas, skew, tick }) => {
      const f = await makeCanvas(), g = await f.group(true);
      const before = structuredClone(f.editor.getCurrentPageShapesSorted());
      await f.click(); await tick();
      assert.deepEqual(f.editor.getSelectedShapeIds(), [g.outer]);
      assert.equal(f.container.querySelector('[data-testid="rendered-selection"]')?.textContent, g.outer);
      await f.settle(); assert.equal(skew.isDrawingSkewMode(f.editor), true); assert.deepEqual(f.editor.getSelectedShapeIds(), [g.outer]);
      await f.select(g.a, g.b); await f.click(); await tick();
      assert.deepEqual(f.editor.getSelectedShapeIds(), [g.a, g.b]);
      await f.settle(); assert.equal(skew.isDrawingSkewMode(f.editor), false); assert.deepEqual(f.editor.getSelectedShapeIds(), [g.a, g.b]);
      assert.deepEqual(f.editor.getCurrentPageShapesSorted(), before);
    });
  });

  it('preserves native double-click drill-in for nested groups without a temporary mode toggle', async () => {
    await harness(async ({ makeCanvas, skew, act }) => {
      const results: any[] = [];
      for (const enabled of [false, true]) {
        const f = await makeCanvas(enabled), g = await f.group(true), beforeCount = f.editor.getCurrentPageShapesSorted().length;
        await f.click(); await f.click(); await f.settle();
        const selected = f.editor.getSelectedShapes().map((shape: any) => shape.id === g.a ? 'a' : shape.id === g.inner ? 'inner' : shape.id === g.outer ? 'outer' : shape.type);
        const focused = f.editor.getFocusedGroupId() === g.inner ? 'inner' : f.editor.getFocusedGroupId() === g.outer ? 'outer' : 'page';
        results.push({ selected, focused, path: f.editor.getPath(), added: f.editor.getCurrentPageShapesSorted().length - beforeCount,
          doubleClicks: f.eventsSeen.filter((event: string) => event.startsWith('double_click:')), mode: skew.isDrawingSkewMode(f.editor) });
        await act(async () => f.editor.complete());
      }
      assert.deepEqual(results[1], results[0]); assert.equal(results[1].mode, false);
      assert.ok(results[1].doubleClicks.includes('double_click:down')); assert.ok(results[1].doubleClicks.includes('double_click:up'));
    });
  });

  it('matches native triple-click and double-click behavior when Rotate/skew mode was already active', async () => {
    await harness(async ({ makeCanvas, skew, act }) => {
      for (const clicks of [2, 3]) {
        const results: any[] = [];
        for (const enabled of [false, true]) {
          const f = await makeCanvas(enabled), g = await f.group(true), count = f.editor.getCurrentPageShapesSorted().length;
          await act(async () => skew.setDrawingSkewMode(f.editor, true));
          for (let index = 0; index < clicks; index++) await f.click();
          await f.settle();
          results.push({ selected: f.editor.getSelectedShapes().map((shape: any) => shape.id === g.a ? 'a' : shape.id === g.inner ? 'inner' : shape.id === g.outer ? 'outer' : shape.type),
            focused: f.editor.getFocusedGroupId() === g.inner ? 'inner' : f.editor.getFocusedGroupId() === g.outer ? 'outer' : 'page',
            path: f.editor.getPath(), added: f.editor.getCurrentPageShapesSorted().length - count, mode: skew.isDrawingSkewMode(f.editor),
            phases: f.eventsSeen.filter((event: string) => event.includes('_click:')) });
        }
        assert.deepEqual(results[1], results[0], `${clicks} clicks`);
      }
    });
  });

  it('does not insert a document undo step or destroy redo while retaining a group selection', async () => {
    await harness(async ({ makeCanvas, act, skew }) => {
      const f = await makeCanvas(), g = await f.group(); const original = structuredClone(f.editor.getCurrentPageShapesSorted());
      await act(async () => {
        f.editor.mark('known move'); f.editor.updateShape({ id: g.outer, type: 'group', x: f.editor.getShape(g.outer).x + 40 }); f.editor.mark('known move end');
      });
      const moved = structuredClone(f.editor.getCurrentPageShapesSorted());
      await f.click({ x: 190, y: 100 }); await f.settle(); assert.equal(skew.isDrawingSkewMode(f.editor), true);
      await act(async () => f.editor.undo()); assert.deepEqual(f.editor.getCurrentPageShapesSorted(), original);
      assert.equal(f.editor.getCanRedo(), true);
      await f.click(); await f.settle(); assert.equal(skew.isDrawingSkewMode(f.editor), false); assert.equal(f.editor.getCanRedo(), true);
      await act(async () => f.editor.redo()); assert.deepEqual(f.editor.getCurrentPageShapesSorted(), moved);
    });
  });

  it('does not bail a document change made by another release handler, including a different page', async () => {
    await harness(async ({ makeCanvas, act, tldraw, feature, skew }) => {
      const f = await makeCanvas(), g = await f.group(), otherPage = tldraw.PageRecordType.createId('external');
      await act(async () => f.editor.createPage({ id: otherPage, name: 'Other page' }));
      f.stopToggle();
      const externalRelease = (event: any) => {
        if (event.type === 'pointer' && event.name === 'pointer_up') f.editor.updatePage({ id: otherPage, name: 'External update' });
      };
      f.editor.on('event', externalRelease);
      const stop = feature.installDrawingPickClickToggle(f.editor);
      try {
        await f.click(); await f.settle();
        assert.equal(f.editor.getPage(otherPage).name, 'External update');
        assert.deepEqual(f.editor.getSelectedShapeIds(), [g.a]); assert.equal(skew.isDrawingSkewMode(f.editor), false);
        await act(async () => f.editor.undo()); assert.equal(f.editor.getPage(otherPage).name, 'Other page');
      } finally { stop(); f.editor.off('event', externalRelease); }
    });
  });

  it('preserves native text double-click editing and CAD node-handle double-click behavior', async () => {
    await harness(async ({ makeCanvas, skew, act, nodes, nodeAt }) => {
      const states: any[] = [];
      for (const enabled of [false, true]) {
        const f = await makeCanvas(enabled), text = await f.add('label', { type: 'text', x: 100, y: 100, props: { text: 'Native lettering', w: 160, autoSize: false } });
        await f.select(text); const center = f.editor.getShapePageBounds(text).center;
        await f.click(center); await f.click(center); await f.settle();
        const textResult = { editing: f.editor.getEditingShapeId() === text, path: f.editor.getPath(), mode: skew.isDrawingSkewMode(f.editor) };
        await act(async () => f.editor.complete());
        const curve = await f.add('nodes', { type: 'cad-bezier', props: { contours: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }].map(nodeAt) }] } });
        await f.select(curve); await act(async () => nodes.setCadNodeEditing(f.editor, true));
        const handle = f.container.querySelector('[data-testid="native-node-handle"]')!; assert.ok(handle);
        const before = structuredClone(f.editor.getShape(curve));
        await f.click({ x: 100, y: 100 }, {}, handle); await f.click({ x: 100, y: 100 }, {}, handle); await f.settle();
        states.push({ textResult, nodeEditing: nodes.isCadNodeEditing(f.editor), nodeShape: f.editor.getShape(curve), before, mode: skew.isDrawingSkewMode(f.editor) });
      }
      assert.deepEqual(states[1], states[0]); assert.equal(states[1].textResult.editing, true); assert.equal(states[1].mode, false);
      assert.deepEqual(states[1].nodeShape, states[1].before);
    });
  });

  it('does not toggle after a drag, a drag that returns to its starting point, or a new click before the timer', async () => {
    await harness(async ({ makeCanvas, skew, act }) => {
      const f = await makeCanvas(), a = await f.add('a'), b = await f.add('b', { x: 400 }); await f.select(a);
      for (const returning of [false, true]) {
        const start = f.editor.getShapePageTransform(a).applyToPoint({ x: 50, y: 0 }), end = { x: start.x + 60, y: start.y + 40 };
        await f.pointer('pointerdown', f.screen(start)); await f.pointer('pointermove', f.screen(end));
        if (returning) await f.pointer('pointermove', f.screen(start));
        await f.pointer('pointerup', f.screen(returning ? start : end)); await f.settle();
        assert.equal(skew.isDrawingSkewMode(f.editor), false);
      }
      await act(async () => f.editor.updateShape({ id: a, type: 'cad-path', x: 100, y: 100 }));
      await f.click(); await f.click({ x: 450, y: 100 }); await f.settle();
      assert.deepEqual(f.editor.getSelectedShapeIds(), [b]); assert.equal(skew.isDrawingSkewMode(f.editor), false);
      await f.select(a); await f.click();
      await f.pointer('pointerdown', f.screen({ x: 150, y: 100 })); await f.pointer('pointermove', f.screen({ x: 210, y: 160 }));
      await f.pointer('pointerup', f.screen({ x: 210, y: 160 })); await f.settle(); assert.equal(skew.isDrawingSkewMode(f.editor), false);
      assert.equal(f.editor.getShape(a).x, 160);
    });
  });

  it('keeps Shift/Ctrl/Alt selection, right-click, and secondary pointers out of the toggle', async () => {
    await harness(async ({ makeCanvas, skew }) => {
      for (const options of [{ shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { button: 2, buttons: 2 }, { pointerId: 2, isPrimary: false, pointerType: 'touch' }]) {
        const states: any[] = [];
        for (const enabled of [false, true]) {
          const f = await makeCanvas(enabled), a = await f.add('a'), b = await f.add('b', { x: 400 }); await f.select(a, b);
          await f.click({ x: 150, y: 100 }, options); await f.settle();
          states.push({ selection: f.editor.getSelectedShapeIds(), path: f.editor.getPath(), shapes: f.editor.getCurrentPageShapesSorted(), mode: skew.isDrawingSkewMode(f.editor) });
        }
        assert.deepEqual(states[1], states[0], JSON.stringify(options)); assert.equal(states[1].mode, false);
      }
    });
  });

  it('ignores form/media controls, editable descendants, rotation pivots, and native handles', async () => {
    await harness(async ({ makeCanvas, skew }) => {
      const f = await makeCanvas(), id = await f.add(); await f.select(id); const before = structuredClone(f.editor.getShape(id));
      for (const selector of ['input', 'textarea', 'select', 'button', 'a', '[contenteditable="true"] span', '[contenteditable="plaintext-only"] span', 'audio', 'video', 'iframe', '[data-drawing-rotation-pivot]', '[data-testid="native-node-handle"]']) {
        const target = f.container.querySelector(selector)!; assert.ok(target, selector);
        await f.click({ x: 150, y: 100 }, {}, target); await f.settle(); assert.equal(skew.isDrawingSkewMode(f.editor), false, selector);
      }
      assert.deepEqual(f.editor.getShape(id), before);
    });
  });

  it('invalidates pending toggles when selection, document, camera, page, readonly or explicit mode changes', async () => {
    await harness(async ({ makeCanvas, skew, act, tldraw }) => {
      for (const reason of ['selection', 'document', 'camera', 'page', 'readonly', 'lock', 'mode', 'dispose']) {
        const f = await makeCanvas(), a = await f.add('a'), b = await f.add('b', { x: 400 }); await f.select(a); await f.click();
        await act(async () => {
          if (reason === 'selection') f.editor.select(b);
          if (reason === 'document') f.editor.updateShape({ id: b, type: 'cad-path', x: 420 });
          if (reason === 'camera') f.editor.setCamera({ x: 30, y: 20, z: 2 });
          if (reason === 'page') { const id = tldraw.PageRecordType.createId('other'); f.editor.createPage({ id, name: 'Other' }); f.editor.setCurrentPage(id); }
          if (reason === 'readonly') f.editor.updateInstanceState({ isReadonly: true });
          if (reason === 'lock') f.editor.updateShape({ id: a, type: 'cad-path', isLocked: true });
          if (reason === 'mode') skew.setDrawingSkewMode(f.editor, true);
          if (reason === 'dispose') f.stopToggle();
        });
        const selected = [...f.editor.getSelectedShapeIds()]; await f.settle();
        assert.equal(skew.isDrawingSkewMode(f.editor), reason === 'mode', reason); assert.deepEqual(f.editor.getSelectedShapeIds(), selected, reason);
      }
    });
  });

  it('never toggles locked descendants, readonly artwork, native shapes or mixed groups', async () => {
    await harness(async ({ makeCanvas, skew, act }) => {
      const f = await makeCanvas(), g = await f.group();
      await act(async () => f.editor.updateShape({ id: g.b, type: 'cad-path', isLocked: true }));
      await f.click(); await f.settle(); assert.equal(skew.isDrawingSkewMode(f.editor), false);
      const native = await f.add('native', { type: 'geo', props: { w: 100, h: 80 } }); await f.select(native);
      await f.click(); await f.settle(); assert.equal(skew.isDrawingSkewMode(f.editor), false);
      await act(async () => { f.editor.select(g.a, native); f.editor.groupShapes([g.a, native]); });
      await f.click(); await f.settle(); assert.equal(skew.isDrawingSkewMode(f.editor), false);
      await f.select(g.a); await act(async () => f.editor.updateInstanceState({ isReadonly: true }));
      await f.click(); await f.settle(); assert.equal(skew.isDrawingSkewMode(f.editor), false);
    });
  });

  it('keeps pending clicks editor-local and cancels the old editor when focus moves to another canvas', async () => {
    await harness(async ({ makeCanvas, skew }) => {
      const first = await makeCanvas(), a = await first.add(); await first.select(a);
      const second = await makeCanvas(), b = await second.add(); await second.select(b);
      await first.click(); await second.click(); await second.settle();
      assert.equal(skew.isDrawingSkewMode(first.editor), false); assert.equal(skew.isDrawingSkewMode(second.editor), true);
      assert.deepEqual(first.editor.getSelectedShapeIds(), [a]); assert.deepEqual(second.editor.getSelectedShapeIds(), [b]);
    });
  });
});
