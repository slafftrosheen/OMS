import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

function domEnvironment() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window, values: Record<string, unknown> = {};
  win.fetch = globalThis.fetch.bind(globalThis);
  const channels: MessageChannel[] = [], NativeMessageChannel = globalThis.MessageChannel;
  values.MessageChannel = class extends NativeMessageChannel { constructor() { super(); channels.push(this); } };
  for (const key of ['window', 'document', 'navigator', 'self', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement',
    'HTMLSelectElement', 'HTMLButtonElement', 'SVGElement', 'Node', 'NodeFilter', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent',
    'FocusEvent', 'DOMRect', 'MutationObserver', 'Image', 'XMLSerializer', 'localStorage'])
    values[key] = key === 'window' || key === 'self' ? win : win[key];
  const media = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  win.matchMedia = media; values.matchMedia = media;
  const captures = new Map<number, Element>();
  win.Element.prototype.setPointerCapture = function (id: number) { captures.set(id, this); };
  win.Element.prototype.hasPointerCapture = function (id: number) { return captures.get(id) === this; };
  win.Element.prototype.releasePointerCapture = function (id: number) {
    if (captures.get(id) !== this) return;
    captures.delete(id);
    // Exercise the browser ordering: native pointerup releases capture before
    // the editor receives its public pointer_up event.
    const event = new win.Event('lostpointercapture', { bubbles: true });
    Object.defineProperty(event, 'pointerId', { value: id }); this.dispatchEvent(event);
  };
  win.HTMLImageElement.prototype.decode = async () => {};
  values.getComputedStyle = win.getComputedStyle.bind(win);
  values.requestAnimationFrame = win.requestAnimationFrame.bind(win); values.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
  const clearNodeTimeout = globalThis.clearTimeout, clearNodeInterval = globalThis.clearInterval;
  values.clearTimeout = (id: any) => typeof id === 'number' ? win.clearTimeout(id) : clearNodeTimeout(id);
  values.clearInterval = (id: any) => typeof id === 'number' ? win.clearInterval(id) : clearNodeInterval(id);
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

/** Actual public Editor, StateNode, native canvas/document hooks and React
 * overlay. The root sits outside the editor container as it does in OMS. */
async function harness(run: (value: any) => Promise<void>, withPenBridge = false) {
  const env = domEnvironment();
  const React = await import('react'), { act } = React;
  const { createRoot } = await import('react-dom/client');
  const tldraw = await import('@tldraw/tldraw');
  const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
  const { EditorComponentsProvider } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditorComponents.mjs');
  const { useCanvasEvents } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useCanvasEvents.mjs');
  const { useDocumentEvents } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useDocumentEvents.mjs');
  const { CadPathShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadShapes');
  const { CadBezierShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadBezierShape');
  const controller = await import('../../src/lib/components/canvas/CadFreehandTool');
  const { CadFreehandOverlay } = await import('../../src/lib/components/canvas/CadFreehandOverlay');
  const { CadDrawingMeasurements } = await import('../../src/lib/components/canvas/CadDrawingMeasurements');
  const engine = await import('../../src/lib/components/canvas/cad-freehand');
  const gesture = await import('../../src/lib/components/canvas/drawing-pointer-gesture');
  const curves = await import('../../src/lib/components/canvas/cad-curves');
  const pen = await import('../../src/lib/components/canvas/drawing-pen-input');
  const penSettings = await import('../../src/lib/components/canvas/drawing-pen-settings');
  class ProtectedFormShapeUtil extends tldraw.ShapeUtil<any> {
    static type = 'order-details' as const;
    static props = { w: tldraw.T.number, h: tldraw.T.number };
    getDefaultProps() { return { w: 300, h: 180 }; }
    getGeometry(shape: any) { return new tldraw.Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true }); }
    component() { return null; }
    indicator() { return null; }
  }
  const shapeUtils = [...tldraw.defaultShapeUtils, CadPathShapeUtil, CadBezierShapeUtil, ProtectedFormShapeUtil];
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host), rect = env.win.DOMRect.fromRect({ x: 140, y: 90, width: 800, height: 600 });
  let container!: HTMLDivElement;
  const containerRef = (node: HTMLDivElement | null) => { if (node) { container = node; node.getBoundingClientRect = () => rect; } };
  function NativeArtwork() {
    const editor = tldraw.useEditor();
    const shapes = tldraw.useValue('Native CAD artwork test', () => {
      editor.user.getIsDarkMode();
      return editor.getRenderingShapes().filter(item => item.shape.type === 'cad-bezier');
    }, [editor]);
    return <div>{shapes.map(({ shape, util, opacity, index }) => <div key={shape.id} data-native-shape={shape.id}
      style={{ opacity, zIndex: index, transform: editor.getShapePageTransform(shape).toCssString() }}>
      {util.component(shape)}
    </div>)}</div>;
  }
  function Canvas() {
    useDocumentEvents(); const events = useCanvasEvents();
    return <div className="tl-canvas" tabIndex={0} {...events}>
      <NativeArtwork />
      <CadFreehandOverlay />
      <CadDrawingMeasurements />
      <div className="canvas-form-sheet" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
        <input aria-label="Order address" defaultValue="Rīga" />
      </div>
    </div>;
  }
  function Application({ editor }: { editor: any }) {
    return <div data-testid="drawing-workspace"><div className="drawing-viewport">
      <div className="tl-container" tabIndex={0} ref={containerRef}>
        {editor && <tldraw.ContainerProvider container={container}><EditorContext.Provider value={editor}>
          <EditorComponentsProvider><Canvas /></EditorComponentsProvider>
        </EditorContext.Provider></tldraw.ContainerProvider>}
      </div>
    </div></div>;
  }
  await act(async () => root.render(<Application editor={null} />));
  const editor = new tldraw.Editor({
    store: tldraw.createTLStore({ shapeUtils, bindingUtils: tldraw.defaultBindingUtils }), shapeUtils,
    bindingUtils: tldraw.defaultBindingUtils,
    tools: [...tldraw.defaultTools, ...tldraw.defaultShapeTools, controller.CadFreehandTool],
    getContainer: () => container, initialState: 'select',
  });
  editor.updateViewportScreenBounds(new tldraw.Box(rect.x, rect.y, rect.width, rect.height));
  editor.updateInstanceState({ isFocused: true });
  const stopPen = withPenBridge ? pen.installDrawingPenInput(editor) : () => {};
  try {
    await act(async () => { root.render(<Application editor={editor} />); editor.setCurrentTool('cad-freehand'); });
    const tick = async () => {
      // Native pointer_move is queued until the next frame; the tool publishes
      // its preview on the following frame. Elapsed time cannot guarantee that
      // either callback ran when the event loop is busy.
      await act(async () => {
        await new Promise<void>(resolve => env.win.requestAnimationFrame(() => env.win.requestAnimationFrame(() => resolve())));
      });
    };
    const makePointer = (name: string, point: { x: number; y: number }, options: any = {}) => {
      const { pointerId = 1, pointerType = 'mouse', isPrimary = true, pressure = .5, tiltX, tiltY, coalesced, ...mouse } = options;
      const event = new MouseEvent(name, { bubbles: true, cancelable: true, button: 0, buttons: name === 'pointerup' ? 0 : 1,
        clientX: point.x, clientY: point.y, ...mouse });
      Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType }, isPrimary: { value: isPrimary }, pressure: { value: pressure } });
      if (tiltX !== undefined) Object.defineProperty(event, 'tiltX', { value: tiltX });
      if (tiltY !== undefined) Object.defineProperty(event, 'tiltY', { value: tiltY });
      if (coalesced) Object.defineProperty(event, 'getCoalescedEvents', { value: () => coalesced });
      return event;
    };
    const pointer = async (element: EventTarget, name: string, point: { x: number; y: number }, options: any = {}) => {
      const event = makePointer(name, point, options);
      await act(async () => { element.dispatchEvent(event); }); await tick(); return event;
    };
    const screen = (point: { x: number; y: number }) => editor.pageToScreen(point);
    const dispatch = async (name: 'pointer_down' | 'pointer_move' | 'pointer_up', point: { x: number; y: number; z?: number }, options: any = {}) => {
      const s = screen(point);
      await act(async () => editor.dispatch({ type: 'pointer', name, target: 'canvas', point: { x: s.x, y: s.y, z: point.z ?? .5 },
        pointerId: 1, button: 0, isPen: false, shiftKey: false, ctrlKey: false, altKey: false, ...options }));
      await tick();
    };
    const key = async (value: string, element: EventTarget = container) => {
      await act(async () => {
        element.dispatchEvent(new KeyboardEvent('keydown', { key: value, code: value, bubbles: true, cancelable: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { key: value, code: value, bubbles: true, cancelable: true }));
      }); await tick();
    };
    const snapshot = () => structuredClone(editor.store.getStoreSnapshot('document'));
    const preview = () => controller.cadFreehandPreview(editor).get();
    const notice = () => controller.cadFreehandNotice(editor).get();
    const configure = async (options: any) => { await act(async () => assert.equal(engine.setCadFreehandOptions(editor, options), true)); await tick(); };
    const pageContours = (shape: any) => curves.mapContours(shape.props.contours, (p: any) => editor.getShapePageTransform(shape).applyToPoint(p));
    await run({ env, editor, container, canvas: container.querySelector('.tl-canvas'), host, act, tick, pointer, makePointer, dispatch, key,
      screen, snapshot, preview, notice, configure, controller, engine, gesture, curves, pageContours, tldraw, pen, penSettings });
  } finally {
    await act(async () => { controller.cancelCadFreehand(editor); stopPen(); root.unmount(); });
    if (!editor.isDisposed) editor.dispose(); host.remove(); env.restore();
  }
}

function originalCurve(curves: any) {
  return { closed: false, nodes: [
    { ...curves.nodeAt({ x: 0, y: 0 }), outX: 35, outY: -40 },
    { ...curves.nodeAt({ x: 100, y: 30 }), inX: -30, inY: 20, outX: 15, outY: 50 },
    { ...curves.nodeAt({ x: 160, y: 80 }), inX: 10, inY: -30 },
  ] };
}
async function selectSource(h: any, extra: any = {}, contours = [originalCurve(h.curves)]) {
  const id = h.tldraw.createShapeId('continuation-source');
  await h.act(async () => {
    h.editor.setCurrentTool('select');
    h.editor.createShape({ id, type: 'cad-bezier', props: { contours, fillRule: 'evenodd', color: 'red' }, ...extra });
    h.editor.select(id); h.editor.mark('continuation-fixture'); h.editor.setCurrentTool('cad-freehand');
  });
  await h.tick(); return id;
}

describe('CAD freehand through the actual canvas and editor', () => {
  it('previews page-space mouse geometry without document writes, then commits each stroke in one Undo', async () => {
    await harness(async ({ editor, canvas, pointer, screen, preview, snapshot, container, notice, curves, pageContours, act }) => {
      await act(async () => editor.setCamera({ x: 20, y: -35, z: 2 }));
      const before = snapshot(); let creates = 0, updates = 0;
      const stopCreate = editor.sideEffects.registerAfterCreateHandler('shape', () => { creates++; });
      const stopUpdate = editor.sideEffects.registerAfterChangeHandler('shape', () => { updates++; });
      await pointer(canvas, 'pointerdown', screen({ x: 10, y: 20 }), { pressure: .2 });
      await pointer(canvas, 'pointermove', screen({ x: 80, y: 50 }), { pressure: .9 });
      await pointer(canvas, 'pointermove', screen({ x: 160, y: 60 }), { pressure: .1 });
      assert.deepEqual(preview().samples, [{ x: 10, y: 20, pressure: 1 }, { x: 80, y: 50, pressure: 1 }, { x: 160, y: 60, pressure: 1 }]);
      assert.deepEqual(snapshot(), before); assert.equal(creates, 0); assert.equal(updates, 0);
      const path = container.querySelector('[data-testid="cad-freehand-result"]').getAttribute('d');
      assert.equal(path, curves.curvePathData(preview().geometry.contours));
      await pointer(canvas, 'pointerup', screen({ x: 160, y: 60 }));
      const first = snapshot(), shape = editor.getOnlySelectedShape();
      assert.equal(shape.type, 'cad-bezier'); assert.equal(creates, 1); assert.equal(updates, 0);
      assert.equal(curves.curvePathData(pageContours(shape)), path);
      assert.equal(preview(), null); assert.equal(notice(), 'drawn'); assert.equal(editor.getCurrentToolId(), 'cad-freehand');
      assert.equal(container.querySelector('[data-testid="cad-freehand-preview"]'), null);
      await pointer(canvas, 'pointerdown', screen({ x: 20, y: 100 }));
      await pointer(canvas, 'pointerup', screen({ x: 140, y: 120 }));
      const second = snapshot(); assert.equal(editor.getCurrentPageShapeIds().size, 2);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), first);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
      await act(async () => editor.redo()); assert.deepEqual(snapshot(), first);
      await act(async () => editor.redo()); assert.deepEqual(snapshot(), second);
      stopCreate(); stopUpdate();
    });
  });

  it('shows the current pen stroke dimensions in physical units and clears them on completion', async () => {
    await harness(async ({ container, dispatch, configure }) => {
      await configure({ mode: 'curve', smoothing: 0 });
      const label = () => container.querySelector('[data-testid="cad-live-measurement"]');
      await dispatch('pointer_down', { x: 20, y: 20 }, { isPen: true });
      assert.equal(label(), null);
      await dispatch('pointer_move', { x: 116, y: 20 }, { isPen: true });
      assert.equal(label()?.textContent, '25.40 × 0.00 mm');
      await dispatch('pointer_up', { x: 116, y: 20 }, { isPen: true });
      assert.equal(label(), null);
    });
  });
  it('preserves normalized pen pressure, stationary pressure peaks, and the release coordinate through public dispatch', async () => {
    await harness(async ({ editor, dispatch, configure, preview, snapshot, pageContours, curves, act }) => {
      await configure({ mode: 'ink', width: 20, smoothing: 0, autoClose: false });
      const before = snapshot();
      await dispatch('pointer_down', { x: 10, y: 40, z: .1 }, { isPen: true });
      await dispatch('pointer_move', { x: 60, y: 40, z: .3 }, { isPen: true });
      await dispatch('pointer_move', { x: 60, y: 40, z: .9 }, { isPen: true });
      await dispatch('pointer_move', { x: 60, y: 40, z: .2 }, { isPen: true });
      assert.deepEqual(preview().samples, [{ x: 10, y: 40, pressure: .1 }, { x: 60, y: 40, pressure: .9 }]);
      assert.equal(preview().isPen, true); assert.deepEqual(snapshot(), before);
      near(preview().geometry.bounds.h, 18);
      await dispatch('pointer_up', { x: 110, y: 40, z: 0 }, { isPen: true });
      const shape = editor.getOnlySelectedShape(); assert.equal(shape.type, 'cad-bezier');
      const bounds = curves.curveBounds(pageContours(shape)); near(bounds.x, 9); near(bounds.w, 101); near(bounds.h, 18);
      assert.equal(shape.meta.omsVectorPaint.fill, '#172535'); assert.equal(shape.meta.omsVectorPaint.stroke, 'none');
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
    });
  });

  it('commits a focused property input on blur before freezing the first mouse stroke width', async () => {
    await harness(async ({ editor, host, container, canvas, pointer, screen, preview, notice, snapshot, engine, act }) => {
      const input = document.createElement('input'); input.type = 'number'; input.value = '12';
      host.prepend(input); let blurs = 0;
      input.addEventListener('blur', () => { blurs++; assert.equal(engine.setCadFreehandOptions(editor, { width: Number(input.value) }), true); });
      await act(async () => input.focus());
      assert.equal(document.activeElement, input);
      // Native focus state and DOM focus can diverge for toolbar/property UI.
      assert.equal(editor.getIsFocused(), true); assert.equal(engine.readCadFreehandOptions(editor).width, 4);
      const before = snapshot();
      await pointer(canvas, 'pointerdown', screen({ x: 10, y: 30 }));
      assert.equal(blurs, 1); assert.equal(document.activeElement, container);
      assert.equal(engine.readCadFreehandOptions(editor).width, 12); assert.ok(preview());
      await pointer(canvas, 'pointermove', screen({ x: 110, y: 50 }));
      assert.equal(preview().geometry.paint.strokeWidth, 12); assert.equal(notice(), null); assert.deepEqual(snapshot(), before);
      await pointer(canvas, 'pointerup', screen({ x: 110, y: 50 }));
      assert.equal(preview(), null); assert.equal(notice(), 'drawn'); assert.equal(editor.getCurrentPageShapeIds().size, 1);
      assert.equal(editor.getOnlySelectedShape().meta.omsVectorPaint.strokeWidth, 12);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
      input.remove();
    });
  });

  it('uses the actual pen bridge for coalesced samples, one editable commit, and interruption cancellation', async () => {
    await harness(async ({ editor, env, canvas, pointer, makePointer, screen, configure, preview, snapshot, act, tick, pen, penSettings }) => {
      await configure({ mode: 'ink', width: 20, autoClose: false });
      const before = snapshot(), options = { pointerId: 9, pointerType: 'pen' };
      await pointer(canvas, 'pointerdown', screen({ x: 10, y: 30 }), { ...options, pressure: .2 });
      const coalesced = [
        makePointer('pointermove', screen({ x: 40, y: 30 }), { ...options, pressure: .4 }),
        makePointer('pointermove', screen({ x: 80, y: 30 }), { ...options, pressure: .8 }),
      ];
      await pointer(canvas, 'pointermove', screen({ x: 80, y: 30 }), { ...options, pressure: .8, coalesced });
      assert.deepEqual(preview().samples.map((sample: any) => sample.pressure), [.2, .4, .8]);
      assert.deepEqual(snapshot(), before); assert.equal(pen.drawingPenDiagnostics(editor).get().coalescedSamples, 2);
      await pointer(canvas, 'pointerup', screen({ x: 100, y: 30 }), { ...options, pressure: 0 });
      const saved = snapshot(); assert.equal(editor.getCurrentPageShapeIds().size, 1); assert.equal(preview(), null);
      await act(async () => penSettings.updateDrawingPenSettings(editor, { pressure: false }));
      await pointer(canvas, 'pointerdown', screen({ x: 20, y: 70 }), { ...options, pressure: .01 });
      assert.equal(preview().samples[0].pressure, 1);
      await pointer(canvas, 'pointercancel', screen({ x: 50, y: 80 }), options);
      assert.equal(preview(), null); assert.deepEqual(snapshot(), saved);
      await pointer(canvas, 'pointerdown', screen({ x: 30, y: 100 }), options);
      await act(async () => env.win.dispatchEvent(new Event('blur'))); await tick();
      assert.equal(preview(), null); assert.deepEqual(snapshot(), saved);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
    }, true);
  });

  it('retains each queued coalesced pen orientation and lower-pressure stationary rotations in calligraphy', async () => {
    await harness(async ({ editor, canvas, pointer, makePointer, screen, configure, preview, snapshot, act, curves, pageContours, engine }) => {
      await configure({ mode: 'calligraphy', width: 20, smoothing: 0, autoClose: false, useTilt: true, useBearing: true });
      const before = snapshot(), options = { pointerId: 29, pointerType: 'pen' };
      await pointer(canvas, 'pointerdown', screen({ x: 20, y: 40 }), { ...options, pressure: .8, tiltX: 60, tiltY: 0 });
      const samples = [
        makePointer('pointermove', screen({ x: 60, y: 40 }), { ...options, pressure: .8, tiltX: 60, tiltY: 0 }),
        makePointer('pointermove', screen({ x: 60, y: 40 }), { ...options, pressure: .6, tiltX: 0, tiltY: 60 }),
        makePointer('pointermove', screen({ x: 100, y: 40 }), { ...options, pressure: .4, tiltX: 0, tiltY: 0 }),
      ];
      // The bridge queues all three public pointer_move events before a
      // native editor tick. A mutable latest-orientation slot fails this test.
      await pointer(canvas, 'pointermove', screen({ x: 100, y: 40 }), { ...options, pressure: .4, tiltX: 0, tiltY: 0, coalesced: samples });
      assert.deepEqual(preview().samples.map((sample: any) => [sample.x, sample.pressure, sample.tiltX, sample.tiltY]),
        [[20, .8, 60, 0], [60, .8, 60, 0], [60, .6, 0, 60], [100, .4, 0, 0]]);
      assert.equal(preview().mode, 'calligraphy'); assert.deepEqual(snapshot(), before);
      const expected = engine.buildCadFreehandGeometry(preview().samples, engine.readCadFreehandOptions(editor), 8);
      assert.equal(curves.curvePathData(preview().geometry.contours), curves.curvePathData(expected.contours));
      await pointer(canvas, 'pointerup', screen({ x: 100, y: 40 }), { ...options, pressure: 0, tiltX: 0, tiltY: 0 });
      const shape = editor.getOnlySelectedShape(); assert.equal(shape.type, 'cad-bezier');
      assert.equal(shape.meta.omsVectorPaint.fill, '#172535'); assert.equal(shape.meta.omsVectorPaint.stroke, 'none');
      assert.equal(curves.curvePathData(pageContours(shape)), curves.curvePathData(expected.contours));
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
    }, true);
  });

  it('keeps fixed nib and round ink stationary pressure merging while ignoring unused orientation changes', async () => {
    await harness(async ({ editor, canvas, pointer, screen, configure, preview, controller, act }) => {
      const options = { pointerId: 31, pointerType: 'pen' };
      for (const mode of ['calligraphy', 'ink']) {
        await configure({ mode, useTilt: false, useBearing: false, autoClose: false });
        await pointer(canvas, 'pointerdown', screen({ x: 20, y: 40 }), { ...options, pressure: .8, tiltX: 60, tiltY: 0 });
        await pointer(canvas, 'pointermove', screen({ x: 20, y: 40 }), { ...options, pressure: .4, tiltX: 0, tiltY: 60 });
        assert.equal(preview().sampleCount, 1); assert.equal(preview().samples[0].pressure, .8);
        await act(async () => controller.cancelCadFreehand(editor));
      }
    }, true);
  });

  it('preserves a selected curve on entry, hits endpoints in screen pixels, and appends in one native Undo', async () => {
    await harness(async h => {
      const { editor, act, configure, dispatch, container, controller, preview, notice, snapshot, curves } = h;
      await configure({ smoothing: 0, width: 30, color: '#eeeeee' });
      const paint = { fill: 'none', stroke: '#a31764', strokeWidth: 7, fillOpacity: 1, strokeOpacity: .65,
        lineCap: 'square', lineJoin: 'bevel', miterLimit: 7, dash: [], dashOffset: 0 };
      const id = await selectSource(h, { opacity: .45, meta: { omsVectorPaint: paint, omsObjectName: 'Keep this object', custom: { retained: 7 } } });
      await act(async () => editor.setCamera({ x: 10, y: 20, z: 2 }));
      assert.deepEqual(editor.getSelectedShapeIds(), [id]); assert.equal(container.querySelectorAll('[data-testid="cad-freehand-endpoint"]').length, 2);
      await dispatch('pointer_move', { x: 163.9, y: 80 });
      assert.equal(controller.cadFreehandHover(editor).get().end, 'end');
      near(Number(container.querySelector('[data-testid="cad-freehand-endpoint-hover"]').getAttribute('r')), 4);
      await dispatch('pointer_move', { x: 164.1, y: 80 }); assert.equal(controller.cadFreehandHover(editor).get(), null);
      const before = snapshot(), source = structuredClone(editor.getShape(id)); let creates = 0, updates = 0;
      const stopCreate = editor.sideEffects.registerAfterCreateHandler('shape', () => { creates++; });
      const stopUpdate = editor.sideEffects.registerAfterChangeHandler('shape', () => { updates++; });
      await dispatch('pointer_down', { x: 163.9, y: 80 });
      assert.equal(preview().continuation.shapeId, id); assert.deepEqual(preview().samples[0], { x: 160, y: 80, pressure: 1 });
      await dispatch('pointer_move', { x: 230, y: 130 });
      assert.deepEqual(snapshot(), before); assert.equal(creates, 0); assert.equal(updates, 0);
      assert.deepEqual(preview().geometry.contours[0].nodes.map(({ x, y }: any) => ({ x, y })),
        [{ x: 0, y: 0 }, { x: 100, y: 30 }, { x: 160, y: 80 }, { x: 230, y: 130 }]);
      assert.deepEqual(preview().geometry.paint, paint); assert.equal(preview().opacity, .45);
      assert.equal(preview().geometry.fillRule, source.props.fillRule);
      const sourceContainer = container.querySelector(`[data-native-shape="${id}"]`);
      assert.equal(sourceContainer.querySelectorAll('path[stroke="#a31764"]').length, 1);
      const previewPath = sourceContainer.querySelector('[data-testid="cad-freehand-source-preview"] path[stroke="#a31764"]').getAttribute('d');
      assert.equal(previewPath, curves.curvePathData(preview().geometry.contours));
      assert.equal(container.querySelector('[data-testid="cad-freehand-preview"]').getAttribute('data-continuation'), id);
      assert.equal(container.querySelector('[data-testid="cad-freehand-preview"] path'), null);
      assert.equal(sourceContainer.style.opacity, '0.45');
      await dispatch('pointer_up', { x: 230, y: 130 });
      assert.equal(notice(), 'continued'); assert.equal(preview(), null); assert.equal(creates, 0); assert.equal(updates, 1);
      const saved = editor.getOnlySelectedShape(), after = snapshot(); assert.equal(saved.id, id); assert.equal(editor.getCurrentPageShapeIds().size, 1);
      assert.equal(container.querySelector(`[data-native-shape="${id}"] path[stroke="#a31764"]`).getAttribute('d'), previewPath);
      assert.deepEqual({ ...saved, props: { ...saved.props, contours: source.props.contours } }, source);
      assert.deepEqual([...curves.contourSegments(saved.props.contours[0])].slice(0, 2), [...curves.contourSegments(source.props.contours[0])]);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
      await act(async () => editor.redo()); assert.deepEqual(snapshot(), after);
      stopCreate(); stopUpdate();
    });
  });

  it('prepends without reversing the original curve and can extend a full page without creating an object', async () => {
    await harness(async h => {
      const { editor, configure, dispatch, snapshot, preview, notice, curves, act } = h;
      await configure({ smoothing: 0, autoClose: false }); const id = await selectSource(h), before = snapshot();
      const source = structuredClone(editor.getShape(id)); editor.options.maxShapesPerPage = editor.getCurrentPageShapeIds().size;
      await dispatch('pointer_down', { x: 0, y: 0 }); await dispatch('pointer_move', { x: -60, y: 50 });
      assert.equal(preview().continuation.end, 'start');
      assert.deepEqual(preview().geometry.contours[0].nodes.map(({ x, y }: any) => ({ x, y })),
        [{ x: -60, y: 50 }, { x: 0, y: 0 }, { x: 100, y: 30 }, { x: 160, y: 80 }]);
      await dispatch('pointer_up', { x: -60, y: 50 }); assert.equal(notice(), 'continued');
      assert.equal(editor.getCurrentPageShapeIds().size, 1); assert.equal(editor.getOnlySelectedShape().id, id);
      assert.deepEqual([...curves.contourSegments(editor.getShape(id).props.contours[0])].slice(1), [...curves.contourSegments(source.props.contours[0])]);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
      await dispatch('pointer_down', { x: 300, y: 200 }); assert.equal(preview(), null); assert.equal(notice(), 'freehand-limit');
      assert.deepEqual(snapshot(), before);
    });
  });

  it('previews native colors in the current theme and cancels a theme-dependent continuation before it can diverge', async () => {
    await harness(async h => {
      const { editor, tldraw, act, tick, dispatch, configure, preview, notice, snapshot, container } = h;
      const colorScheme = editor.user.getUserPreferences().colorScheme;
      try {
        await act(async () => editor.user.updateUserPreferences({ colorScheme: 'dark' }));
        await configure({ autoClose: false }); const id = await selectSource(h), before = snapshot();
        await dispatch('pointer_down', { x: 160, y: 80 }); await dispatch('pointer_move', { x: 220, y: 110 });
        assert.equal(preview().geometry.paint.stroke, tldraw.getDefaultColorTheme({ isDarkMode: true }).red.solid);
        assert.equal(container.querySelector('[data-testid="cad-freehand-source-preview"] path[stroke]:not([stroke="none"])').getAttribute('stroke'), preview().geometry.paint.stroke);
        await act(async () => editor.user.updateUserPreferences({ colorScheme: 'light' })); await tick();
        assert.equal(preview(), null); assert.equal(notice(), 'stale');
        await dispatch('pointer_up', { x: 220, y: 110 }); assert.deepEqual(snapshot(), before);
        await dispatch('pointer_down', { x: 160, y: 80 }); await dispatch('pointer_move', { x: 220, y: 110 });
        assert.equal(preview().geometry.paint.stroke, tldraw.getDefaultColorTheme({ isDarkMode: false }).red.solid);
        await dispatch('pointer_up', { x: 220, y: 110 }); assert.equal(notice(), 'continued');
        assert.equal(editor.getShape(id).props.color, 'red'); assert.deepEqual(editor.getShape(id).meta, {});
        await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
      } finally { await act(async () => editor.user.updateUserPreferences({ colorScheme: colorScheme ?? 'light' })); }
    });
  });

  it('clears idle endpoint hover when options, selection, viewport, or editing availability change', async () => {
    await harness(async h => {
      const { editor, configure, dispatch, controller, container, act, tick } = h;
      const id = await selectSource(h);
      const hover = async () => {
        await dispatch('pointer_move', { x: 160, y: 80 }); assert.ok(controller.cadFreehandHover(editor).get());
      };
      await hover(); await configure({ continueCurve: false });
      assert.equal(controller.cadFreehandHover(editor).get(), null); assert.equal(container.querySelectorAll('[data-testid="cad-freehand-endpoint"]').length, 0);
      await configure({ continueCurve: true }); await hover();
      await act(async () => editor.selectNone()); await tick(); assert.equal(controller.cadFreehandHover(editor).get(), null);
      await act(async () => editor.select(id)); await hover();
      await act(async () => editor.setCamera({ x: 20, y: 10, z: 1 })); await tick(); assert.equal(controller.cadFreehandHover(editor).get(), null);
      await hover(); await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
      assert.equal(controller.cadFreehandHover(editor).get(), null); assert.equal(container.querySelectorAll('[data-testid="cad-freehand-endpoint"]').length, 0);
    });
  });

  for (const end of ['start', 'end']) {
    it(`closes a selected open curve by drawing from its ${end} to the opposite endpoint`, async () => {
      await harness(async h => {
        const { editor, configure, dispatch, preview, notice, snapshot, container, curves, act } = h;
        await configure({ smoothing: .4, autoClose: true }); const id = await selectSource(h), before = snapshot();
        const source = structuredClone(editor.getShape(id)), start = end === 'end' ? { x: 160, y: 80 } : { x: 0, y: 0 };
        const opposite = end === 'end' ? { x: 0, y: 0 } : { x: 160, y: 80 };
        await act(async () => editor.setCamera({ x: 10, y: 20, z: 2 }));
        await dispatch('pointer_down', start); await dispatch('pointer_move', { x: 80, y: 170 });
        await dispatch('pointer_move', { x: opposite.x + 3, y: opposite.y });
        assert.equal(preview().continuation.closing, true); assert.equal(preview().closeCandidate, true);
        const target = container.querySelector('[data-testid="cad-freehand-close-target"]');
        near(Number(target.getAttribute('cx')), opposite.x); near(Number(target.getAttribute('cy')), opposite.y); near(Number(target.getAttribute('r')), 4);
        assert.deepEqual(snapshot(), before);
        await dispatch('pointer_up', { x: opposite.x + 3, y: opposite.y });
        assert.equal(notice(), 'closed'); assert.equal(editor.getOnlySelectedShape().id, id);
        const result = editor.getShape(id).props.contours[0]; assert.equal(result.closed, true);
        assert.deepEqual([...curves.contourSegments(result)].slice(0, 2), [...curves.contourSegments(source.props.contours[0])]);
        assert.equal(container.querySelectorAll('[data-testid="cad-freehand-endpoint"]').length, 0);
        await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
      });
    });
  }

  it('retains grouped transforms and untouched contours while previewing inherited opacity', async () => {
    await harness(async h => {
      const { editor, tldraw, curves, configure, dispatch, preview, snapshot, act, tick, pageContours, notice, container } = h;
      await configure({ smoothing: 0, autoClose: false });
      const group = tldraw.createShapeId('continued-group'), id = tldraw.createShapeId('continued-child'), sibling = tldraw.createShapeId('sibling');
      const contours = [originalCurve(curves), { ...originalCurve(curves), closed: true }];
      await act(async () => {
        editor.setCurrentTool('select'); editor.createShapes([
          { id: group, type: 'group', x: 140, y: 80, rotation: .63, opacity: .5 },
          { id, type: 'cad-bezier', parentId: group, x: 30, y: -20, rotation: -.27, opacity: .6, props: { contours } },
          { id: sibling, type: 'geo', parentId: group, x: 300, y: 20 },
        ]); editor.select(id); editor.mark('group-continuation-fixture'); editor.setCurrentTool('cad-freehand');
      }); await tick();
      const before = snapshot(), source = structuredClone(editor.getShape(id)), parent = structuredClone(editor.getShape(group));
      const start = pageContours(source)[0].nodes.at(-1), finish = { x: start.x + 70, y: start.y + 45 };
      await dispatch('pointer_down', start); await dispatch('pointer_move', finish); near(preview().opacity, .3);
      const artwork = container.querySelector(`[data-native-shape="${id}"]`);
      assert.equal(artwork.style.opacity, '0.3');
      assert.equal(artwork.querySelector('[data-testid="cad-freehand-source-preview"] path[stroke]:not([stroke="none"])').getAttribute('d'),
        curves.curvePathData(preview().continuation.localContours));
      await dispatch('pointer_up', finish); assert.equal(notice(), 'continued');
      const saved = editor.getShape(id); assert.deepEqual(editor.getShape(group), parent);
      assert.deepEqual({ ...saved, props: { ...saved.props, contours: source.props.contours } }, source);
      assert.deepEqual(saved.props.contours[1], contours[1]);
      const endpoint = pageContours(saved)[0].nodes.at(-1); near(endpoint.x, finish.x); near(endpoint.y, finish.y);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
    });
  });

  it('replaces only the rendered source with its complete graft, preserving paint, layers, exports, and cancel restoration', async () => {
    await harness(async h => {
      const { renderToStaticMarkup } = await import('react-dom/server');
      const { editor, curves, configure, dispatch, preview, snapshot, act, container, controller, tldraw, tick } = h;
      await configure({ smoothing: 0, autoClose: false });
      const paint = { fill: 'none', stroke: '#345678', strokeWidth: 16, fillOpacity: 1, strokeOpacity: .5,
        lineCap: 'round', lineJoin: 'miter', miterLimit: 10, dash: [17, 7], dashOffset: 3 };
      const second = { ...originalCurve(curves), closed: true };
      const id = await selectSource(h, { opacity: .5, meta: { omsVectorPaint: paint } }, [originalCurve(curves), second]);
      const otherId = tldraw.createShapeId('overlapping-artwork');
      await act(async () => { editor.createShape({ id: otherId, type: 'cad-bezier', props: { contours: [originalCurve(curves)] } }); editor.mark('artwork-fixture'); });
      await tick();
      const source = editor.getShape(id), before = snapshot(), util = editor.getShapeUtil(source), sourcePath = curves.curvePathData(source.props.contours);
      const exportBefore = renderToStaticMarkup(util.toSvg(source)), indicatorBefore = renderToStaticMarkup(util.indicator(source));
      const sourceContainer = container.querySelector(`[data-native-shape="${id}"]`), otherContainer = container.querySelector(`[data-native-shape="${otherId}"]`);
      const sourceLayer = sourceContainer.style.zIndex, otherLayer = otherContainer.style.zIndex;
      assert.equal(sourceContainer.querySelector('path[stroke="#345678"]').getAttribute('d'), sourcePath);
      await dispatch('pointer_down', { x: 0, y: 0 });
      assert.equal(preview().geometry, null); assert.equal(sourceContainer.querySelector('path[stroke="#345678"]').getAttribute('d'), sourcePath);
      await dispatch('pointer_move', { x: -70, y: 50 });
      const draft = sourceContainer.querySelector('[data-testid="cad-freehand-source-preview"] path[stroke="#345678"]');
      assert.ok(draft); assert.equal(sourceContainer.querySelectorAll('path[stroke="#345678"]').length, 1);
      assert.equal(draft.getAttribute('d'), curves.curvePathData(preview().continuation.localContours));
      assert.equal(draft.getAttribute('stroke-linecap'), 'round'); assert.equal(draft.getAttribute('stroke-linejoin'), 'miter');
      assert.equal(draft.getAttribute('stroke-dasharray'), '17 7'); assert.equal(draft.getAttribute('stroke-dashoffset'), '3');
      assert.equal(draft.getAttribute('stroke-opacity'), '0.5'); assert.equal(sourceContainer.style.opacity, '0.5');
      assert.equal(preview().geometry.contours.length, 2); assert.deepEqual(preview().continuation.localContours[1], second);
      assert.equal(sourceContainer.style.zIndex, sourceLayer); assert.equal(otherContainer.style.zIndex, otherLayer);
      assert.ok(otherContainer.querySelector('path')); assert.equal(otherContainer.querySelector('[data-testid="cad-freehand-source-preview"]'), null);
      assert.equal(container.querySelector('[data-testid="cad-freehand-preview"] path'), null);
      assert.equal(renderToStaticMarkup(util.toSvg(editor.getShape(id))), exportBefore);
      assert.equal(renderToStaticMarkup(util.indicator(editor.getShape(id))), indicatorBefore);
      assert.deepEqual(snapshot(), before);
      await act(async () => controller.cancelCadFreehand(editor));
      assert.equal(sourceContainer.querySelector('[data-testid="cad-freehand-source-preview"]'), null);
      assert.equal(sourceContainer.querySelector('path[stroke="#345678"]').getAttribute('d'), sourcePath); assert.deepEqual(snapshot(), before);
      await dispatch('pointer_down', { x: 0, y: 0 }); await dispatch('pointer_move', { x: -70, y: 50 });
      const finalPath = sourceContainer.querySelector('path[stroke="#345678"]').getAttribute('d');
      await dispatch('pointer_up', { x: -70, y: 50 });
      assert.equal(sourceContainer.querySelector('[data-testid="cad-freehand-source-preview"]'), null);
      assert.equal(sourceContainer.querySelector('path[stroke="#345678"]').getAttribute('d'), finalPath);
      assert.deepEqual(editor.getShape(id).meta.omsVectorPaint, paint); assert.deepEqual(editor.getShape(id).props.contours[1], second);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
      assert.equal(sourceContainer.querySelector('path[stroke="#345678"]').getAttribute('d'), sourcePath);
    });
  });

  it('keeps offset endpoint taps, cancellation, and stale source changes out of continuation history', async () => {
    await harness(async h => {
      const { editor, configure, dispatch, preview, notice, snapshot, controller, act, tick } = h;
      await configure({ smoothing: 0, autoClose: false }); const id = await selectSource(h), before = snapshot();
      await dispatch('pointer_down', { x: 165, y: 82 }); await dispatch('pointer_up', { x: 165, y: 82 });
      assert.equal(notice(), 'freehand-empty'); assert.equal(preview(), null); assert.deepEqual(snapshot(), before);
      await dispatch('pointer_down', { x: 160, y: 80 }); await dispatch('pointer_move', { x: 240, y: 130 });
      await act(async () => controller.cancelCadFreehand(editor)); assert.deepEqual(snapshot(), before); assert.equal(preview(), null);
      await dispatch('pointer_down', { x: 160, y: 80 }); await dispatch('pointer_move', { x: 240, y: 130 });
      await act(async () => editor.updateShape({ id, type: 'cad-bezier', meta: { externalChange: 'keep' } })); await tick();
      const external = snapshot(); assert.equal(preview(), null); assert.equal(notice(), 'stale');
      await dispatch('pointer_up', { x: 300, y: 160 }); assert.deepEqual(snapshot(), external);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
    });
  });

  it('draws a new object outside endpoints or with continuation disabled, and respects Auto close off', async () => {
    await harness(async h => {
      const { editor, configure, dispatch, preview, notice, snapshot, act, curves } = h;
      await configure({ smoothing: 0, autoClose: false }); const id = await selectSource(h), original = structuredClone(editor.getShape(id));
      await dispatch('pointer_down', { x: 160, y: 80 }); await dispatch('pointer_move', { x: 100, y: 180 }); await dispatch('pointer_up', { x: 0, y: 0 });
      assert.equal(notice(), 'continued'); assert.equal(editor.getShape(id).props.contours[0].closed, false);
      assert.deepEqual([...curves.contourSegments(editor.getShape(id).props.contours[0])].slice(0, 2), [...curves.contourSegments(original.props.contours[0])]);
      await act(async () => editor.undo());
      await dispatch('pointer_down', { x: 300, y: 300 }); assert.equal(preview().continuation, null);
      await dispatch('pointer_up', { x: 360, y: 330 }); assert.equal(notice(), 'drawn'); assert.equal(editor.getCurrentPageShapeIds().size, 2);
      assert.deepEqual(editor.getShape(id), original);
      await configure({ continueCurve: false });
      await act(async () => { editor.setCurrentTool('select'); editor.select(id); editor.setCurrentTool('cad-freehand'); });
      assert.equal(editor.getSelectedShapeIds().length, 0); const before = snapshot();
      await dispatch('pointer_down', { x: 160, y: 80 }); assert.equal(preview().continuation, null);
      await dispatch('pointer_up', { x: 220, y: 100 }); assert.equal(notice(), 'drawn'); assert.equal(editor.getCurrentPageShapeIds().size, 3);
      assert.deepEqual(editor.getShape(id), original); await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
    });
  });

  it('creates a pressure dot, but a curve tap leaves the existing redo history intact', async () => {
    await harness(async ({ editor, dispatch, configure, snapshot, preview, notice, act }) => {
      await configure({ mode: 'ink', width: 20 }); const before = snapshot();
      await dispatch('pointer_down', { x: 50, y: 50, z: .7 }, { isPen: true });
      await dispatch('pointer_up', { x: 50, y: 50, z: 0 }, { isPen: true });
      const after = snapshot(); assert.equal(editor.getCurrentPageShapeIds().size, 1);
      await act(async () => { editor.undo(); editor.updateInstanceState({ isPenMode: false }); });
      assert.deepEqual(snapshot(), before); await configure({ mode: 'curve' });
      await dispatch('pointer_down', { x: 20, y: 20 }); await dispatch('pointer_up', { x: 20, y: 20 });
      assert.equal(preview(), null); assert.equal(notice(), 'freehand-empty'); assert.deepEqual(snapshot(), before);
      await act(async () => editor.redo()); assert.deepEqual(snapshot(), after);
    });
  });

  it('uses a momentary barrel eraser from the actual leaf freehand tool and resumes after a midstroke chord', async () => {
    await harness(async ({ editor, canvas, pointer, screen, configure, preview, snapshot, act, penSettings }) => {
      await configure({ mode: 'ink', width: 20, smoothing: 0, autoClose: false });
      await act(async () => penSettings.updateDrawingPenSettings(editor, { barrelAction: 'eraser' }));
      const pen = { pointerType: 'pen', pointerId: 17 };
      const draw = async (y: number) => {
        await pointer(canvas, 'pointerdown', screen({ x: 10, y }), { ...pen, pressure: .5 });
        await pointer(canvas, 'pointermove', screen({ x: 100, y }), { ...pen, pressure: 1 });
        await pointer(canvas, 'pointerup', screen({ x: 100, y }), { ...pen, pressure: 0 });
        return editor.getOnlySelectedShape().id;
      };
      const original = await draw(40), beforeErase = snapshot();
      assert.equal(editor.getPath(), 'cad-freehand');
      await pointer(canvas, 'pointerdown', screen({ x: 50, y: 40 }), { ...pen, button: 2, buttons: 3 });
      assert.equal(editor.getCurrentToolId(), 'eraser'); assert.equal(preview(), null);
      await pointer(canvas, 'pointermove', screen({ x: 80, y: 40 }), { ...pen, buttons: 3 });
      assert.ok(editor.getShape(original));
      await pointer(canvas, 'pointerup', screen({ x: 100, y: 40 }), { ...pen, button: 2, pressure: 0 });
      assert.equal(editor.getShape(original), undefined); assert.equal(editor.getPath(), 'cad-freehand');
      assert.equal(editor.inputs.isPointing, false); assert.equal(editor.inputs.buttons.size, 0);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), beforeErase);

      const retained = await draw(100), beforeChord = snapshot();
      await pointer(canvas, 'pointerdown', screen({ x: 10, y: 160 }), pen);
      await pointer(canvas, 'pointermove', screen({ x: 50, y: 160 }), pen);
      assert.ok(preview()); assert.deepEqual(snapshot(), beforeChord);
      await pointer(canvas, 'pointermove', screen({ x: 50, y: 40 }), { ...pen, button: 2, buttons: 3 });
      assert.equal(preview(), null); assert.equal(editor.getCurrentToolId(), 'eraser');
      await pointer(canvas, 'pointermove', screen({ x: 80, y: 40 }), { ...pen, buttons: 3 });
      await pointer(canvas, 'pointermove', screen({ x: 100, y: 40 }), { ...pen, button: 2, buttons: 1 });
      assert.equal(editor.getPath(), 'cad-freehand'); assert.ok(preview());
      assert.equal(editor.getShape(original), undefined); assert.ok(editor.getShape(retained));
      await pointer(canvas, 'pointermove', screen({ x: 130, y: 65 }), pen);
      await pointer(canvas, 'pointerup', screen({ x: 150, y: 75 }), { ...pen, pressure: 0 });
      const result = editor.getOnlySelectedShape();
      assert.equal(result.type, 'cad-bezier'); assert.equal(editor.getCurrentPageShapeIds().size, 2);
      assert.equal(preview(), null); assert.equal(editor.inputs.isPointing, false); assert.equal(editor.inputs.buttons.size, 0);
      await act(async () => editor.undo()); assert.equal(editor.getShape(result.id), undefined); assert.ok(editor.getShape(retained));
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), beforeChord);
    }, true);
  });

  for (const reason of ['Escape', 'public cancel', 'pointercancel', 'lostpointercapture', 'blur', 'form focus', 'tool switch']) {
    it(`discards a mouse preview on ${reason} without touching artwork or undo history`, async () => {
      await harness(async ({ editor, env, canvas, pointer, screen, snapshot, preview, notice, container, key, controller, act, tick, dispatch }) => {
        await dispatch('pointer_down', { x: 1, y: 1 }); await dispatch('pointer_up', { x: 30, y: 30 });
        const saved = snapshot(); await act(async () => editor.undo()); const before = snapshot();
        await pointer(canvas, 'pointerdown', screen({ x: 20, y: 40 }));
        await pointer(canvas, 'pointermove', screen({ x: 80, y: 60 })); assert.ok(preview());
        if (reason === 'Escape') await key('Escape');
        else if (reason === 'public cancel') await act(async () => controller.cancelCadFreehand(editor));
        else if (reason === 'pointercancel' || reason === 'lostpointercapture') await pointer(canvas, reason, screen({ x: 80, y: 60 }));
        else if (reason === 'blur') await act(async () => env.win.dispatchEvent(new Event('blur')));
        else if (reason === 'form focus') await act(async () => container.querySelector('input').focus());
        else await act(async () => editor.setCurrentTool('select'));
        await tick(); assert.equal(preview(), null); assert.equal(notice(), 'canceled'); assert.deepEqual(snapshot(), before);
        assert.equal(editor.inputs.isPointing, false); assert.equal(editor.inputs.isDragging, false); assert.equal(editor.inputs.buttons.has(0), false);
        await act(async () => editor.redo()); assert.deepEqual(snapshot(), saved);
        assert.equal(env.captures.size, 0);
      });
    });
  }

  for (const change of ['camera', 'viewport', 'page', 'readonly', 'document', 'options', 'opacity', 'selection']) {
    it(`invalidates a pending stroke when ${change} changes and preserves the external change`, async () => {
      await harness(async ({ editor, dispatch, preview, notice, snapshot, act, tick, engine, tldraw }) => {
        const id = tldraw.createShapeId('external');
        await act(async () => { editor.createShape({ id, type: 'geo', x: 300, y: 300 }); editor.mark('external-fixture'); });
        await dispatch('pointer_down', { x: 10, y: 20 }); await dispatch('pointer_move', { x: 100, y: 50 });
        assert.ok(preview());
        await act(async () => {
          if (change === 'camera') editor.setCamera({ x: 10, y: 20, z: 2 });
          else if (change === 'viewport') editor.updateViewportScreenBounds(new tldraw.Box(190, 100, 800, 600));
          else if (change === 'page') { editor.createPage({ id: tldraw.PageRecordType.createId('another'), name: 'Another' }); editor.setCurrentPage(tldraw.PageRecordType.createId('another')); }
          else if (change === 'readonly') editor.updateInstanceState({ isReadonly: true });
          else if (change === 'document') editor.updateShape({ id, type: 'geo', x: 310 });
          else if (change === 'options') engine.setCadFreehandOptions(editor, { width: 10 });
          else if (change === 'opacity') editor.updateInstanceState({ opacityForNextShape: .5 });
          else editor.select(id);
        });
        await tick(); assert.equal(preview(), null); assert.ok(['stale', 'canceled'].includes(notice()));
        const externallyChanged = snapshot();
        await dispatch('pointer_up', { x: 120, y: 60 }); assert.deepEqual(snapshot(), externallyChanged);
      });
    });
  }

  it('rejects other pointer contacts and shared custom gestures, while preserving form input events', async () => {
    await harness(async ({ editor, canvas, container, pointer, dispatch, screen, preview, snapshot, gesture, act, tick }) => {
      const before = snapshot();
      const release = gesture.claimDrawingPointerGesture(editor, 'guide', 88);
      await dispatch('pointer_down', { x: 10, y: 10 }); assert.equal(preview(), null);
      release();
      const input = container.querySelector('input'); let inputs = 0;
      input.addEventListener('pointerdown', () => { inputs++; });
      await pointer(input, 'pointerdown', screen({ x: 10, y: 10 })); assert.equal(inputs, 1); assert.equal(preview(), null);
      await pointer(canvas, 'pointerdown', screen({ x: 20, y: 20 }), { pointerId: 1 });
      const secondary = await pointer(canvas, 'pointerdown', screen({ x: 400, y: 400 }), { pointerId: 2 });
      assert.equal(secondary.defaultPrevented, true);
      await dispatch('pointer_move', { x: 450, y: 450 }, { pointerId: 2 });
      await dispatch('pointer_up', { x: 500, y: 500 }, { pointerId: 2 });
      assert.deepEqual(preview().samples, [{ x: 20, y: 20, pressure: 1 }]); assert.deepEqual(snapshot(), before);
      await act(async () => editor.cancel()); await tick(); assert.equal(preview(), null);
    });
  });

  it('does not begin a stroke on a protected form record or its descendants', async () => {
    await harness(async ({ editor, dispatch, preview, snapshot, tldraw, act }) => {
      const parent = tldraw.createShapeId('form'), child = tldraw.createShapeId('inside-form');
      await act(async () => editor.createShapes([{ id: parent, type: 'order-details', x: 0, y: 0 },
        { id: child, parentId: parent, type: 'geo', x: 10, y: 10 }]));
      const before = snapshot();
      for (const id of [parent, child]) {
        await dispatch('pointer_down', { x: 10, y: 20 }, { target: 'shape', shape: editor.getShape(id) });
        await dispatch('pointer_up', { x: 100, y: 50 }, { target: 'shape', shape: editor.getShape(id) });
        assert.equal(preview(), null); assert.deepEqual(snapshot(), before);
      }
    });
  });

  it('uses an eight-screen-pixel closure target at every zoom and respects Auto close off', async () => {
    await harness(async ({ editor, dispatch, configure, preview, container, act }) => {
      await configure({ smoothing: 0, autoClose: true });
      await act(async () => editor.setCamera({ x: 10, y: 20, z: 2 }));
      const stroke = async (end: number) => {
        await dispatch('pointer_down', { x: 10, y: 10 }); await dispatch('pointer_move', { x: 100, y: 10 });
        await dispatch('pointer_move', { x: 100, y: 100 }); await dispatch('pointer_move', { x: end, y: 10 });
      };
      await stroke(13); assert.equal(preview().closeCandidate, true);
      near(Number(container.querySelector('[data-testid="cad-freehand-close-target"]').getAttribute('r')), 4);
      await dispatch('pointer_up', { x: 13, y: 10 }); assert.equal(editor.getOnlySelectedShape().props.contours[0].closed, true);
      await stroke(15); assert.equal(preview().closeCandidate, false);
      await dispatch('pointer_up', { x: 15, y: 10 }); assert.equal(editor.getOnlySelectedShape().props.contours[0].closed, false);
      await configure({ autoClose: false }); await stroke(10); assert.equal(preview().closeCandidate, false);
      assert.equal(container.querySelector('[data-testid="cad-freehand-close-target"]'), null);
      await dispatch('pointer_up', { x: 10, y: 10 }); assert.equal(editor.getOnlySelectedShape().props.contours[0].closed, false);
    });
  });

  it('bounds sample growth and rejects an oversized stroke without a partial commit', async () => {
    await harness(async ({ editor, dispatch, screen, snapshot, preview, notice, engine, act, tick }) => {
      const before = snapshot(); await dispatch('pointer_down', { x: 0, y: 0 });
      await act(async () => {
        for (let i = 1; i <= engine.MAX_CAD_FREEHAND_SAMPLES; i++) {
          const point = screen({ x: i / 10, y: i / 100 });
          editor.dispatch({ type: 'pointer', name: 'pointer_move', target: 'canvas', point: { x: point.x, y: point.y, z: 1 },
            pointerId: 1, button: 0, isPen: false, shiftKey: false, ctrlKey: false, altKey: false });
        }
        const point = screen({ x: 500, y: 50 });
        editor.dispatch({ type: 'pointer', name: 'pointer_up', target: 'canvas', point: { x: point.x, y: point.y, z: 0 },
          pointerId: 1, button: 0, isPen: false, shiftKey: false, ctrlKey: false, altKey: false });
      });
      await tick(); assert.equal(preview(), null); assert.equal(notice(), 'freehand-limit'); assert.deepEqual(snapshot(), before);
    });
  });

  it('cleans up queued previews and pointer capture on editor disposal', async () => {
    await harness(async ({ editor, canvas, pointer, screen, preview, snapshot, env, act, tick }) => {
      const before = snapshot(); await pointer(canvas, 'pointerdown', screen({ x: 10, y: 20 })); assert.ok(preview());
      await act(async () => editor.dispose()); await tick();
      assert.equal(preview(), null); assert.equal(env.captures.size, 0); assert.deepEqual(snapshot(), before);
    });
  });
});
