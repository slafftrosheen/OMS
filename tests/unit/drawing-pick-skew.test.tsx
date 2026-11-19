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
  const React = await import('react'), { act } = React;
  const { createRoot } = await import('react-dom/client');
  const tldraw = await import('@tldraw/tldraw');
  const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
  const { EditorComponentsProvider } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditorComponents.mjs');
  const { useCanvasEvents } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useCanvasEvents.mjs');
  const { useDocumentEvents } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useDocumentEvents.mjs');
  const { CadPathShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadShapes');
  const { CadBezierShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadBezierShape');
  const { DrawingPickSelectionForeground, DrawingPickHandles } = await import('../../src/lib/components/canvas/DrawingPickSelectionForeground');
  const skew = await import('../../src/lib/components/canvas/drawing-pick-skew');
  const numeric = await import('../../src/lib/components/canvas/drawing-skew');
  const pointerClaim = await import('../../src/lib/components/canvas/drawing-pointer-gesture');
  const { VECTOR_DEFAULT_PAINT } = await import('../../src/lib/components/canvas/cad-paint');
  const { nodeAt } = await import('../../src/lib/components/canvas/cad-curves');
  const shapeUtils = [...tldraw.defaultShapeUtils, CadPathShapeUtil, CadBezierShapeUtil];
  const container = document.createElement('div'); container.className = 'tl-container'; container.tabIndex = 0;
  document.body.append(container);
  const rect = env.win.DOMRect.fromRect({ x: 100, y: 60, width: 800, height: 600 });
  container.getBoundingClientRect = () => rect;
  const editor = new tldraw.Editor({
    store: tldraw.createTLStore({ shapeUtils, bindingUtils: tldraw.defaultBindingUtils }), shapeUtils,
    bindingUtils: tldraw.defaultBindingUtils, tools: [...tldraw.defaultTools, ...tldraw.defaultShapeTools],
    getContainer: () => container, initialState: 'select',
  });
  editor.updateViewportScreenBounds(new tldraw.Box(100, 60, 800, 600));
  editor.updateInstanceState({ isFocused: true });
  const stopSkew = skew.installDrawingSkewMode(editor);
  function Canvas() {
    useDocumentEvents();
    const events = useCanvasEvents();
    const bounds = tldraw.useValue('test selection bounds', () => editor.getSelectionRotatedPageBounds(), []);
    const rotation = tldraw.useValue('test selection rotation', () => editor.getSelectionRotation(), []);
    return <div className="tl-canvas" tabIndex={0} {...events}>
      <DrawingPickHandles><g data-testid="native-vertex-handles" /></DrawingPickHandles>
      {bounds && <DrawingPickSelectionForeground bounds={bounds} rotation={rotation} />}
      <input aria-label="Artwork name" onPointerDown={event => event.stopPropagation()} />
    </div>;
  }
  const root = createRoot(container);
  try {
    await act(async () => root.render(<tldraw.ContainerProvider container={container}>
      <EditorContext.Provider value={editor}><EditorComponentsProvider><Canvas /></EditorComponentsProvider></EditorContext.Provider>
    </tldraw.ContainerProvider>));
    const tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 24)); }); };
    const pointer = async (element: EventTarget, name: string, point: { x: number; y: number }, options: any = {}) => {
      const { pointerId = 1, pointerType = 'mouse', isPrimary = true, ...mouseOptions } = options;
      const event = new MouseEvent(name, { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y,
        buttons: name === 'pointerup' ? 0 : 1, ...mouseOptions });
      Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType }, isPrimary: { value: isPrimary }, pressure: { value: .5 } });
      await act(async () => { element.dispatchEvent(event); }); await tick(); return event;
    };
    const key = async (element: EventTarget, name: string, key: string, options = {}) => {
      const event = new KeyboardEvent(name, { key, code: key, bubbles: true, cancelable: true, ...options });
      await act(async () => { element.dispatchEvent(event); }); await tick(); return event;
    };
    const add = async (name = 'curve', extra = {}) => {
      const id = tldraw.createShapeId(name);
      await act(async () => {
        editor.createShape({ id, type: 'cad-path', x: 100, y: 100, parentId: editor.getCurrentPageId(),
          props: { closed: true, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }] }, ...extra } as any);
        editor.select(id);
      });
      return id;
    };
    const enable = async () => { await act(async () => { assert.equal(skew.setDrawingSkewMode(editor, true), true); }); await tick(); };
    const edge = (name = 'top') => container.querySelector(`[data-drawing-skew-edge="${name}"]`)!;
    const screen = (point: { x: number; y: number }) => editor.pageToScreen(point);
    await run({ env, editor, container, canvas: container.querySelector('.tl-canvas'), act, tick, pointer, key, add, enable,
      edge, screen, skew, numeric, pointerClaim, tldraw, VECTOR_DEFAULT_PAINT, nodeAt });
  } finally {
    await act(async () => { root.unmount(); stopSkew(); });
    editor.dispose(); container.remove(); env.restore();
  }
}

describe('Pick rotate/skew with native tldraw and DOM events', () => {
  it('previews a physical-page shear without writes and commits one native Undo/Redo step on release outside the handle', async () => {
    await harness(async ({ editor, container, act, pointer, add, enable, edge, screen, skew, pointerClaim }) => {
      const id = await add(); await enable();
      const before = structuredClone(editor.getShape(id));
      assert.equal(container.querySelectorAll('[data-drawing-skew-edge]').length, 4);
      assert.equal(container.querySelectorAll('[data-drawing-rotate-corner]').length, 4);
      assert.equal(container.querySelector('[data-testid="native-vertex-handles"]'), null);
      const press = screen({ x: 155, y: 103 }), move = { x: press.x + 40, y: press.y + 200 };
      await pointer(edge(), 'pointerdown', press);
      assert.equal(editor.getPath(), 'select.idle');
      assert.equal(pointerClaim.isDrawingPointerGestureActive(editor), true);
      await pointer(document.body, 'pointermove', move);
      assert.deepEqual(editor.getShape(id), before);
      assert.ok(container.querySelector('[data-testid="drawing-pick-skew-preview"]'));
      assert.ok(Math.abs(skew.drawingSkewGesture(editor).get().angle - Math.atan(.5) * 180 / Math.PI) < 1e-9);
      await pointer(document.body, 'pointerup', move);
      const after = structuredClone(editor.getShape(id));
      assert.deepEqual(after.props.points, [{ x: 40, y: 0 }, { x: 140, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }]);
      assert.equal(after.id, before.id); assert.equal(after.parentId, before.parentId);
      assert.equal(pointerClaim.isDrawingPointerGestureActive(editor), false);
      assert.equal(skew.drawingSkewGesture(editor).get(), null); assert.equal(skew.drawingSkewNotice(editor).get(), 'done');
      await act(async () => editor.undo()); assert.deepEqual(editor.getShape(id), before);
      await act(async () => editor.redo()); assert.deepEqual(editor.getShape(id), after);
    });
  });

  it('updates Shift snapping live and cancels Escape without a document/history mutation', async () => {
    await harness(async ({ editor, container, pointer, key, add, enable, edge, screen, skew, pointerClaim }) => {
      const id = await add(); await enable(); const before = structuredClone(editor.getShape(id));
      const press = screen({ x: 150, y: 100 }), move = { x: press.x + 50, y: press.y };
      await pointer(edge(), 'pointerdown', press); await pointer(document.body, 'pointermove', move);
      await key(container, 'keydown', 'Shift', { shiftKey: true }); assert.equal(skew.drawingSkewGesture(editor).get().angle, 30);
      await key(container, 'keyup', 'Shift'); assert.ok(Math.abs(skew.drawingSkewGesture(editor).get().angle - 32.005383208083494) < 1e-8);
      const stop = await key(container, 'keydown', 'Delete'); assert.equal(stop.defaultPrevented, true); assert.ok(editor.getShape(id));
      await key(container, 'keydown', 'Escape');
      assert.equal(skew.drawingSkewGesture(editor).get(), null); assert.equal(pointerClaim.isDrawingPointerGestureActive(editor), false);
      await pointer(document.body, 'pointerup', move); assert.deepEqual(editor.getShape(id), before);
      assert.equal(skew.drawingSkewNotice(editor).get(), 'canceled'); assert.equal(editor.getPath(), 'select.idle');
    });
  });

  it('cancels on pointercancel, lost capture, blur and mode exit; ordinary clicks stay unchanged', async () => {
    await harness(async ({ env, editor, container, act, pointer, add, enable, edge, screen, skew, pointerClaim }) => {
      const id = await add(); const before = structuredClone(editor.getShape(id));
      const press = screen({ x: 150, y: 100 }), move = { x: press.x + 25, y: press.y };
      for (const reason of ['pointercancel', 'lostpointercapture', 'blur', 'mode']) {
        await enable(); await pointer(edge(), 'pointerdown', press); await pointer(document.body, 'pointermove', move);
        if (reason === 'mode') await act(async () => skew.setDrawingSkewMode(editor, false));
        else if (reason === 'blur') await act(async () => env.win.dispatchEvent(new Event('blur')));
        else await pointer(container, reason, move);
        assert.equal(skew.drawingSkewGesture(editor).get(), null, reason); assert.equal(pointerClaim.isDrawingPointerGestureActive(editor), false, reason);
        await pointer(document.body, 'pointerup', move); assert.deepEqual(editor.getShape(id), before, reason);
      }
      await enable(); await pointer(edge(), 'pointerdown', press); await pointer(document.body, 'pointerup', { x: press.x + 1, y: press.y });
      assert.deepEqual(editor.getShape(id), before);
    });
  });

  it('retires queued pointer frames before synchronous Shift updates and cannot write into the next gesture', async () => {
    await harness(async ({ env, editor, container, pointer, key, add, enable, edge, screen, skew }) => {
      await add(); await enable();
      const request = env.win.requestAnimationFrame, cancel = env.win.cancelAnimationFrame;
      const queued = new Map<number, (timestamp: number) => void>(); let next = 1;
      env.win.requestAnimationFrame = (callback: (timestamp: number) => void) => { const id = next++; queued.set(id, callback); return id; };
      env.win.cancelAnimationFrame = (id: number) => { queued.delete(id); };
      try {
        const start = screen({ x: 150, y: 100 });
        await pointer(edge(), 'pointerdown', start); await pointer(document.body, 'pointermove', { x: start.x + 40, y: start.y });
        assert.equal(queued.size, 1); const oldCallback = [...queued.values()][0];
        await key(container, 'keydown', 'Shift', { shiftKey: true });
        assert.equal(queued.size, 0); assert.equal(skew.drawingSkewGesture(editor).get().angle, 30);
        await key(container, 'keydown', 'Escape');
        await pointer(edge(), 'pointerdown', start); assert.equal(skew.drawingSkewGesture(editor).get().angle, 0);
        oldCallback(0); assert.equal(skew.drawingSkewGesture(editor).get().angle, 0); assert.equal(skew.drawingSkewGesture(editor).get().plan, null);
        await key(container, 'keydown', 'Escape');
      } finally { env.win.requestAnimationFrame = request; env.win.cancelAnimationFrame = cancel; }
    });
  });

  it('clears stale previews on selection, document, camera, page, lock and readonly changes', async () => {
    await harness(async ({ editor, act, pointer, add, enable, edge, screen, skew, pointerClaim, tldraw }) => {
      const first = await add('first'), other = await add('other', { x: 400 });
      for (const reason of ['selection', 'document', 'camera', 'readonly', 'page', 'lock']) {
        await act(async () => { editor.updateInstanceState({ isReadonly: false }); editor.setCurrentPage('page:page'); editor.select(first); });
        await enable();
        const press = screen({ x: 150, y: 100 }), move = { x: press.x + 20, y: press.y };
        await pointer(edge(), 'pointerdown', press); await pointer(document.body, 'pointermove', move);
        const before = structuredClone(editor.getShape(first)?.props);
        await act(async () => {
          if (reason === 'selection') editor.select(other);
          if (reason === 'document') editor.updateShape({ id: other, type: 'cad-path', x: 450 });
          if (reason === 'camera') editor.setCamera({ x: 30, y: 20, z: 2 });
          if (reason === 'readonly') editor.updateInstanceState({ isReadonly: true });
          if (reason === 'page') { const pageId = tldraw.PageRecordType.createId('second'); editor.createPage({ id: pageId, name: 'Second' }); editor.setCurrentPage(pageId); }
          if (reason === 'lock') editor.updateShape({ id: first, type: 'cad-path', isLocked: true });
        });
        assert.equal(skew.drawingSkewGesture(editor).get(), null, reason); assert.equal(pointerClaim.isDrawingPointerGestureActive(editor), false, reason);
        await pointer(document.body, 'pointerup', move); assert.deepEqual(editor.getShape(first)?.props, before, reason);
      }
    });
  });

  it('rejects unsupported and protected selections instead of exposing skew controls', async () => {
    await harness(async ({ editor, container, act, add, skew, tldraw }) => {
      for (const [name, extra, reason] of [
        ['native', { type: 'geo', props: { w: 100, h: 80 } }, 'curves'],
        ['text', { type: 'text', props: { text: 'Live text' } }, 'curves'],
        ['locked', { isLocked: true }, 'protected'],
        ['paint', { meta: { omsMaterialTexture: { mode: 'tile' } } }, 'appearance'],
      ]) {
        await add(name, extra); await act(async () => assert.equal(skew.setDrawingSkewMode(editor, true), false));
        assert.equal(skew.drawingSkewNotice(editor).get(), reason); assert.equal(container.querySelector('[data-testid="drawing-pick-skew"]'), null);
      }
      const frame = tldraw.createShapeId('frame');
      await act(async () => editor.createShape({ id: frame, type: 'frame', x: 0, y: 0, props: { w: 800, h: 600 } }));
      await add('in-frame', { parentId: frame });
      await act(async () => assert.equal(skew.setDrawingSkewMode(editor, true), false)); assert.equal(skew.drawingSkewNotice(editor).get(), 'unsupported');
    });
  });

  it('retains group ancestry, compound holes and gradient matrices through the exact drag planner', async () => {
    await harness(async ({ editor, act, enable, skew, tldraw, VECTOR_DEFAULT_PAINT, nodeAt }) => {
      const g = tldraw.createShapeId('group'), a = tldraw.createShapeId('compound'), b = tldraw.createShapeId('line');
      const gradient = { type: 'linear', matrix: [1, 0, 0, 1, 0, 0], start: [0, 0], end: [100, 0], r0: 0, r1: 1,
        stops: [{ offset: 0, color: '#ff0000', opacity: 1 }, { offset: 1, color: '#0000ff', opacity: 1 }] };
      await act(async () => {
        editor.createShapes([
          { id: g, type: 'group', x: 300, y: 200, rotation: .4 },
          { id: a, type: 'cad-bezier', parentId: g, x: 20, y: 10, props: { fillRule: 'evenodd', contours: [
            { closed: true, nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }].map(nodeAt) },
            { closed: true, nodes: [{ x: 20, y: 20 }, { x: 20, y: 60 }, { x: 70, y: 60 }, { x: 70, y: 20 }].map(nodeAt) },
          ] }, meta: { omsObjectName: 'Compound letter', omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, gradient } } },
          { id: b, type: 'cad-path', parentId: g, x: 170, y: 20, props: { points: [{ x: 0, y: 0 }, { x: 40, y: 30 }] } },
        ] as any); editor.select(g);
      });
      await enable();
      const before = structuredClone(editor.getCurrentPageShapesSorted()), bounds = (await import('../../src/lib/components/canvas/drawing-skew')).readSkewSelection(editor).bounds!;
      const start = skew.drawingSkewHandlePoint(bounds, 'left'), end = { x: start.x, y: start.y + bounds.w * Math.tan(.3) };
      await act(async () => { assert.equal(skew.beginDrawingSkew(editor, 'left', start), true); assert.equal(skew.updateDrawingSkew(editor, end), true); });
      const plan = skew.drawingSkewGesture(editor).get().plan; assert.ok(plan); assert.deepEqual(editor.getCurrentPageShapesSorted(), before);
      await act(async () => assert.equal(skew.finishDrawingSkew(editor, end), true));
      assert.equal(editor.getShape(a).parentId, g); assert.equal(editor.getShape(b).parentId, g); assert.deepEqual(editor.getShape(g), before.find((shape: any) => shape.id === g));
      assert.equal(editor.getShape(a).props.contours.length, 2); assert.equal(editor.getShape(a).props.fillRule, 'evenodd');
      assert.deepEqual(editor.getShape(a).meta, plan.items.find((item: any) => item.id === a).meta);
      for (const item of plan.items) {
        const shape = editor.getShape(item.id), transform = editor.getShapePageTransform(shape);
        const local = shape.type === 'cad-path' ? shape.props.points[0] : shape.props.contours[0].nodes[0];
        const actual = transform.applyToPoint(local), expected = item.result[0].nodes[0];
        assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-7);
      }
      await act(async () => editor.undo()); assert.deepEqual(editor.getCurrentPageShapesSorted(), before);
    });
  });

  it('maps screen drag distances correctly at non-unit zoom and blocks a newly locked group child', async () => {
    await harness(async ({ editor, act, pointer, add, enable, edge, screen, skew, pointerClaim }) => {
      const a = await add('zoomed'), b = await add('sibling', { x: 300 });
      await act(async () => { editor.select(a); editor.setCamera({ x: -60, y: 20, z: 2 }); }); await enable();
      const start = screen({ x: 150, y: 100 });
      await pointer(edge(), 'pointerdown', start);
      await pointer(document.body, 'pointermove', { x: start.x + 20, y: start.y });
      await pointer(document.body, 'pointerup', { x: start.x + 20, y: start.y });
      assert.ok(Math.abs(editor.getShape(a).props.points[0].x - 10) < 1e-8);
      await act(async () => { editor.undo(); editor.select(a, b); editor.groupShapes([a, b]); });
      await enable(); const group = editor.getOnlySelectedShape(); assert.equal(group.type, 'group');
      const before = structuredClone(editor.getShape(a).props), press = screen({ x: 250, y: 100 });
      await pointer(edge(), 'pointerdown', press); await pointer(document.body, 'pointermove', { x: press.x + 50, y: press.y });
      await act(async () => editor.updateShape({ id: b, type: 'cad-path', isLocked: true }));
      assert.equal(skew.drawingSkewGesture(editor).get(), null); assert.equal(skew.drawingSkewNotice(editor).get(), 'protected');
      assert.equal(pointerClaim.isDrawingPointerGestureActive(editor), false);
      await pointer(document.body, 'pointerup', { x: press.x + 50, y: press.y }); assert.deepEqual(editor.getShape(a).props, before);
      await act(async () => assert.equal(skew.setDrawingSkewMode(editor, true), false));
    });
  });

  it('keeps native corner rotation and Escape/Undo behavior intact', async () => {
    await harness(async ({ editor, container, canvas, act, pointer, key, add, enable, screen, skew }) => {
      const id = await add(); await enable(); const before = structuredClone(editor.getShape(id));
      const handle = () => container.querySelector('[data-drawing-rotate-corner="top_right_rotate"]')!;
      await pointer(handle(), 'pointerdown', screen({ x: 210, y: 90 }));
      assert.equal(editor.getPath(), 'select.pointing_rotate_handle'); assert.equal(skew.isDrawingSkewDragging(editor), false);
      await pointer(canvas, 'pointermove', screen({ x: 230, y: 180 }));
      assert.equal(editor.getPath(), 'select.rotating'); assert.notEqual(editor.getShape(id).rotation, before.rotation);
      await key(container, 'keydown', 'Escape'); assert.deepEqual(editor.getShape(id), before);
      await pointer(canvas, 'pointerup', screen({ x: 230, y: 180 }));
      await pointer(handle(), 'pointerdown', screen({ x: 210, y: 90 }));
      await pointer(canvas, 'pointermove', screen({ x: 240, y: 190 }));
      await pointer(canvas, 'pointerup', screen({ x: 240, y: 190 }));
      assert.notEqual(editor.getShape(id).rotation, before.rotation); assert.equal(editor.getPath(), 'select.idle');
      await act(async () => editor.undo()); assert.deepEqual(editor.getShape(id), before);
    });
  });

  it('rotates already rotated groups around the native selection pivot from page-axis corner controls', async () => {
    await harness(async ({ editor, container, canvas, act, pointer, add, enable, screen, numeric }) => {
      const a = await add('pivot-a'), b = await add('pivot-b', { x: 260, y: 135 });
      await act(async () => { editor.select(a, b); editor.groupShapes([a, b]); });
      const group = editor.getOnlySelectedShape();
      for (const initial of [30, 75]) {
        await act(async () => editor.updateShape({ id: group.id, type: 'group', rotation: initial * Math.PI / 180 })); await enable();
        const before = structuredClone(editor.getShape(group.id));
        const points = [a, b].map(id => editor.getShapePageTransform(id).applyToPoint(editor.getShape(id).props.points[0]));
        const nativeBounds = editor.getSelectionRotatedPageBounds();
        const pivot = nativeBounds.center.clone().rotWith(nativeBounds.point, editor.getSelectionRotation());
        const bounds = numeric.readSkewSelection(editor).bounds;
        const start = { x: bounds.x + bounds.w + 10, y: bounds.y - 10 }, delta = 35 * Math.PI / 180;
        const rotate = (point: { x: number; y: number }) => ({
          x: pivot.x + (point.x - pivot.x) * Math.cos(delta) - (point.y - pivot.y) * Math.sin(delta),
          y: pivot.y + (point.x - pivot.x) * Math.sin(delta) + (point.y - pivot.y) * Math.cos(delta),
        });
        const end = rotate(start);
        await pointer(container.querySelector('[data-drawing-rotate-corner="top_right_rotate"]')!, 'pointerdown', screen(start));
        await pointer(canvas, 'pointermove', screen(end)); await pointer(canvas, 'pointerup', screen(end));
        assert.ok(Math.abs(editor.getShape(group.id).rotation * 180 / Math.PI - (initial + 35)) < 1e-8);
        [a, b].forEach((id, index) => {
          const actual = editor.getShapePageTransform(id).applyToPoint(editor.getShape(id).props.points[0]), expected = rotate(points[index]);
          assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-7, `${initial}° group child stays on its rotation arc`);
        });
        const resultBounds = editor.getSelectionRotatedPageBounds();
        const afterPivot = resultBounds.center.clone().rotWith(resultBounds.point, editor.getSelectionRotation());
        assert.ok(Math.hypot(afterPivot.x - pivot.x, afterPivot.y - pivot.y) < 1e-7);
        await act(async () => editor.undo()); assert.deepEqual(editor.getShape(group.id), before);
      }
    });
  });

  it('stops native rotation after a descendant lock or readonly change while retaining that external change', async () => {
    await harness(async ({ editor, container, canvas, act, pointer, add, enable, screen, skew }) => {
      const a = await add('lock-rotate-a'), b = await add('lock-rotate-b', { x: 260, y: 135 });
      await act(async () => { editor.select(a, b); editor.groupShapes([a, b]); });
      const group = editor.getOnlySelectedShape(), before = structuredClone(editor.getShape(group.id));
      await enable();
      await pointer(container.querySelector('[data-drawing-rotate-corner="top_right_rotate"]')!, 'pointerdown', screen({ x: 370, y: 90 }));
      await pointer(canvas, 'pointermove', screen({ x: 390, y: 250 }));
      assert.equal(editor.getPath(), 'select.rotating'); assert.notEqual(editor.getShape(group.id).rotation, before.rotation);
      await act(async () => editor.updateShape({ id: b, type: 'cad-path', isLocked: true, meta: { external: 'preserve this' } }));
      assert.equal(editor.getPath(), 'select.idle'); assert.equal(skew.isDrawingSkewMode(editor), false);
      assert.deepEqual(editor.getShape(group.id), before); assert.equal(editor.getShape(b).isLocked, true);
      assert.deepEqual(editor.getShape(b).meta, { external: 'preserve this' });
      await pointer(canvas, 'pointermove', screen({ x: 400, y: 300 })); await pointer(canvas, 'pointerup', screen({ x: 400, y: 300 }));
      assert.deepEqual(editor.getShape(group.id), before); assert.equal(editor.getShape(b).isLocked, true);
      const protectedChild = structuredClone(editor.getShape(b));
      // The next history step is exactly the external lock/meta edit. There is
      // no surviving partial rotation and redo must not bring one back either.
      await act(async () => editor.undo());
      assert.deepEqual(editor.getShape(group.id), before); assert.equal(editor.getShape(b).isLocked, false); assert.deepEqual(editor.getShape(b).meta, {});
      await act(async () => editor.redo());
      assert.deepEqual(editor.getShape(group.id), before); assert.deepEqual(editor.getShape(b), protectedChild);
      await act(async () => editor.updateShape({ id: b, type: 'cad-path', isLocked: false })); await enable();
      await pointer(container.querySelector('[data-drawing-rotate-corner="top_right_rotate"]')!, 'pointerdown', screen({ x: 370, y: 90 }));
      await pointer(canvas, 'pointermove', screen({ x: 410, y: 260 }));
      await act(async () => editor.updateInstanceState({ isReadonly: true }));
      assert.equal(editor.getPath(), 'select.idle'); assert.equal(editor.getInstanceState().isReadonly, true);
      assert.deepEqual(editor.getShape(group.id), before);
    });
  });

  it('provides keyboard skew controls without native arrow-key translation and opens numeric Transformations', async () => {
    await harness(async ({ editor, container, act, key, add, enable, edge, skew }) => {
      const id = await add(); await enable(); const before = structuredClone(editor.getShape(id));
      await act(async () => (edge() as HTMLElement).focus());
      await key(edge(), 'keydown', 'ArrowRight', { shiftKey: true });
      assert.equal(editor.getShape(id).x, before.x); assert.equal(editor.getShape(id).y, before.y);
      assert.ok(Math.abs(editor.getShape(id).props.points[0].x - 80 * Math.tan(Math.PI / 12)) < 1e-8);
      await act(async () => editor.undo()); assert.deepEqual(editor.getShape(id), before);
      const sent: any[] = []; container.addEventListener('oms:drawing-ui-request', (event: any) => sent.push(event.detail));
      await key(edge(), 'keydown', 'Enter'); assert.deepEqual(sent, [{ kind: 'panel', action: 'transform' }]);
      await key(edge(), 'keyup', 'Enter'); assert.equal(editor.getPath(), 'select.idle'); assert.deepEqual(editor.getShape(id), before);
      assert.equal(skew.isDrawingSkewDragging(editor), false);
    });
  });

  it('prevents overlapping custom/native pointers and allows editing form keys', async () => {
    await harness(async ({ editor, container, canvas, act, pointer, key, add, enable, edge, screen, skew, pointerClaim }) => {
      const id = await add(); await enable(); const before = structuredClone(editor.getShape(id));
      let release: () => void;
      await act(async () => { release = pointerClaim.claimDrawingPointerGesture(editor, 'guide', 4); });
      await pointer(edge(), 'pointerdown', screen({ x: 150, y: 100 })); assert.equal(skew.isDrawingSkewDragging(editor), false);
      release!();
      const start = screen({ x: 150, y: 100 }); await pointer(edge(), 'pointerdown', start);
      await pointer(canvas, 'pointerdown', screen({ x: 120, y: 120 }), { pointerId: 2, isPrimary: false, pointerType: 'touch' });
      assert.equal(editor.getPath(), 'select.idle'); assert.deepEqual(editor.getShape(id), before);
      const input = container.querySelector('input') as HTMLInputElement; await act(async () => input.focus());
      assert.equal(skew.isDrawingSkewDragging(editor), false);
      const event = await key(input, 'keydown', 'ArrowLeft'); assert.equal(event.defaultPrevented, false);
      assert.deepEqual(editor.getShape(id), before);
    });
  });
  it('maps every side to the opposite fixed edge and bounds angle snapping', async () => {
    const { drawingSkewAngle, drawingSkewOptions } = await import('../../src/lib/components/canvas/drawing-pick-skew');
    const bounds = { x: 10, y: 20, w: 100, h: 80 }, start = { x: 25, y: 35 };
    for (const [edge, point, angle, anchor] of [
      ['top', { x: 105, y: 900 }, 45, 'bottom'], ['bottom', { x: 105, y: -800 }, -45, 'top'],
      ['left', { x: 1000, y: 135 }, 45, 'right'], ['right', { x: -100, y: 135 }, -45, 'left'],
    ] as const) {
      assert.equal(drawingSkewAngle(bounds, edge, start, point).angle, angle);
      assert.equal(drawingSkewOptions(edge, angle).anchor, anchor);
      assert.equal(drawingSkewOptions(edge, angle).keepOriginal, false);
    }
    assert.equal(drawingSkewAngle(bounds, 'top', start, { x: 25 + 80 * Math.tan(19 * Math.PI / 180), y: 35 }, true).angle, 15);
    assert.deepEqual(drawingSkewAngle(bounds, 'top', start, { x: 1e9, y: 35 }), { angle: 80, limited: true });
    assert.deepEqual(drawingSkewAngle(bounds, 'top', start, { x: -1e9, y: 35 }, true), { angle: -75, limited: true });
    assert.throws(() => drawingSkewAngle({ ...bounds, h: 0 }, 'top', start, start), /unchanged/);
    assert.throws(() => drawingSkewAngle(bounds, 'left', start, { x: 0, y: NaN }), /invalid/);
  });


});
