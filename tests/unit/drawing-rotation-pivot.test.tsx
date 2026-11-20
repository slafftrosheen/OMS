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
    getContainer: () => container, initialState: 'select',
  });
  editor.updateViewportScreenBounds(new tldraw.Box(rect.x, rect.y, rect.width, rect.height));
  editor.updateInstanceState({ isFocused: true });
  const stopSkew = skew.installDrawingSkewMode(editor);
  const stopPivot = pivot.installDrawingRotationPivot(editor);
  try {
    await act(async () => root.render(<Application editor={editor} />));
    const tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 24)); }); };
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
    await run({ env, editor, container, canvas: container.querySelector('.tl-canvas'), host, act, tick, pointer, key, press,
      add, enable, screen, snapshot, corner, pivotControl, setPivot, points, skew, numeric, pivot, rotation, gesture, cad, nodes, tldraw, VECTOR_DEFAULT_PAINT, nodeAt });
  } finally {
    await act(async () => { rotation.cancelDrawingRotationPointer(editor); root.unmount(); stopPivot(); stopSkew(); });
    editor.dispose(); host.remove(); env.restore();
  }
}

describe('Pick rotation pivot with real editor and DOM events', () => {
  it('keeps a custom pivot outside the document and restores the native selection center on reset', async () => {
    await harness(async ({ editor, add, enable, pivot, setPivot, snapshot }) => {
      await add(); await enable(); const before = snapshot();
      nearPoint(pivot.readDrawingRotationPivot(editor).point, { x: 150, y: 140 });
      assert.equal(pivot.readDrawingRotationPivot(editor).custom, false);
      await setPivot({ x: -25, y: 70 });
      assert.deepEqual(pivot.readDrawingRotationPivot(editor), { point: { x: -25, y: 70 }, custom: true });
      assert.deepEqual(snapshot(), before);
      await setPivot(null); nearPoint(pivot.readDrawingRotationPivot(editor).point, { x: 150, y: 140 });
      assert.equal(pivot.readDrawingRotationPivot(editor).custom, false); assert.deepEqual(snapshot(), before);
    });
  });

  it('drags the pivot without a target-offset jump or document writes at a nonzero camera offset and zoom', async () => {
    await harness(async ({ editor, env, add, enable, pivot, rotation, gesture, pivotControl, pointer, screen, snapshot, act }) => {
      await add(); await enable();
      await act(async () => editor.setCamera({ x: 20, y: -35, z: 2 }));
      const before = snapshot(), original = pivot.readDrawingRotationPivot(editor).point;
      const start = screen({ x: original.x + 3, y: original.y - 2 });
      const end = { x: start.x + 140, y: start.y - 60 };
      await pointer(pivotControl(), 'pointerdown', start);
      assert.equal(editor.getPath(), 'select.idle'); assert.equal(gesture.isDrawingPointerGestureActive(editor), true);
      nearPoint(rotation.drawingRotationPreview(editor).get().point, original);
      await pointer(document.body, 'pointermove', end);
      nearPoint(rotation.drawingRotationPreview(editor).get().point, { x: original.x + 70, y: original.y - 30 });
      assert.deepEqual(snapshot(), before); assert.equal(pivot.readDrawingRotationPivot(editor).custom, false);
      await pointer(document.body, 'pointerup', end);
      nearPoint(pivot.readDrawingRotationPivot(editor).point, { x: original.x + 70, y: original.y - 30 });
      assert.equal(pivot.readDrawingRotationPivot(editor).custom, true); assert.deepEqual(snapshot(), before);
      assert.equal(rotation.drawingRotationPreview(editor).get(), null); assert.equal(gesture.isDrawingPointerGestureActive(editor), false);
      assert.equal(env.captures.size, 0);
    });
  });

  it('resets the pivot with double-click and Home while preserving the artwork selection', async () => {
    await harness(async ({ editor, add, enable, setPivot, pivot, pivotControl, press, snapshot, act, tick }) => {
      const id = await add(); await enable(); const before = snapshot();
      await setPivot({ x: -25, y: 70 });
      await act(async () => pivotControl().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0 })));
      await tick(); assert.equal(pivot.readDrawingRotationPivot(editor).custom, false);
      await setPivot({ x: -25, y: 70 }); await press(pivotControl(), 'Home');
      assert.equal(pivot.readDrawingRotationPivot(editor).custom, false); assert.deepEqual(snapshot(), before);
      assert.deepEqual(editor.getSelectedShapeIds(), [id]); assert.equal(editor.getPath(), 'select.idle');
    });
  });

  for (const name of ['top_left_rotate', 'top_right_rotate', 'bottom_right_rotate', 'bottom_left_rotate'])
    it(`rotates exact curve geometry from the ${name} corner around a custom pivot in one Undo`, async () => {
      await harness(async ({ editor, add, enable, setPivot, pivot, rotation, gesture, corner, pointer, screen, snapshot, points, act }) => {
        const id = await add(); await enable(); const center = { x: 40, y: 30 }; await setPivot(center);
        const before = snapshot(), oldPoints = points(id);
        const start = { x: name.includes('left') ? 90 : 210, y: name.includes('top') ? 90 : 190 };
        const end = { x: center.x + start.y - center.y, y: center.y - (start.x - center.x) };
        await pointer(corner(name), 'pointerdown', screen(start));
        assert.equal(editor.getPath(), 'select.idle');
        await pointer(document.body, 'pointermove', screen(end));
        assert.deepEqual(snapshot(), before); near(rotation.drawingRotationPreview(editor).get().angle, 90);
        await pointer(document.body, 'pointerup', screen(end));
        const after = snapshot();
        points(id).forEach((point: any, i: number) => nearPoint(point, { x: center.x + oldPoints[i].y - center.y, y: center.y - (oldPoints[i].x - center.x) }));
        assert.deepEqual(editor.getShape(id).props, before.store[id].props);
        assert.equal(gesture.isDrawingPointerGestureActive(editor), false); assert.equal(rotation.drawingRotationPreview(editor).get(), null);
        await act(async () => editor.undo()); assert.deepEqual(snapshot(), before); nearPoint(pivot.readDrawingRotationPivot(editor).point, center);
        await act(async () => editor.redo()); assert.deepEqual(snapshot(), after); nearPoint(pivot.readDrawingRotationPivot(editor).point, center);
      });
    });

  it('uses the short angle across the pointer branch cut instead of making an almost full turn', async () => {
    await harness(async ({ editor, add, enable, setPivot, rotation, corner, pointer, screen }) => {
      await add(); await enable();
      const start = { x: 90, y: 90 }, a = 179 * Math.PI / 180, b = -179 * Math.PI / 180;
      const center = { x: start.x - 100 * Math.cos(a), y: start.y - 100 * Math.sin(a) };
      const end = { x: center.x + 100 * Math.cos(b), y: center.y + 100 * Math.sin(b) };
      await setPivot(center); await pointer(corner(), 'pointerdown', screen(start));
      await pointer(document.body, 'pointermove', screen(end));
      near(rotation.drawingRotationPreview(editor).get().angle, -2);
      await pointer(document.body, 'pointercancel', screen(end));
    });
  });

  it('rotates nested groups and compound-hole control points while preserving local curves and metadata', async () => {
    await harness(async ({ editor, tldraw, nodeAt, VECTOR_DEFAULT_PAINT, enable, setPivot, rotation, points, snapshot, act }) => {
      const outer = tldraw.createShapeId('outer'), group = tldraw.createShapeId('inner'), a = tldraw.createShapeId('compound'), b = tldraw.createShapeId('sibling');
      const gradient = { type: 'linear', matrix: [1, 0, 0, 1, 0, 0], start: [0, 0], end: [100, 0], r0: 0, r1: 1,
        stops: [{ offset: 0, color: '#ff0000', opacity: 1 }, { offset: 1, color: '#0000ff', opacity: 1 }] };
      await act(async () => {
        editor.createShapes([
          { id: outer, type: 'group', x: 350, y: 220, rotation: .6 },
          { id: group, type: 'group', parentId: outer, x: 40, y: 20, rotation: .3 },
          { id: a, type: 'cad-bezier', parentId: group, x: 20, y: 15, props: { fillRule: 'evenodd', contours: [
            { closed: true, nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }].map(nodeAt) },
            { closed: true, nodes: [{ x: 20, y: 20 }, { x: 20, y: 60 }, { x: 70, y: 60 }, { x: 70, y: 20 }].map(nodeAt) },
          ] }, meta: { omsObjectName: 'Compound letter', retained: 'audit', omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, gradient } } },
          { id: b, type: 'cad-path', parentId: outer, x: 240, y: 70, props: { points: [{ x: 0, y: 0 }, { x: 40, y: 30 }], closed: false } },
        ]); editor.setSelectedShapes([group, a]); editor.mark('nested-pivot-fixture');
      });
      await enable(); const center = { x: -30, y: 20 }; await setPivot(center);
      const before = snapshot(), curvePoints = points(a), siblingPoints = points(b);
      await act(async () => assert.equal(rotation.rotateDrawingAroundPivot(editor, 90), true));
      points(a).forEach((point: any, i: number) => nearPoint(point, { x: center.x + curvePoints[i].y - center.y, y: center.y - (curvePoints[i].x - center.x) }));
      points(b).forEach((point: any, i: number) => nearPoint(point, siblingPoints[i]));
      assert.deepEqual(editor.getShape(a).props, before.store[a].props); assert.deepEqual(editor.getShape(a).meta, before.store[a].meta);
      assert.equal(editor.getShape(a).parentId, group); assert.equal(editor.getShape(group).parentId, outer);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
    });
  });

  it('nudges only the pivot in physical units with upward CAD Y and Super/Micro increments', async () => {
    await harness(async ({ editor, add, enable, cad, setPivot, pivot, pivotControl, press, snapshot, act }) => {
      const id = await add();
      const settings = { ...cad.DEFAULT_CAD_SETTINGS, unit: 'in', scale: 4, originX: 80, originY: 600, nudge: .25 };
      await act(async () => cad.writeCadSettings(editor, settings)); await enable();
      await setPivot(cad.cadPointToCanvas({ x: 2, y: 3 }, settings)); const before = snapshot();
      await press(pivotControl(), 'ArrowUp');
      nearPoint(cad.canvasPointToCad(pivot.readDrawingRotationPivot(editor).point, settings), { x: 2, y: 3.25 });
      await press(pivotControl(), 'ArrowRight', { shiftKey: true });
      await press(pivotControl(), 'ArrowLeft', { ctrlKey: true });
      nearPoint(cad.canvasPointToCad(pivot.readDrawingRotationPivot(editor).point, settings), { x: 4.475, y: 3.25 });
      assert.deepEqual(snapshot(), before); assert.deepEqual(editor.getSelectedShapeIds(), [id]); assert.equal(editor.getPath(), 'select.idle');
    });
  });

  it('rotates a selected group from custom-corner keys and keeps native Enter release from drilling into it', async () => {
    await harness(async ({ editor, add, enable, setPivot, corner, press, snapshot, points, act, container }) => {
      const a = await add('left'), b = await add('right', { x: 300 });
      await act(async () => editor.groupShapes([a, b]));
      const group = editor.getOnlySelectedShape(); assert.equal(group?.type, 'group');
      await enable(); const center = { x: 40, y: 30 }; await setPivot(center);
      const oldPoints = points(a), requests: unknown[] = [];
      container.addEventListener('oms:drawing-ui-request', (event: CustomEvent) => requests.push(event.detail));
      await press(corner(), 'ArrowLeft');
      await press(corner(), 'ArrowRight', { shiftKey: true });
      await press(corner(), 'ArrowLeft', { ctrlKey: true });
      const radians = -Math.PI / 180;
      points(a).forEach((point: any, i: number) => {
        const dx = oldPoints[i].x - center.x, dy = oldPoints[i].y - center.y;
        nearPoint(point, { x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
          y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians) });
      });
      const rotated = snapshot();
      await press(corner(), 'Enter'); await press(corner(), 'Delete');
      assert.deepEqual(requests, [{ kind: 'panel', action: 'transform' }]);
      assert.deepEqual(editor.getSelectedShapeIds(), [group.id]); assert.equal(editor.getPath(), 'select.idle');
      assert.deepEqual(snapshot(), rotated);
    });
  });

  it('updates a held rotation immediately when Ctrl or Shift changes and commits only the constrained final angle', async () => {
    await harness(async ({ editor, add, enable, setPivot, corner, key, pointer, screen, snapshot, points, rotation, gesture }) => {
      const id = await add(); await enable(); const center = { x: 40, y: 30 }; await setPivot(center);
      const start = { x: 90, y: 90 }, radians = -18 * Math.PI / 180;
      const dx = start.x - center.x, dy = start.y - center.y;
      const end = { x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
        y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians) };
      const before = snapshot(), oldPoints = points(id);
      await pointer(corner(), 'pointerdown', screen(start)); await pointer(document.body, 'pointermove', screen(end));
      near(rotation.drawingRotationPreview(editor).get().angle, 18);
      await key(editor.getContainer(), 'keydown', 'Control', { ctrlKey: true });
      near(rotation.drawingRotationPreview(editor).get().angle, 15);
      await key(editor.getContainer(), 'keyup', 'Control');
      near(rotation.drawingRotationPreview(editor).get().angle, 18);
      await key(editor.getContainer(), 'keydown', 'Shift', { shiftKey: true });
      near(rotation.drawingRotationPreview(editor).get().angle, 15); assert.deepEqual(snapshot(), before);
      await pointer(document.body, 'pointerup', screen(end), { shiftKey: true });
      await key(editor.getContainer(), 'keyup', 'Shift');
      const finalAngle = -15 * Math.PI / 180;
      points(id).forEach((point: any, i: number) => {
        const px = oldPoints[i].x - center.x, py = oldPoints[i].y - center.y;
        nearPoint(point, { x: center.x + px * Math.cos(finalAngle) - py * Math.sin(finalAngle),
          y: center.y + px * Math.sin(finalAngle) + py * Math.cos(finalAngle) });
      });
      assert.equal(rotation.drawingRotationPreview(editor).get(), null);
      assert.equal(gesture.isDrawingPointerGestureActive(editor), false); assert.equal(editor.getPath(), 'select.idle');
    });
  });

  it('cancels a preview when an embedded form gains focus and leaves its keyboard editing isolated', async () => {
    await harness(async ({ editor, add, enable, setPivot, corner, pointer, screen, rotation, gesture, snapshot, container, act, press }) => {
      const id = await add(); await enable(); await setPivot({ x: 40, y: 30 }); const before = snapshot();
      const start = screen({ x: 90, y: 90 }), end = { x: start.x + 50, y: start.y - 30 };
      await pointer(corner(), 'pointerdown', start); await pointer(document.body, 'pointermove', end);
      assert.ok(rotation.drawingRotationPreview(editor).get());
      const input = container.querySelector('input') as HTMLInputElement;
      await act(async () => input.focus());
      assert.equal(rotation.drawingRotationPreview(editor).get(), null); assert.equal(gesture.isDrawingPointerGestureActive(editor), false);
      await pointer(document.body, 'pointerup', end); await press(input, 'ArrowRight'); await press(input, 'Delete');
      assert.equal(document.activeElement, input); assert.deepEqual(snapshot(), before); assert.deepEqual(editor.getSelectedShapeIds(), [id]);
    });
  });

  it('clears custom coordinates on selection and page change while leaving ordinary selection history intact', async () => {
    await harness(async ({ editor, tldraw, add, enable, setPivot, pivot, act }) => {
      const a = await add('first'), b = await add('second', { x: 350 });
      await act(async () => editor.select(a)); await enable(); await setPivot({ x: -30, y: 20 });
      await act(async () => editor.select(b)); assert.equal(pivot.readDrawingRotationPivot(editor).custom, false);
      await act(async () => editor.select(a)); assert.equal(pivot.readDrawingRotationPivot(editor).custom, false);
      await setPivot({ x: -30, y: 20 });
      await act(async () => { const id = tldraw.PageRecordType.createId('other'); editor.createPage({ id, name: 'Other' }); editor.setCurrentPage(id); });
      assert.equal(pivot.readDrawingRotationPivot(editor), null);
    });
  });

  for (const kind of ['pivot', 'rotate'] as const) {
    for (const reason of ['Escape', 'pointercancel', 'lostpointercapture', 'blur', 'wheel'] as const)
      it(`cancels a ${kind} drag on ${reason} without changing artwork or its saved pivot`, async () => {
        await harness(async ({ env, editor, add, enable, setPivot, pivot, rotation, gesture, corner, pivotControl, pointer, screen, press, snapshot, act }) => {
          await add(); await enable(); const center = { x: 40, y: 30 }; await setPivot(center);
          const before = snapshot(), target = kind === 'pivot' ? pivotControl() : corner();
          const start = screen(kind === 'pivot' ? center : { x: 90, y: 90 }), end = { x: start.x + 40, y: start.y - 30 };
          await pointer(target, 'pointerdown', start); await pointer(document.body, 'pointermove', end);
          assert.equal(rotation.drawingRotationPreview(editor).get().kind, kind);
          if (reason === 'Escape') await press(editor.getContainer(), 'Escape');
          else if (reason === 'blur') await act(async () => env.win.dispatchEvent(new Event('blur')));
          else if (reason === 'wheel') await act(async () => env.win.dispatchEvent(new env.win.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 })));
          else await pointer(reason === 'lostpointercapture' ? target : document.body, reason, end);
          assert.equal(rotation.drawingRotationPreview(editor).get(), null); assert.equal(gesture.isDrawingPointerGestureActive(editor), false);
          assert.equal(env.captures.size, 0); nearPoint(pivot.readDrawingRotationPivot(editor).point, center);
          await pointer(document.body, 'pointerup', end); assert.deepEqual(snapshot(), before);
          assert.equal(editor.getPath(), 'select.idle');
          const release = gesture.claimDrawingPointerGesture(editor, 'guide', 2); assert.ok(release); release();
        });
      });
  }

  for (const change of ['readonly', 'selection', 'page', 'document', 'calibration', 'camera', 'viewport', 'locked', 'menu', 'nodes', 'mode'] as const)
    it(`discards a rotation preview after ${change} changes and leaves that external change intact`, async () => {
      await harness(async ({ editor, tldraw, cad, nodes, skew, add, enable, setPivot, rotation, gesture, corner, pointer, screen, snapshot, act, tick }) => {
        const id = await add('first'), other = await add('other', { x: 450 });
        await act(async () => editor.select(id)); await enable(); await setPivot({ x: 40, y: 30 });
        const start = screen({ x: 90, y: 90 }), end = { x: start.x + 50, y: start.y - 30 };
        await pointer(corner(), 'pointerdown', start); await pointer(document.body, 'pointermove', end);
        assert.ok(rotation.drawingRotationPreview(editor).get());
        await act(async () => {
          if (change === 'readonly') editor.updateInstanceState({ isReadonly: true });
          if (change === 'selection') editor.select(other);
          if (change === 'page') { const pageId = tldraw.PageRecordType.createId('other'); editor.createPage({ id: pageId, name: 'Other' }); editor.setCurrentPage(pageId); }
          if (change === 'document') editor.updateShape({ id: other, type: 'cad-path', x: 480 });
          if (change === 'calibration') cad.writeCadSettings(editor, { ...cad.DEFAULT_CAD_SETTINGS, originY: 500 });
          if (change === 'camera') editor.setCamera({ x: 10, y: -20, z: 2 });
          if (change === 'viewport') editor.updateViewportScreenBounds(new tldraw.Box(160, 90, 780, 600));
          if (change === 'locked') editor.updateShape({ id, type: 'cad-path', isLocked: true });
          if (change === 'menu') editor.addOpenMenu('test-menu');
          if (change === 'nodes') nodes.setCadNodeEditing(editor, true);
          if (change === 'mode') skew.setDrawingSkewMode(editor, false);
        });
        await tick(); const changed = snapshot();
        assert.equal(rotation.drawingRotationPreview(editor).get(), null); assert.equal(gesture.isDrawingPointerGestureActive(editor), false);
        await pointer(document.body, 'pointerup', end); assert.deepEqual(snapshot(), changed);
      });
    });

  it('blocks other pointer starts while rotating and releases ownership for the next gesture', async () => {
    await harness(async ({ editor, canvas, add, enable, setPivot, rotation, gesture, corner, pivotControl, pointer, screen, snapshot }) => {
      await add(); await enable(); await setPivot({ x: 40, y: 30 }); const before = snapshot();
      const start = screen({ x: 90, y: 90 });
      await pointer(corner(), 'pointerdown', start, { pointerId: 11 });
      const other = await pointer(canvas, 'pointerdown', screen({ x: 500, y: 300 }), { pointerId: 22, pointerType: 'touch', isPrimary: false });
      assert.equal(other.defaultPrevented, true); assert.equal(editor.getPath(), 'select.idle');
      assert.equal(gesture.claimDrawingPointerGesture(editor, 'guide', 22), null);
      await pointer(document.body, 'pointercancel', start, { pointerId: 11 });
      assert.equal(gesture.isDrawingPointerGestureActive(editor), false);
      await pointer(pivotControl(), 'pointerdown', screen({ x: 40, y: 30 }), { pointerId: 22 });
      assert.equal(rotation.drawingRotationPreview(editor).get().kind, 'pivot');
      await pointer(document.body, 'pointercancel', screen({ x: 40, y: 30 }), { pointerId: 22 });
      assert.deepEqual(snapshot(), before); assert.equal(gesture.isDrawingPointerGestureActive(editor), false);
    });
  });

  it('retains redo after a no-op rotation and a click on the pivot', async () => {
    await harness(async ({ editor, add, enable, setPivot, rotation, pivotControl, pointer, screen, snapshot, act }) => {
      await add(); await enable(); await setPivot({ x: 40, y: 30 }); const before = snapshot();
      await act(async () => assert.equal(rotation.rotateDrawingAroundPivot(editor, 90), true));
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before); assert.equal(editor.getCanRedo(), true);
      await act(async () => assert.equal(rotation.rotateDrawingAroundPivot(editor, 0), true));
      const start = screen({ x: 40, y: 30 }); await pointer(pivotControl(), 'pointerdown', start);
      await pointer(document.body, 'pointerup', { x: start.x + 1, y: start.y });
      assert.deepEqual(snapshot(), before); assert.equal(editor.getCanRedo(), true);
    });
  });

  it('rolls back every selected object when the underlying mutation throws after a partial update', async () => {
    await harness(async ({ editor, add, enable, setPivot, rotation, snapshot, act }) => {
      const a = await add('first'), b = await add('second', { x: 300 });
      await act(async () => editor.select(a, b)); await enable(); await setPivot({ x: 40, y: 30 });
      const before = snapshot(), update = editor.updateShapes;
      editor.updateShapes = function (changes: any[]) { update.call(this, changes.slice(0, 1)); throw new Error('Injected partial failure'); };
      try { await act(async () => assert.equal(rotation.rotateDrawingAroundPivot(editor, 90), false)); }
      finally { editor.updateShapes = update; }
      assert.deepEqual(snapshot(), before); assert.deepEqual(editor.getSelectedShapeIds(), [a, b]);
    });
  });

  it('keeps default corner pointer interaction on the native rotation state path', async () => {
    await harness(async ({ editor, canvas, add, enable, pivot, corner, pointer, screen, snapshot }) => {
      await add(); await enable(); assert.equal(pivot.readDrawingRotationPivot(editor).custom, false);
      const before = snapshot(), start = screen({ x: 90, y: 90 });
      await pointer(corner(), 'pointerdown', start); assert.equal(editor.getPath(), 'select.pointing_rotate_handle');
      await pointer(canvas, 'pointerup', start); assert.equal(editor.getPath(), 'select.idle'); assert.deepEqual(snapshot(), before);
    });
  });

  for (const reason of ['locked-descendant', 'form-descendant', 'form-ancestor', 'frame-ancestor', 'readonly'])
    it(`refuses custom pivot changes and rotations for a ${reason} selection`, async () => {
      await harness(async ({ editor, tldraw, enable, setPivot, pivot, rotation, gesture, snapshot, act, tick, container }) => {
        const group = tldraw.createShapeId('protected-group'), leaf = tldraw.createShapeId('protected-curve'), parent = tldraw.createShapeId('protected-parent');
        await act(async () => {
          editor.createShapes([
            { id: group, type: 'group', x: 100, y: 100 },
            { id: leaf, type: 'cad-path', parentId: group, props: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }], closed: true } },
          ]); editor.select(group);
        });
        await enable(); await setPivot({ x: 40, y: 30 });
        await act(async () => {
          if (reason === 'locked-descendant') editor.updateShape({ id: leaf, type: 'cad-path', isLocked: true });
          if (reason === 'readonly') editor.updateInstanceState({ isReadonly: true });
          if (reason.startsWith('form')) editor.createShape({ id: parent, type: 'order-details', parentId: reason === 'form-descendant' ? group : editor.getCurrentPageId() });
          if (reason === 'frame-ancestor') editor.createShape({ id: parent, type: 'frame', props: { w: 600, h: 500 } });
          if (reason.endsWith('ancestor')) editor.updateShape({ id: group, type: 'group', parentId: parent });
        });
        await tick(); const before = snapshot();
        await act(async () => {
          assert.equal(pivot.setDrawingRotationPivot(editor, { x: 0, y: 0 }), false);
          assert.equal(rotation.rotateDrawingAroundPivot(editor, 90), false);
          const event = new MouseEvent('pointerdown', { button: 0, clientX: 230, clientY: 180, bubbles: true, cancelable: true });
          Object.defineProperties(event, { pointerId: { value: 5 }, isPrimary: { value: true } });
          assert.equal(rotation.startDrawingPivotPointer(editor, event as PointerEvent, container), null);
          assert.equal(rotation.startDrawingRotationPointer(editor, event as PointerEvent, container), null);
          assert.equal(event.defaultPrevented, false);
        });
        assert.deepEqual(snapshot(), before); assert.equal(rotation.drawingRotationPreview(editor).get(), null);
        assert.equal(gesture.isDrawingPointerGestureActive(editor), false);
      });
    });
});
