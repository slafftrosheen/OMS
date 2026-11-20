import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

function environment() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window, values: Record<string, unknown> = {}, captures = new Map<number, Element>();
  win.fetch = globalThis.fetch.bind(globalThis);
  for (const key of ['window', 'document', 'navigator', 'self', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement',
    'HTMLSelectElement', 'HTMLButtonElement', 'SVGElement', 'Node', 'NodeFilter', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent',
    'FocusEvent', 'DOMRect', 'MutationObserver', 'Image', 'XMLSerializer', 'localStorage'])
    values[key] = key === 'window' || key === 'self' ? win : win[key];
  const media = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  win.matchMedia = media; values.matchMedia = media;
  win.Element.prototype.setPointerCapture = function (id: number) { captures.set(id, this); };
  win.Element.prototype.hasPointerCapture = function (id: number) { return captures.get(id) === this; };
  win.Element.prototype.releasePointerCapture = function (id: number) { if (captures.get(id) === this) captures.delete(id); };
  win.HTMLImageElement.prototype.decode = async () => {};
  values.getComputedStyle = win.getComputedStyle.bind(win);
  values.requestAnimationFrame = win.requestAnimationFrame.bind(win); values.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
  const clearNodeTimeout = globalThis.clearTimeout, clearNodeInterval = globalThis.clearInterval;
  values.clearTimeout = (id: any) => typeof id === 'number' ? win.clearTimeout(id) : clearNodeTimeout(id);
  values.clearInterval = (id: any) => typeof id === 'number' ? win.clearInterval(id) : clearNodeInterval(id);
  const channels: MessageChannel[] = [], NativeMessageChannel = globalThis.MessageChannel;
  values.MessageChannel = class extends NativeMessageChannel { constructor() { super(); channels.push(this); } };
  values.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  values.IS_REACT_ACT_ENVIRONMENT = true;
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  return { win, captures, restore() {
    for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  } };
}

/** Actual native Editor, Draw/Highlight/Eraser tools, canvas handlers, React,
 * Store and HistoryManager. A tiny CAD tool probes the public bridge contract;
 * the full CAD controller has its own geometry and integration tests. */
async function harness(run: (value: any) => Promise<void>) {
  const env = environment(), React = await import('react'), { act } = React;
  const { createRoot } = await import('react-dom/client'), tl = await import('@tldraw/tldraw');
  const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
  const { useCanvasEvents } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useCanvasEvents.mjs');
  const { useDocumentEvents } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useDocumentEvents.mjs');
  const { ContainerProvider } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useContainer.mjs');
  const input = await import('../../src/lib/components/canvas/drawing-pen-input');
  const settings = await import('../../src/lib/components/canvas/drawing-pen-settings');
  const samples: Array<{ x: number; y: number; z: number }> = [], commits: any[] = [];
  class CadFreehandProbe extends tl.StateNode {
    static override id = 'cad-freehand'; active = false;
    override onPointerDown = () => { samples.length = 0; samples.push(this.editor.inputs.currentPagePoint.toJson() as any); this.active = true; };
    override onPointerMove = () => { if (this.active) samples.push(this.editor.inputs.currentPagePoint.toJson() as any); };
    override onPointerUp = () => { if (this.active) { commits.push(samples.slice()); samples.length = 0; this.active = false; } };
    override onCancel = () => { samples.length = 0; this.active = false; };
    override onExit = () => { samples.length = 0; this.active = false; };
  }
  class Form extends tl.BaseBoxShapeUtil<any> {
    static override type = 'order-details'; static override props = { w: tl.T.number, h: tl.T.number };
    getDefaultProps() { return { w: 80, h: 40 }; } component() { return null; } indicator() { return null; }
  }
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const rect = env.win.DOMRect.fromRect({ x: 140, y: 90, width: 800, height: 600 });
  let container!: HTMLDivElement, customPresses = 0;
  const containerRef = (node: HTMLDivElement | null) => { if (node) { container = node; node.getBoundingClientRect = () => rect; } };
  function Canvas() {
    useDocumentEvents(); const events = useCanvasEvents();
    return <div className="tl-canvas" tabIndex={0} {...events}>
      <div className="canvas-form-sheet" onPointerDown={event => event.stopPropagation()}><input aria-label="Order address" defaultValue="Rīga" /></div>
      <svg className="tl-selection__fg"><g data-drawing-rotation-pivot="true" role="button" onPointerDown={event => { customPresses++; event.stopPropagation(); }} /></svg>
    </div>;
  }
  function App({ editor }: { editor: any }) {
    return <div data-testid="drawing-workspace"><div className="tl-container" tabIndex={0} ref={containerRef}>
      {editor && <ContainerProvider container={container}><EditorContext.Provider value={editor}><Canvas /></EditorContext.Provider></ContainerProvider>}
    </div></div>;
  }
  await act(async () => root.render(<App editor={null} />));
  const shapeUtils = [...tl.defaultShapeUtils, Form], tools = [...tl.defaultTools, ...tl.defaultShapeTools, CadFreehandProbe];
  const makeEditor = (node = container) => new tl.Editor({ store: tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }),
    shapeUtils, bindingUtils: tl.defaultBindingUtils, tools, getContainer: () => node, initialState: 'draw' });
  const editor = makeEditor(); editor.updateViewportScreenBounds(new tl.Box(rect.x, rect.y, rect.width, rect.height));
  editor.updateInstanceState({ isFocused: true });
  let stop = input.installDrawingPenInput(editor);
  try {
    await act(async () => root.render(<App editor={editor} />));
    const tick = async (ms = 24) => { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); };
    const createPointer = (name: string, page: { x: number; y: number }, extra: any = {}) => {
      const point = editor.pageToScreen(page);
      const { pointerId = 1, pointerType = 'pen', isPrimary = true, pressure = name === 'pointerup' ? 0 : .5,
        tiltX = 0, tiltY = 0, twist = 0, tangentialPressure = 0, coalesced, ...mouse } = extra;
      const event = new MouseEvent(name, { bubbles: true, cancelable: true, button: 0,
        buttons: name === 'pointerup' || name === 'pointercancel' ? 0 : 1, clientX: point.x, clientY: point.y, ...mouse });
      const props: Record<string, PropertyDescriptor> = {};
      for (const [key, value] of Object.entries({ pointerId, pointerType, isPrimary, pressure, tiltX, tiltY, twist, tangentialPressure })) props[key] = { value };
      if (coalesced) props.getCoalescedEvents = { value: typeof coalesced === 'function' ? coalesced : () => coalesced.map((p: any) => createPointer(name, p, { ...extra, ...p, coalesced: undefined })) };
      Object.defineProperties(event, props); return event;
    };
    const pointer = async (name: string, page: { x: number; y: number }, extra: any = {}, target: EventTarget = container.querySelector('.tl-canvas')!) => {
      const event = createPointer(name, page, extra); await act(async () => { target.dispatchEvent(event); }); await tick(); return event;
    };
    const set = async (value: any) => { await act(async () => assert.equal(settings.updateDrawingPenSettings(editor, value), true)); };
    const tool = async (id: string) => { await act(async () => { editor.complete(); editor.setCurrentTool(id); }); await tick(); };
    const snapshot = () => structuredClone(editor.store.getStoreSnapshot('document'));
    const ink = () => editor.getCurrentPageShapes().filter(shape => shape.type === 'draw' || shape.type === 'highlight');
    const points = (shape: any) => shape.props.segments.flatMap((segment: any) => segment.points);
    const add = async (id = 'shape:art', x = 100, y = 100, more: any = {}) => { await act(async () => editor.createShape({
      id, type: 'geo', x, y, props: { w: 80, h: 40, geo: 'rectangle', fill: 'solid', dash: 'solid' }, ...more,
    } as any)); return id; };
    const reinstall = () => { stop(); stop = input.installDrawingPenInput(editor); };
    await run({ env, editor, container, canvas: container.querySelector('.tl-canvas'), act, tick, pointer, createPointer, set, tool, snapshot, ink, points, add,
      settings, input, tl, makeEditor, samples, commits, reinstall, customPresses: () => customPresses });
  } finally {
    await act(async () => { stop(); root.unmount(); }); editor.dispose(); host.remove(); env.restore();
  }
}

describe('pen input through native editor and DOM events', () => {
  it('observes a test-pad sample without artwork writes and measures only contact pressure', async () => {
    await harness(async ({ editor, input, createPointer, snapshot }) => {
      const before = snapshot(); input.recordDrawingPenSample(editor, createPointer('pointermove', { x: 1, y: 2 }, { buttons: 0, pressure: 0 }));
      assert.equal(input.drawingPenDiagnostics(editor).get().minPressure, null);
      input.recordDrawingPenSample(editor, createPointer('pointermove', { x: 1, y: 2 }, { pressure: .3, tiltX: 25, tiltY: -30, twist: 180, tangentialPressure: .2 }));
      input.recordDrawingPenSample(editor, createPointer('pointermove', { x: 1, y: 2 }, { pressure: .8 }));
      const state = input.drawingPenDiagnostics(editor).get(); assert.equal(state.detectedPen, true); near(state.minPressure, .3); near(state.maxPressure, .8);
      input.recordDrawingPenSample(editor, createPointer('lostpointercapture', { x: 1, y: 2 }, { buttons: 1, pressure: .8 }));
      assert.equal(input.drawingPenDiagnostics(editor).get().contact, false);
      assert.deepEqual(snapshot(), before); input.resetDrawingPenDiagnostics(editor); assert.equal(input.drawingPenDiagnostics(editor).get().detectedPen, false);
    });
  });

  it('stores validated local preferences independently of documents and maps pressure responses', async () => {
    await harness(async ({ editor, settings, set, snapshot, makeEditor }) => {
      const before = snapshot(); await set({ response: 'soft', barrelAction: 'pan' });
      near(settings.mapDrawingPenPressure(.25, settings.readDrawingPenSettings(editor)), .5);
      await set({ response: 'firm' }); near(settings.mapDrawingPenPressure(.5, settings.readDrawingPenSettings(editor)), .25);
      assert.equal(settings.updateDrawingPenSettings(editor, { mode: 'invalid' }), false);
      assert.equal(settings.updateDrawingPenSettings(editor, { extra: true }), false);
      const second = makeEditor(); try { assert.equal(settings.readDrawingPenSettings(second).barrelAction, 'pan'); } finally { second.dispose(); }
      await set({ pressure: false }); near(settings.mapDrawingPenPressure(.1, settings.readDrawingPenSettings(editor), 'cad-freehand'), 1);
      near(settings.mapDrawingPenPressure(.1, settings.readDrawingPenSettings(editor), 'draw'), .5);
      assert.deepEqual(snapshot(), before);
    });
  });

  it('delivers coalesced and pressure-only pen samples plus the exact release endpoint to native ink with one Undo', async () => {
    await harness(async ({ editor, pointer, ink, points, snapshot, act, input }) => {
      const before = snapshot();
      await pointer('pointerdown', { x: 50, y: 50 }, { pressure: .2 });
      await pointer('pointermove', { x: 90, y: 50 }, { pressure: .1, coalesced: [{ x: 60, y: 50, pressure: .3 }, { x: 75, y: 50, pressure: .4 }, { x: 90, y: 50, pressure: .6 }] });
      near(points(ink()[0]).at(-1).z, .75);
      await pointer('pointermove', { x: 90, y: 50 }, { pressure: .8 }); near(points(ink()[0]).at(-1).z, 1);
      await pointer('pointerup', { x: 110, y: 50 });
      const shape = ink()[0]; assert.equal(ink().length, 1); assert.equal(shape.props.isPen, true); assert.equal(shape.props.isComplete, true);
      const saved = points(shape); assert.ok(saved.some((p: any) => p.x === 10)); assert.ok(saved.some((p: any) => p.x === 25)); near(saved.at(-1).x, 60);
      assert.equal(input.drawingPenDiagnostics(editor).get().coalescedSamples, 3);
      const after = snapshot(); await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
      await act(async () => editor.redo()); assert.deepEqual(snapshot(), after);
    });
  });

  it('falls back to ordinary events if coalescing is unavailable and keeps pressure disabled constant', async () => {
    await harness(async ({ pointer, set, ink, points }) => {
      await set({ pressure: false }); await pointer('pointerdown', { x: 50, y: 50 }, { pressure: .1 });
      await pointer('pointermove', { x: 70, y: 60 }, { pressure: .9, coalesced: () => { throw new Error('Unavailable outside secure context'); } });
      await pointer('pointerup', { x: 90, y: 60 }); assert.equal(ink().length, 1);
      for (const point of points(ink()[0])) near(point.z, .63);
    });
  });

  it('passes normalized pressure and coalesced samples to the CAD tool, with disabled pressure at full nib width', async () => {
    await harness(async ({ pointer, set, tool, samples, commits }) => {
      await tool('cad-freehand'); await set({ response: 'firm' });
      await pointer('pointerdown', { x: 50, y: 50 }, { pressure: .5 }); near(samples[0].z, .25);
      await pointer('pointermove', { x: 90, y: 50 }, { pressure: .8, coalesced: [{ x: 60, y: 55, pressure: .4 }] });
      assert.ok(samples.some((p: any) => Math.abs(p.z - .16) < 1e-8)); await pointer('pointerup', { x: 90, y: 50 }); assert.equal(commits.length, 1);
      await set({ pressure: false }); await pointer('pointerdown', { x: 120, y: 50 }, { pressure: .1 });
      await pointer('pointermove', { x: 150, y: 60 }, { pressure: .9 }); await pointer('pointerup', { x: 170, y: 60 });
      assert.ok(commits[1].every((p: any) => p.z === 1));
    });
  });

  it('allows mouse after pen in Auto, while Pen-only blocks canvas mouse and retains form controls', async () => {
    await harness(async ({ editor, pointer, ink, set, container, customPresses }) => {
      await pointer('pointerdown', { x: 50, y: 50 }); await pointer('pointerup', { x: 70, y: 50 }); assert.equal(editor.getInstanceState().isPenMode, true);
      await pointer('pointerdown', { x: 100, y: 50 }, { pointerType: 'mouse', pointerId: 2 });
      await pointer('pointerup', { x: 130, y: 50 }, { pointerType: 'mouse', pointerId: 2 }); assert.equal(ink().length, 2); assert.equal(editor.getInstanceState().isPenMode, false);
      await set({ mode: 'pen-only' });
      const blocked = await pointer('pointerdown', { x: 150, y: 50 }, { pointerType: 'mouse', pointerId: 2 }); assert.equal(blocked.defaultPrevented, true);
      await pointer('pointerup', { x: 180, y: 50 }, { pointerType: 'mouse', pointerId: 2 }); assert.equal(ink().length, 2);
      const field = container.querySelector('input'); const fieldEvent = await pointer('pointerdown', { x: 100, y: 100 }, { pointerType: 'mouse', pointerId: 2 }, field);
      assert.equal(fieldEvent.defaultPrevented, false);
      await set({ mode: 'auto' }); assert.equal(editor.getInstanceState().isPenMode, false);
      await pointer('pointerdown', { x: 0, y: 0 }, { pointerType: 'mouse', pointerId: 2 }, container.querySelector('[data-drawing-rotation-pivot]'));
      assert.equal(customPresses(), 1); assert.equal(ink().length, 2);
    });
  });

  it('ignores form/media-style controls and existing custom handles for pen drawing', async () => {
    await harness(async ({ editor, pointer, container, ink, customPresses, input }) => {
      await pointer('pointerdown', { x: 50, y: 50 }, {}, container.querySelector('input'));
      assert.equal(input.drawingPenDiagnostics(editor).get().contact, false);
      await pointer('pointerup', { x: 50, y: 50 }, {}, container.querySelector('input'));
      await pointer('pointerdown', { x: 50, y: 50 }, {}, container.querySelector('[data-drawing-rotation-pivot]'));
      assert.equal(input.drawingPenDiagnostics(editor).get().contact, false);
      assert.equal(customPresses(), 1); assert.equal(ink().length, 0);
    });
  });

  for (const interruption of ['pointercancel', 'lostpointercapture', 'blur'] as const) it(`retains and completes native ink on ${interruption}, with no stuck capture and one Undo`, async () => {
    await harness(async ({ editor, pointer, ink, env, canvas, input, snapshot, act }) => {
      const before = snapshot(); await pointer('pointerdown', { x: 50, y: 50 }); await pointer('pointermove', { x: 100, y: 60 });
      if (interruption === 'blur') await act(async () => env.win.dispatchEvent(new Event('blur')));
      else await pointer(interruption, { x: 100, y: 60 }, {}, canvas);
      assert.equal(editor.getPath(), 'draw.idle'); assert.equal(ink().length, 1); assert.equal(ink()[0].props.isComplete, true);
      assert.equal(editor.inputs.isPointing, false); assert.equal(editor.inputs.buttons.size, 0);
      assert.equal(env.captures.size, 0); assert.equal(input.drawingPenDiagnostics(editor).get().notice, 'ink-retained');
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
    });
  });

  it('discards a preview-only CAD gesture on pointercancel without a commit', async () => {
    await harness(async ({ editor, pointer, tool, samples, commits, snapshot, env }) => {
      await tool('cad-freehand'); const before = snapshot(); await pointer('pointerdown', { x: 50, y: 50 });
      await pointer('pointermove', { x: 100, y: 60 }); assert.ok(samples.length > 1);
      await pointer('pointercancel', { x: 100, y: 60 }); assert.equal(editor.getPath(), 'cad-freehand');
      assert.equal(samples.length, 0); assert.equal(commits.length, 0); assert.equal(env.captures.size, 0); assert.deepEqual(snapshot(), before);
    });
  });

  it('uses the pen eraser end momentarily and restores the original tool with exact Undo', async () => {
    await harness(async ({ editor, pointer, add, snapshot, act }) => {
      const id = await add(); const before = snapshot();
      await pointer('pointerdown', { x: 100, y: 100 }, { button: 5, buttons: 32 }); assert.equal(editor.getCurrentToolId(), 'eraser');
      await pointer('pointermove', { x: 180, y: 140 }, { button: -1, buttons: 32 });
      await pointer('pointerup', { x: 180, y: 140 }, { button: 5 });
      assert.equal(editor.getShape(id), undefined); assert.equal(editor.getCurrentToolId(), 'draw');
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
    });
  });

  for (const interruption of ['pointercancel', 'lostpointercapture', 'blur'] as const) it(`cancels erasing and restores the original tool on ${interruption}, preserving external writes`, async () => {
    await harness(async ({ editor, pointer, add, env, canvas, act }) => {
      const id = await add(); await pointer('pointerdown', { x: 100, y: 100 }, { button: 5, buttons: 32 });
      await pointer('pointermove', { x: 180, y: 140 }, { buttons: 32 });
      const external = await add('shape:external', 400, 400);
      if (interruption === 'blur') await act(async () => env.win.dispatchEvent(new Event('blur')));
      else await pointer(interruption, { x: 180, y: 140 }, { buttons: 32 }, canvas);
      assert.ok(editor.getShape(id)); assert.ok(editor.getShape(external)); assert.equal(editor.getCurrentToolId(), 'draw');
      assert.deepEqual(editor.getErasingShapeIds(), []); assert.equal(env.captures.size, 0);
      const release = await pointer('pointerup', { x: 180, y: 140 }, { button: 5 });
      assert.equal(release.defaultPrevented, true); assert.equal(editor.getCurrentToolId(), 'draw');
    });
  });

  it('protects forms and complete groups containing locked descendants from pen erasing', async () => {
    await harness(async ({ editor, pointer, add, snapshot, act }) => {
      await add('shape:form', 100, 100, { type: 'order-details', props: { w: 80, h: 40 } });
      const a = await add('shape:a', 300, 100), b = await add('shape:b', 400, 100);
      await act(async () => { editor.setCurrentTool('select'); editor.select(a, b); editor.groupShapes([a, b]); editor.updateShape({ id: b, type: 'geo', isLocked: true }); editor.setCurrentTool('draw'); });
      const before = snapshot();
      await pointer('pointerdown', { x: 90, y: 100 }, { button: 5, buttons: 32 });
      await pointer('pointermove', { x: 490, y: 100 }, { buttons: 32 }); await pointer('pointerup', { x: 490, y: 100 }, { button: 5 });
      assert.deepEqual(snapshot(), before);
    });
  });

  it('rechecks locked descendants immediately before erasing completes', async () => {
    await harness(async ({ editor, pointer, add, act }) => {
      const a = await add('shape:a', 100, 100), b = await add('shape:b', 220, 100);
      let group: string;
      await act(async () => { editor.setCurrentTool('select'); editor.select(a, b); editor.groupShapes([a, b]); group = editor.getOnlySelectedShapeId(); editor.setCurrentTool('draw'); });
      await pointer('pointerdown', { x: 90, y: 100 }, { button: 5, buttons: 32 });
      await pointer('pointermove', { x: 190, y: 100 }, { buttons: 32 });
      await act(async () => editor.updateShape({ id: b, type: 'geo', isLocked: true }));
      await pointer('pointerup', { x: 190, y: 100 }, { button: 5 });
      assert.ok(editor.getShape(group)); assert.ok(editor.getShape(a)); assert.equal(editor.getShape(b).isLocked, true);
    });
  });

  it('handles barrel-pan chords during ink, restores drawing, and does not open a context menu', async () => {
    await harness(async ({ editor, pointer, set, ink, canvas, act }) => {
      await set({ barrelAction: 'pan' }); await pointer('pointerdown', { x: 50, y: 50 }); await pointer('pointermove', { x: 90, y: 50 });
      await pointer('pointermove', { x: 90, y: 50 }, { button: 2, buttons: 3 }); assert.equal(editor.inputs.isPanning, true);
      const before = editor.getCamera(); await pointer('pointermove', { x: 140, y: 90 }, { button: -1, buttons: 3 });
      assert.ok(editor.getCamera().x !== before.x || editor.getCamera().y !== before.y);
      await pointer('pointermove', { x: 140, y: 90 }, { button: 2, buttons: 1 }); assert.equal(editor.inputs.isPanning, false);
      await pointer('pointermove', { x: 180, y: 90 }); await pointer('pointerup', { x: 200, y: 90 });
      assert.equal(editor.getCurrentToolId(), 'draw'); assert.equal(ink().length, 2); assert.ok(ink().every((s: any) => s.props.isComplete));
      const context = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      await act(async () => canvas.dispatchEvent(context)); assert.equal(context.defaultPrevented, true);
    });
  });

  it('blocks secondary mouse/touch contacts and touch gesture initiation during pen contact', async () => {
    await harness(async ({ pointer, ink, env, canvas, act }) => {
      await pointer('pointerdown', { x: 50, y: 50 });
      const mouse = await pointer('pointerdown', { x: 300, y: 300 }, { pointerType: 'mouse', pointerId: 2 }); assert.equal(mouse.defaultPrevented, true);
      const touch = await pointer('pointerdown', { x: 350, y: 350 }, { pointerType: 'touch', pointerId: 3 }); assert.equal(touch.defaultPrevented, true);
      const gesture = new env.win.Event('touchstart', { bubbles: true, cancelable: true }); await act(async () => canvas.dispatchEvent(gesture)); assert.equal(gesture.defaultPrevented, true);
      await pointer('pointermove', { x: 100, y: 60 }); await pointer('pointerup', { x: 120, y: 60 }); assert.equal(ink().length, 1);
    });
  });

  it('cleans up before reinstall and rejects readonly ink without blocking the diagnostic pad', async () => {
    await harness(async ({ editor, pointer, reinstall, ink, act, input, createPointer, snapshot }) => {
      reinstall(); await pointer('pointerdown', { x: 50, y: 50 }); await pointer('pointerup', { x: 100, y: 60 }); assert.equal(ink().length, 1);
      await act(async () => editor.updateInstanceState({ isReadonly: true })); const before = snapshot();
      const blocked = await pointer('pointerdown', { x: 150, y: 50 }); assert.equal(blocked.defaultPrevented, true);
      input.recordDrawingPenSample(editor, createPointer('pointermove', { x: 150, y: 50 }, { pressure: .9 }));
      assert.equal(input.drawingPenDiagnostics(editor).get().pressure, .9); assert.deepEqual(snapshot(), before);
      await pointer('pointerup', { x: 150, y: 50 }, {}, document.body); assert.equal(input.drawingPenDiagnostics(editor).get().contact, false);
    });
  });

  it('reports local-storage failure while keeping preferences usable, then clears that notice after recovery', async () => {
    await harness(async ({ editor, env, set, tick, input, settings, snapshot }) => {
      const before = snapshot(), prototype = env.win.Storage.prototype, original = prototype.setItem;
      prototype.setItem = () => { throw new Error('Storage blocked'); };
      try {
        await set({ response: 'soft' }); await tick(); assert.equal(settings.readDrawingPenSettings(editor).response, 'soft');
        assert.equal(settings.drawingPenSettingsPersisted(editor), false); assert.equal(input.drawingPenDiagnostics(editor).get().notice, 'storage-unavailable');
      } finally { prototype.setItem = original; }
      await set({ response: 'linear' }); await tick(); assert.equal(settings.drawingPenSettingsPersisted(editor), true);
      assert.equal(input.drawingPenDiagnostics(editor).get().notice, null); assert.deepEqual(snapshot(), before);
    });
  });

  for (const id of ['draw', 'cad-freehand']) it(`finishes the ${id} gesture safely when tablet preferences change`, async () => {
    await harness(async ({ editor, pointer, tool, set, tick, ink, samples, commits, env }) => {
      await tool(id); await pointer('pointerdown', { x: 50, y: 50 }); await pointer('pointermove', { x: 100, y: 60 });
      await set({ response: 'firm' }); await tick(); assert.equal(editor.inputs.isPointing, false); assert.equal(env.captures.size, 0);
      if (id === 'draw') { assert.equal(ink().length, 1); assert.equal(ink()[0].props.isComplete, true); }
      else { assert.equal(samples.length, 0); assert.equal(commits.length, 0); }
    });
  });

  it('allows the eraser end from an idle leaf CAD tool and restores that tool', async () => {
    await harness(async ({ editor, pointer, tool, add, commits }) => {
      await tool('cad-freehand'); const id = await add(); await pointer('pointerdown', { x: 100, y: 100 }, { button: 5, buttons: 32 });
      assert.equal(editor.getCurrentToolId(), 'eraser'); await pointer('pointerup', { x: 180, y: 140 }, { button: 5 });
      assert.equal(editor.getCurrentToolId(), 'cad-freehand'); assert.equal(editor.getShape(id), undefined); assert.equal(commits.length, 0);
    });
  });

  it('keeps native Hand pen panning active across camera movement', async () => {
    await harness(async ({ editor, pointer, tool }) => {
      await tool('hand'); const before = editor.getCamera(); await pointer('pointerdown', { x: 50, y: 50 });
      await pointer('pointermove', { x: 110, y: 80 }); assert.equal(editor.inputs.isPointing, true);
      assert.ok(editor.getCamera().x !== before.x || editor.getCamera().y !== before.y);
      await pointer('pointermove', { x: 150, y: 100 }); assert.equal(editor.inputs.isPointing, true);
      await pointer('pointerup', { x: 150, y: 100 }); assert.equal(editor.getCurrentToolId(), 'hand'); assert.equal(editor.inputs.isPointing, false);
    });
  });

  it('supports native middle-button pan without changing the original drawing tool', async () => {
    await harness(async ({ editor, pointer, ink, act, tick }) => {
      const before = editor.getCamera(); await pointer('pointerdown', { x: 50, y: 50 }, { button: 1, buttons: 4 });
      await pointer('pointermove', { x: 110, y: 80 }, { buttons: 4 }); await pointer('pointerup', { x: 150, y: 100 }, { button: 1 });
      assert.ok(editor.getCamera().x !== before.x || editor.getCamera().y !== before.y);
      assert.equal(editor.getCurrentToolId(), 'draw'); assert.equal(editor.inputs.isPanning, false); assert.equal(ink().length, 0);
      await pointer('pointerdown', { x: 180, y: 100 }, { button: 1, buttons: 4 }); assert.equal(editor.inputs.isPanning, true);
      await act(async () => editor.addOpenMenu('tablet-menu')); await tick();
      assert.equal(editor.inputs.isPanning, false); assert.equal(editor.inputs.isPointing, false); assert.equal(editor.inputs.buttons.size, 0);
      await pointer('pointerup', { x: 180, y: 100 }, { button: 1 }); assert.equal(ink().length, 0);
    });
  });

  it('maps barrel eraser chords and resumes a fresh pressure stroke after the button is released', async () => {
    await harness(async ({ editor, pointer, set, add, ink }) => {
      await set({ barrelAction: 'eraser' }); const id = await add();
      await pointer('pointerdown', { x: 100, y: 100 }, { button: 2, buttons: 3 }); assert.equal(editor.getCurrentToolId(), 'eraser');
      await pointer('pointermove', { x: 180, y: 140 }, { buttons: 3 });
      await pointer('pointermove', { x: 180, y: 140 }, { button: 2, buttons: 1 }); assert.equal(editor.getCurrentToolId(), 'draw');
      await pointer('pointermove', { x: 220, y: 160 }); await pointer('pointerup', { x: 240, y: 160 });
      assert.equal(editor.getShape(id), undefined); assert.equal(ink().length, 1); assert.equal(ink()[0].props.isComplete, true);
    });
  });

  it('leaves the default barrel context action native and does not start ink', async () => {
    await harness(async ({ pointer, canvas, ink, act }) => {
      await pointer('pointerdown', { x: 50, y: 50 }, { button: 2, buttons: 2 });
      const context = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); await act(async () => canvas.dispatchEvent(context));
      assert.equal(context.defaultPrevented, false); await pointer('pointerup', { x: 50, y: 50 }, { button: 2 }); assert.equal(ink().length, 0);
    });
  });

  it('bounds a large coalesced packet and keeps its first and final raw points', async () => {
    await harness(async ({ editor, pointer, tool, samples, input }) => {
      await tool('cad-freehand'); await pointer('pointerdown', { x: 0, y: 50 });
      const packet = Array.from({ length: 150 }, (_, i) => ({ x: i + 1, y: 50, pressure: .4 }));
      await pointer('pointermove', { x: 150, y: 50 }, { pressure: .9, coalesced: packet });
      assert.equal(samples.length, 65); near(samples[1].x, 1); near(samples.at(-1).x, 150); near(samples.at(-1).z, .4);
      assert.equal(input.drawingPenDiagnostics(editor).get().coalescedSamples, 64); await pointer('pointercancel', { x: 150, y: 50 });
    });
  });

  for (const id of ['draw', 'cad-freehand', 'hand']) it(`releases native input when the held ${id} pen gesture changes tools`, async () => {
    await harness(async ({ editor, pointer, tool, act, tick, ink, samples, commits, env, snapshot }) => {
      await tool(id); await pointer('pointerdown', { x: 50, y: 50 }); await pointer('pointermove', { x: 100, y: 60 });
      assert.equal(editor.inputs.isPointing, true);
      await act(async () => editor.setCurrentTool('select')); await tick();
      assert.equal(editor.getCurrentToolId(), 'select'); assert.equal(editor.inputs.isPointing, false);
      assert.equal(editor.inputs.buttons.size, 0); assert.equal(env.captures.size, 0);
      if (id === 'draw') assert.equal(ink().length, 1);
      if (id === 'cad-freehand') { assert.equal(samples.length, 0); assert.equal(commits.length, 0); }
      const after = snapshot(); await pointer('pointerup', { x: 100, y: 60 }); assert.deepEqual(snapshot(), after);
      assert.equal(editor.getCurrentToolId(), 'select'); assert.equal(editor.inputs.isPointing, false);
    });
  });

  it('completes retained native ink when opening a menu during contact', async () => {
    await harness(async ({ editor, pointer, act, tick, ink, input, env, snapshot }) => {
      const before = snapshot(); await pointer('pointerdown', { x: 50, y: 50 }); await pointer('pointermove', { x: 100, y: 60 });
      await act(async () => editor.addOpenMenu('tablet-menu')); await tick();
      assert.equal(editor.getIsMenuOpen(), true); assert.equal(editor.getPath(), 'draw.idle');
      assert.equal(ink().length, 1); assert.equal(ink()[0].props.isComplete, true);
      assert.equal(editor.inputs.isPointing, false); assert.equal(editor.inputs.buttons.size, 0); assert.equal(env.captures.size, 0);
      assert.equal(input.drawingPenDiagnostics(editor).get().notice, 'ink-retained');
      await act(async () => { editor.clearOpenMenus(); editor.undo(); }); assert.deepEqual(snapshot(), before);
    });
  });

  it('retains existing ink without bypassing readonly when access changes during contact', async () => {
    await harness(async ({ editor, pointer, act, tick, ink, input, env, snapshot }) => {
      await pointer('pointerdown', { x: 50, y: 50 }); await pointer('pointermove', { x: 100, y: 60 }); const before = snapshot();
      await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
      assert.equal(editor.getPath(), 'draw.idle'); assert.equal(ink().length, 1); assert.equal(ink()[0].props.isComplete, false);
      assert.deepEqual(snapshot(), before); assert.equal(editor.inputs.isPointing, false); assert.equal(editor.inputs.buttons.size, 0);
      assert.equal(env.captures.size, 0); assert.equal(input.drawingPenDiagnostics(editor).get().notice, 'ink-retained');
      await pointer('pointerup', { x: 100, y: 60 }); assert.deepEqual(snapshot(), before);
    });
  });
});
