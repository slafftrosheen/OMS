import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (actual: number, expected: number, message = '') => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);
const nearPoint = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
  near(actual.x, expected.x, 'X'); near(actual.y, expected.y, 'Y');
};

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
  win.Element.prototype.releasePointerCapture = function (id: number) { if (captures.get(id) === this) captures.delete(id); };
  win.HTMLImageElement.prototype.decode = async () => {};
  values.getComputedStyle = win.getComputedStyle.bind(win);
  values.requestAnimationFrame = win.requestAnimationFrame.bind(win);
  values.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
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

/** Use native state/history/event hooks, with the React root outside the editor
 * container just as in CanvasApp. No browser process or visual claims. */
async function harness(run: (value: any) => Promise<void>) {
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
  const { DrawingPickSelectionForeground } = await import('../../src/lib/components/canvas/DrawingPickSelectionForeground');
  const skew = await import('../../src/lib/components/canvas/drawing-pick-skew');
  const numeric = await import('../../src/lib/components/canvas/drawing-skew');
  const pivot = await import('../../src/lib/components/canvas/drawing-rotation-pivot');
  const rotation = await import('../../src/lib/components/canvas/drawing-pick-rotation');
  const clickToggle = await import('../../src/lib/components/canvas/drawing-pick-click-toggle');
  const snapping = await import('../../src/lib/components/canvas/drawing-pick-guide-snap');
  const guides = await import('../../src/lib/components/canvas/drawing-guides');
  const { DrawingGuideOverlay } = await import('../../src/lib/components/canvas/DrawingGuideOverlay');
  const { installCadTransforms } = await import('../../src/lib/components/canvas/cad-transforms');
  const gesture = await import('../../src/lib/components/canvas/drawing-pointer-gesture');
  const cad = await import('../../src/lib/components/canvas/cad-settings');
  const nodes = await import('../../src/lib/components/canvas/cad-node-selection');
  const { VECTOR_DEFAULT_PAINT } = await import('../../src/lib/components/canvas/cad-paint');
  const { nodeAt } = await import('../../src/lib/components/canvas/cad-curves');
  // Register the protected form record type without its unrelated application
  // data bridge: production selection guards must still reject it and its tree.
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
  function Canvas({ editor }: { editor: any }) {
    useDocumentEvents();
    const events = useCanvasEvents();
    const bounds = tldraw.useValue('pivot test selection bounds', () => editor.getSelectionRotatedPageBounds(), [editor]);
    const angle = tldraw.useValue('pivot test selection angle', () => editor.getSelectionRotation(), [editor]);
    return <div className="tl-canvas" tabIndex={0} {...events}>
      <DrawingGuideOverlay />
      {bounds && <DrawingPickSelectionForeground bounds={bounds} rotation={angle} />}
      <div className="canvas-form-sheet" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
        <input aria-label="Order address" defaultValue="Rīga" />
      </div>
    </div>;
  }
  function Application({ editor }: { editor: any }) {
    return <div data-testid="drawing-workspace"><div className="drawing-viewport">
      <div className="tl-container" tabIndex={0} ref={containerRef}>
        {editor && <tldraw.ContainerProvider container={container}><EditorContext.Provider value={editor}>
          <EditorComponentsProvider><Canvas editor={editor} /></EditorComponentsProvider>
        </EditorContext.Provider></tldraw.ContainerProvider>}
      </div>
    </div></div>;
  }
  await act(async () => root.render(<Application editor={null} />));
  const editor = new tldraw.Editor({
    store: tldraw.createTLStore({ shapeUtils, bindingUtils: tldraw.defaultBindingUtils }), shapeUtils,
    bindingUtils: tldraw.defaultBindingUtils, tools: [...tldraw.defaultTools, ...tldraw.defaultShapeTools],
    getContainer: () => container, initialState: 'select', options: { doubleClickDurationMs: 180, multiClickDurationMs: 100 },
  });
  editor.updateViewportScreenBounds(new tldraw.Box(rect.x, rect.y, rect.width, rect.height));
  editor.updateInstanceState({ isFocused: true });
  editor.user.updateUserPreferences({ isSnapMode: true });
  // Preserve CanvasApp's production installation order at the public hooks.
  const stopTransforms = installCadTransforms(editor);
  const stopSkew = skew.installDrawingSkewMode(editor);
  const stopPivot = pivot.installDrawingRotationPivot(editor);
  const stopSnap = snapping.installDrawingPickGuideSnapping(editor);
  const stopClick = clickToggle.installDrawingPickClickToggle(editor);
  try {
    await act(async () => root.render(<Application editor={editor} />));
    const tick = async (ms = 24) => { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); };
    const pointer = async (element: EventTarget, name: string, point: { x: number; y: number }, options: any = {}) => {
      const { pointerId = 1, pointerType = 'mouse', isPrimary = true, ...mouse } = options;
      const event = new MouseEvent(name, { bubbles: true, cancelable: true, button: 0, buttons: name === 'pointerup' ? 0 : 1,
        clientX: point.x, clientY: point.y, ...mouse });
      Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType }, isPrimary: { value: isPrimary }, pressure: { value: .5 } });
      await act(async () => { element.dispatchEvent(event); }); await tick(); return event;
    };
    const key = async (element: EventTarget, name: 'keydown' | 'keyup', value: string, options: ConstructorParameters<typeof KeyboardEvent>[1] = {}) => {
      const event = new KeyboardEvent(name, { key: value, code: value, bubbles: true, cancelable: true, ...options });
      await act(async () => { element.dispatchEvent(event); }); await tick(); return event;
    };
    const press = async (element: EventTarget, value: string, options: ConstructorParameters<typeof KeyboardEvent>[1] = {}) => {
      await key(element, 'keydown', value, options); await key(element, 'keyup', value, options);
    };
    const add = async (name = 'curve', extra: Record<string, unknown> = {}) => {
      const id = tldraw.createShapeId(name);
      await act(async () => {
        editor.createShape({ id, type: 'cad-path', x: 100, y: 100, props: { closed: true,
          points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }] }, ...extra } as any);
        editor.select(id); editor.mark('pivot-test-fixture');
      }); return id;
    };
    const enable = async () => { await act(async () => assert.equal(skew.setDrawingSkewMode(editor, true), true)); await tick(); };
    const screen = (point: { x: number; y: number }) => editor.pageToScreen(point);
    const snapshot = () => structuredClone(editor.store.getStoreSnapshot('document'));
    const corner = (name = 'top_left_rotate') => container.querySelector(`[data-drawing-rotate-corner="${name}"]`) as SVGGElement;
    const pivotControl = () => container.querySelector('[data-drawing-rotation-pivot]') as SVGGElement;
    const setPivot = async (point: { x: number; y: number } | null) => {
      await act(async () => assert.equal(pivot.setDrawingRotationPivot(editor, point), true)); await tick();
    };
    const points = (id: string) => {
      const shape = editor.getShape(id as any)!, transform = editor.getShapePageTransform(shape);
      const props = shape.props as any;
      return (shape.type === 'cad-path' ? props.points : props.contours.flatMap((contour: any) => contour.nodes.flatMap((node: any) => [
        { x: node.x, y: node.y }, { x: node.x + node.inX, y: node.y + node.inY }, { x: node.x + node.outX, y: node.y + node.outY },
      ]))).map((point: { x: number; y: number }) => { const value = transform.applyToPoint(point); return { x: value.x, y: value.y }; });
    };
    const addGuide = async (axis: 'x' | 'y', position: number, id = `guide:integration-${axis}`) => {
      await act(async () => assert.equal(guides.applyDrawingGuideChange(editor, guides.prepareDrawingGuideChange(editor, { kind: 'add', axis, position, id })), true));
    };
    await run({ snapping, guides, addGuide, env, editor, container, canvas: container.querySelector('.tl-canvas'), host, act, tick, pointer, key, press,
      add, enable, screen, snapshot, corner, pivotControl, setPivot, points, skew, numeric, pivot, rotation, gesture, cad, nodes, tldraw, VECTOR_DEFAULT_PAINT, nodeAt });
  } finally {
    await act(async () => { stopClick(); stopSnap(); rotation.cancelDrawingRotationPointer(editor); root.unmount(); stopPivot(); stopSkew(); stopTransforms(); gesture.clearDrawingKeyReleases(editor); });
    editor.dispose(); host.remove(); env.restore();
  }
}


describe('combined Pick click, pivot and guideline controller integration', () => {
  it('retains a selected group and its custom pivot across repeated-click mode toggles without document writes', async () => {
    await harness(async ({ editor, add, addGuide, enable, setPivot, pivot, skew, snapping, canvas, pointer, screen, snapshot, act, tick }) => {
      const a = await add('combined-a'), b = await add('combined-b', { x: 270, y: 120 });
      await act(async () => { editor.select(a, b); editor.groupShapes([a, b]); });
      const group = editor.getOnlySelectedShapeId(); await addGuide('x', 300); await enable();
      const center = { x: 40, y: 30 }; await setPivot(center); const before = snapshot();
      for (const active of [false, true]) {
        await pointer(canvas, 'pointerdown', screen({ x: 150, y: 100 }));
        await pointer(canvas, 'pointerup', screen({ x: 150, y: 100 }));
        assert.deepEqual(editor.getSelectedShapeIds(), [group]);
        await tick(editor.options.doubleClickDurationMs + 30);
        assert.equal(skew.isDrawingSkewMode(editor), active);
        assert.deepEqual(editor.getSelectedShapeIds(), [group]);
        assert.deepEqual(pivot.readDrawingRotationPivot(editor), { point: center, custom: true });
        assert.deepEqual(snapshot(), before); assert.equal(snapping.drawingPickGuideSnap(editor).get(), null);
      }
    });
  });

  it('keeps custom rotation exact beside tempting guides and retains one Undo with all controllers installed', async () => {
    await harness(async ({ editor, add, addGuide, enable, setPivot, pivot, skew, rotation, snapping, gesture, corner, pointer, screen, points, snapshot, act, tick }) => {
      const id = await add(); await addGuide('x', -27); await addGuide('y', 93); await enable();
      const center = { x: 40, y: 30 }; await setPivot(center);
      const before = snapshot(), original = points(id);
      const start = { x: 210, y: 90 }, end = { x: -20, y: 200 };
      await pointer(corner('top_right_rotate'), 'pointerdown', screen(start));
      await pointer(document.body, 'pointermove', screen(end));
      assert.equal(editor.getPath(), 'select.idle'); assert.equal(gesture.isDrawingPointerGestureActive(editor), true);
      assert.equal(snapping.drawingPickGuideSnap(editor).get(), null); assert.deepEqual(snapshot(), before);
      await pointer(document.body, 'pointerup', screen(end));
      points(id).forEach((point: any, index: number) => nearPoint(point, {
        x: center.x - (original[index].y - center.y), y: center.y + original[index].x - center.x,
      }));
      near(editor.getShape(id).x, -30); near(editor.getShape(id).y, 90);
      assert.equal(snapping.drawingPickGuideSnap(editor).get(), null); assert.equal(rotation.drawingRotationPreview(editor).get(), null);
      assert.equal(gesture.isDrawingPointerGestureActive(editor), false);
      const after = snapshot(); await tick(editor.options.doubleClickDurationMs + 30); assert.equal(skew.isDrawingSkewMode(editor), true);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
      nearPoint(pivot.readDrawingRotationPivot(editor).point, center);
      await act(async () => editor.redo()); assert.deepEqual(snapshot(), after);
    });
  });

  it('hands ordinary drag back to native guide snapping after click toggles while keeping a fixed pivot and exact Undo/Escape', async () => {
    await harness(async ({ editor, add, addGuide, setPivot, pivot, skew, snapping, canvas, pointer, screen, snapshot, press, container, act, tick }) => {
      const id = await add(); await addGuide('x', 300); await addGuide('y', 300);
      await pointer(canvas, 'pointerdown', screen({ x: 150, y: 100 }));
      await pointer(canvas, 'pointerup', screen({ x: 150, y: 100 }));
      await tick(editor.options.doubleClickDurationMs + 30); assert.equal(skew.isDrawingSkewMode(editor), true);
      const center = { x: 40, y: 30 }; await setPivot(center); const before = snapshot();
      const move = async () => {
        await pointer(canvas, 'pointerdown', screen({ x: 150, y: 100 })); await tick(150);
        await pointer(canvas, 'pointermove', screen({ x: 353, y: 304 })); await tick(170);
        // A tiny physical move avoids the DOM hook's duplicate-coordinate filter
        // after native velocity settles below its snap threshold.
        await pointer(canvas, 'pointermove', screen({ x: 353.1, y: 304.1 }));
        assert.equal(editor.getPath(), 'select.translating');
        near(editor.getShape(id).x, 300); near(editor.getShape(id).y, 300);
        assert.equal(snapping.drawingPickGuideSnap(editor).get()?.guides.length, 2);
      };
      await move(); await pointer(canvas, 'pointerup', screen({ x: 353.1, y: 304.1 }));
      const after = snapshot(); nearPoint(pivot.readDrawingRotationPivot(editor).point, center);
      assert.equal(snapping.drawingPickGuideSnap(editor).get(), null);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
      await act(async () => editor.redo()); assert.deepEqual(snapshot(), after);
      await act(async () => editor.undo()); await tick(editor.options.doubleClickDurationMs + 30);
      await move(); await press(container, 'Escape');
      await pointer(canvas, 'pointerup', screen({ x: 353.1, y: 304.1 }));
      assert.deepEqual(snapshot(), before); assert.equal(snapping.drawingPickGuideSnap(editor).get(), null);
      assert.equal(skew.isDrawingSkewMode(editor), true); nearPoint(pivot.readDrawingRotationPivot(editor).point, center);
    });
  });

  it('cancels a pending click toggle when the pivot takes pointer ownership and does not revive it after Escape', async () => {
    await harness(async ({ editor, add, addGuide, enable, setPivot, pivot, skew, rotation, snapping, gesture, canvas, pivotControl, pointer, press, screen, snapshot, tick }) => {
      await add(); await addGuide('x', 300); await enable(); const center = { x: 40, y: 30 }; await setPivot(center);
      const before = snapshot();
      await pointer(canvas, 'pointerdown', screen({ x: 150, y: 100 }));
      await pointer(canvas, 'pointerup', screen({ x: 150, y: 100 }));
      await pointer(pivotControl(), 'pointerdown', screen(center));
      await pointer(document.body, 'pointermove', screen({ x: 65, y: 50 }));
      await tick(editor.options.doubleClickDurationMs + 30);
      assert.equal(skew.isDrawingSkewMode(editor), true); assert.equal(rotation.drawingRotationPreview(editor).get()?.kind, 'pivot');
      assert.equal(gesture.isDrawingPointerGestureActive(editor), true); assert.equal(snapping.drawingPickGuideSnap(editor).get(), null);
      await press(pivotControl(), 'Escape');
      await pointer(document.body, 'pointerup', screen({ x: 65, y: 50 }));
      await tick(editor.options.doubleClickDurationMs + 30);
      assert.equal(skew.isDrawingSkewMode(editor), true); nearPoint(pivot.readDrawingRotationPivot(editor).point, center);
      assert.equal(gesture.isDrawingPointerGestureActive(editor), false); assert.deepEqual(snapshot(), before);
    });
  });
});
