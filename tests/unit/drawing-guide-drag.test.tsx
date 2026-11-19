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
  // esbuild's bundled React act uses browser channels; retain real scheduling
  // and close the Node ports with the test DOM instead of leaking the runner.
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

/** Actual Editor, Store, HistoryManager and native canvas/document hooks. The
 * React root sits OUTSIDE .tl-container as it does in CanvasApp: this catches
 * native container key listeners running before React bubble handlers. */
async function harness(run: (value: any) => Promise<void>) {
  const env = domEnvironment();
  const React = await import('react'), { act } = React;
  const { createRoot } = await import('react-dom/client');
  const tldraw = await import('@tldraw/tldraw');
  const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
  const { useCanvasEvents } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useCanvasEvents.mjs');
  const { useDocumentEvents } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useDocumentEvents.mjs');
  const { DrawingGuideOverlay } = await import('../../src/lib/components/canvas/DrawingGuideOverlay');
  const drag = await import('../../src/lib/components/canvas/drawing-guide-drag');
  const guides = await import('../../src/lib/components/canvas/drawing-guides');
  const gesture = await import('../../src/lib/components/canvas/drawing-pointer-gesture');
  const cad = await import('../../src/lib/components/canvas/cad-settings');
  const nodes = await import('../../src/lib/components/canvas/cad-node-selection');
  const { planDrawingExport } = await import('../../src/lib/components/canvas/drawing-operations');
  const { DRAWING_UI_REQUEST } = await import('../../src/lib/components/canvas/drawing-ui-requests');
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host), rect = env.win.DOMRect.fromRect({ x: 140, y: 90, width: 800, height: 600 });
  let container!: HTMLDivElement;
  const containerRef = (node: HTMLDivElement | null) => { if (node) { container = node; node.getBoundingClientRect = () => rect; } };
  function Canvas() {
    useDocumentEvents();
    const events = useCanvasEvents();
    return <div className="tl-canvas" {...events}>
      <DrawingGuideOverlay />
      <div className="canvas-form-sheet" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
        <input aria-label="Order address" defaultValue="Rīga" />
      </div>
    </div>;
  }
  function Application({ editor }: { editor: any }) {
    return <div data-testid="drawing-workspace">
      <button type="button" data-testid="ruler-x">Top ruler</button><button type="button" data-testid="ruler-y">Left ruler</button>
      <div className="drawing-viewport"><div className="tl-container" tabIndex={0} ref={containerRef}>
        {editor && <tldraw.ContainerProvider container={container}><EditorContext.Provider value={editor}><Canvas /></EditorContext.Provider></tldraw.ContainerProvider>}
      </div></div>
    </div>;
  }
  await act(async () => { root.render(<Application editor={null} />); });
  const editor = new tldraw.Editor({
    store: tldraw.createTLStore({ shapeUtils: tldraw.defaultShapeUtils, bindingUtils: tldraw.defaultBindingUtils }),
    shapeUtils: tldraw.defaultShapeUtils, bindingUtils: tldraw.defaultBindingUtils,
    tools: [...tldraw.defaultTools, ...tldraw.defaultShapeTools], getContainer: () => container, initialState: 'select',
  });
  editor.updateViewportScreenBounds(new tldraw.Box(rect.x, rect.y, rect.width, rect.height));
  editor.updateInstanceState({ isFocused: true });
  const sent: unknown[] = [];
  container.addEventListener(DRAWING_UI_REQUEST, event => { sent.push((event as CustomEvent).detail); });
  try {
    await act(async () => { root.render(<Application editor={editor} />); });
    const canvas = container.querySelector('.tl-canvas')!, rulerX = host.querySelector('[data-testid="ruler-x"]')!, rulerY = host.querySelector('[data-testid="ruler-y"]')!;
    const tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
    const pointerEvent = (name: string, options: Record<string, unknown> = {}) => {
      const { pointerId = 1, pointerType = 'mouse', isPrimary = true, ...mouse } = options;
      const event = new MouseEvent(name, { bubbles: true, cancelable: true, button: 0, buttons: name === 'pointerup' ? 0 : 1,
        clientX: 400, clientY: 300, ...mouse });
      Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType }, isPrimary: { value: isPrimary }, pressure: { value: .5 } });
      return event as PointerEvent;
    };
    const pointer = async (target: EventTarget, name: string, options: Record<string, unknown> = {}) => {
      const event = pointerEvent(name, options); await act(async () => { target.dispatchEvent(event); }); await tick(); return event;
    };
    const key = async (target: EventTarget, key: string, options: ConstructorParameters<typeof KeyboardEvent>[1] = {}) => {
      const event = new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true, ...options });
      await act(async () => { target.dispatchEvent(event); }); await tick();
      await act(async () => { target.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, bubbles: true, cancelable: true, ...options })); });
      return event;
    };
    const start = async (axis: 'x' | 'y', options: Record<string, unknown> = {}, guideId?: string) => {
      const target = axis === 'x' ? rulerY : rulerX;
      let started = false;
      target.addEventListener('pointerdown', event => { started = drag.beginDrawingGuideDrag(editor, { axis, guideId }, event as PointerEvent, target); }, { once: true });
      const event = await pointer(target, 'pointerdown', options);
      return { started, event, target };
    };
    const addGuide = async (axis: 'x' | 'y' = 'x', position = 150, id = 'guide:test') => {
      await act(async () => { assert.equal(guides.applyDrawingGuideChange(editor, guides.prepareDrawingGuideChange(editor, { kind: 'add', axis, position, id })), true); });
      await tick(); return id;
    };
    const addArtwork = async () => {
      const id = tldraw.createShapeId('artwork');
      await act(async () => {
        editor.createShape({ id, type: 'geo', x: 40, y: 50, props: { geo: 'rectangle', w: 80, h: 40, dash: 'solid', fill: 'solid', size: 's' } });
        editor.select(id); editor.mark('guide-drag-fixture');
      }); return id;
    };
    const snapshot = () => structuredClone(editor.store.getStoreSnapshot('document'));
    const line = (id = 'guide:test') => container.querySelector(`[data-drawing-guide-control="${id}"]`) as SVGLineElement;
    const exportPlan = () => planDrawingExport(editor, 'svg', { scope: 'all', scale: 1, background: false, padding: 0 });
    await run({ env, root, host, editor, container, canvas, rulerX, rulerY, rect, tldraw, drag, guides, gesture, cad, nodes,
      sent, act, tick, pointer, pointerEvent, key, start, addGuide, addArtwork, snapshot, line, exportPlan });
  } finally {
    await act(async () => { drag.cancelDrawingGuideDrag(editor, null); root.unmount(); });
    editor.dispose(); host.remove(); env.restore();
  }
}

describe('Guideline drag with a real editor and DOM events', () => {
  for (const axis of ['x', 'y'] as const) it(`adds a ${axis} guide with viewport offsets and zoom in one Undo, without preview writes`, async () => {
    await harness(async ({ editor, env, drag, guides, cad, gesture, start, pointer, addArtwork, snapshot, exportPlan, act }) => {
      await addArtwork();
      await act(async () => {
        editor.setCamera({ x: -35, y: 20, z: 2 });
        cad.writeCadSettings(editor, { ...cad.DEFAULT_CAD_SETTINGS, originX: 70, originY: 500, scale: 2 });
      });
      const before = snapshot(), shapes = structuredClone(editor.getCurrentPageShapesSorted()), exported = exportPlan();
      assert.equal((await start(axis, axis === 'x' ? { clientX: 130, clientY: 300 } : { clientX: 400, clientY: 80 })).started, true);
      await pointer(env.win, 'pointermove', { clientX: 540, clientY: 410 });
      near(drag.drawingGuideDrag(editor).get().position, axis === 'x' ? 235 : 140);
      assert.deepEqual(snapshot(), before); assert.equal(guides.readDrawingGuides(editor).guides.length, 0);
      await pointer(env.win, 'pointerup', { clientX: 540, clientY: 410 });
      const guide = guides.readDrawingGuides(editor).guides[0]; assert.equal(guide.axis, axis);
      near(guide.position, axis === 'x' ? 235 : 140);
      if (axis === 'y') near(guides.guidePositionToUnit('y', guide.position, cad.readCadSettings(editor)), 190.5);
      assert.deepEqual(editor.getCurrentPageShapesSorted(), shapes); assert.deepEqual(exportPlan(), exported);
      assert.equal(drag.drawingGuideDrag(editor).get(), null); assert.equal(gesture.isDrawingPointerGestureActive(editor), false);
      const after = snapshot();
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
      await act(async () => editor.redo()); assert.deepEqual(snapshot(), after);
    });
  });

  it('moves the actual overlay line without a hit-band jump or a native selection gesture', async () => {
    await harness(async ({ editor, env, guides, drag, gesture, addGuide, addArtwork, line, pointer, snapshot, act }) => {
      const artwork = await addArtwork(); await addGuide();
      await act(async () => editor.setCamera({ x: 0, y: 0, z: 2 }));
      const before = snapshot(), target = line(), original = structuredClone(editor.getShape(artwork));
      // The hit lies six screen pixels to the right of the guide, not on it.
      await pointer(target, 'pointerdown', { clientX: 446, clientY: 300 });
      assert.equal(editor.getPath(), 'select.idle'); assert.equal(gesture.isDrawingPointerGestureActive(editor), true);
      near(drag.drawingGuideDrag(editor).get().position, 150);
      await pointer(env.win, 'pointermove', { clientX: 486, clientY: 300 });
      near(drag.drawingGuideDrag(editor).get().position, 170); assert.deepEqual(snapshot(), before);
      await pointer(env.win, 'pointerup', { clientX: 486, clientY: 300 });
      near(guides.readDrawingGuides(editor).guides[0].position, 170);
      assert.deepEqual(editor.getShape(artwork), original); assert.deepEqual(editor.getSelectedShapeIds(), [artwork]);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
    });
  });

  it('deletes an existing guide outside the viewport and restores it with one Undo', async () => {
    await harness(async ({ editor, env, guides, addGuide, line, pointer, snapshot, act }) => {
      await addGuide(); const before = snapshot();
      await pointer(line(), 'pointerdown', { clientX: 290, clientY: 300 });
      await pointer(env.win, 'pointerup', { clientX: 130, clientY: 300 });
      assert.equal(guides.readDrawingGuides(editor).guides.length, 0);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
    });
  });

  it('cancels a new guide dropped outside and ignores a click without a drag', async () => {
    await harness(async ({ editor, env, guides, start, pointer, snapshot, addGuide, line, act }) => {
      const empty = snapshot();
      await start('y', { clientX: 400, clientY: 80 });
      await pointer(env.win, 'pointermove', { clientX: 400, clientY: 240 });
      await pointer(env.win, 'pointerup', { clientX: 400, clientY: 700 });
      assert.deepEqual(snapshot(), empty);
      await addGuide();
      await pointer(line(), 'pointerdown', { clientX: 290, clientY: 300 });
      await pointer(env.win, 'pointerup', { clientX: 291, clientY: 300 });
      near(guides.readDrawingGuides(editor).guides[0].position, 150);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), empty);
    });
  });

  it('consumes the finishing Enter release after guide removal and canvas refocus, then restores native Enter', async () => {
    await harness(async ({ editor, env, container, guides, pointer, addGuide, addArtwork, line, key, act, tick }) => {
      const id = await addArtwork(); await addGuide();
      const target = line(), before = structuredClone(editor.getShape(id));
      await pointer(target, 'pointerdown', { clientX: 290, clientY: 300 });
      await pointer(env.win, 'pointermove', { clientX: 100, clientY: 300 });
      await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })));
      await tick();
      assert.equal(guides.readDrawingGuides(editor).guides.length, 0);
      assert.equal(target.isConnected, false);
      // The finishing key can be released on a different element after the
      // original SVG control disappears. Reproduce that actual focus boundary.
      await act(async () => container.focus());
      const release = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
      await act(async () => document.activeElement!.dispatchEvent(release)); await tick();
      assert.equal(release.defaultPrevented, true);
      assert.equal(editor.getPath(), 'select.idle', 'the consumed Enter release must not start editing underlying artwork');
      assert.deepEqual(editor.getSelectedShapeIds(), [id]); assert.deepEqual(editor.getShape(id), before);
      await key(container, 'Enter');
      assert.equal(editor.getPath(), 'select.editing_shape', 'the guard must retire after its one matching release');
    });
  });

  it('retires a finishing-key release guard when the window loses focus', async () => {
    await harness(async ({ editor, env, container, guides, pointer, addGuide, addArtwork, line, act, tick }) => {
      await addArtwork(); await addGuide(); const target = line();
      await pointer(target, 'pointerdown', { clientX: 290, clientY: 300 });
      await pointer(env.win, 'pointermove', { clientX: 100, clientY: 300 });
      await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })));
      await tick(); assert.equal(guides.readDrawingGuides(editor).guides.length, 0);
      await act(async () => { env.win.dispatchEvent(new Event('blur')); container.focus(); });
      await act(async () => container.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })));
      await tick();
      assert.equal(editor.getPath(), 'select.editing_shape', 'a key release after window blur must not be retained by an old gesture');
    });
  });

  for (const reason of ['Escape', 'pointercancel', 'lostpointercapture', 'blur', 'explicit'] as const)
    it(`cancels on ${reason} and releases capture and shared gesture ownership`, async () => {
      await harness(async ({ editor, env, drag, gesture, start, pointer, key, snapshot, act }) => {
        const before = snapshot(), started = await start('x', { clientX: 130, clientY: 300 });
        assert.equal(started.started, true);
        await pointer(env.win, 'pointermove', { clientX: 500, clientY: 300 });
        if (reason === 'Escape') await key(started.target, 'Escape');
        else if (reason === 'explicit') await act(async () => drag.cancelDrawingGuideDrag(editor));
        else if (reason === 'blur') await act(async () => env.win.dispatchEvent(new Event('blur')));
        else await pointer(reason === 'lostpointercapture' ? started.target : env.win, reason);
        assert.equal(drag.drawingGuideDrag(editor).get(), null); assert.equal(gesture.isDrawingPointerGestureActive(editor), false);
        assert.equal(env.captures.has(1), false); assert.deepEqual(snapshot(), before);
        const release = gesture.claimDrawingPointerGesture(editor, 'skew', 2); assert.ok(release); release();
        await pointer(env.win, 'pointerup', { clientX: 500, clientY: 300 }); assert.deepEqual(snapshot(), before);
      });
    });

  for (const change of ['readonly', 'page', 'calibration', 'guides', 'tool', 'nodes', 'camera', 'viewport', 'menu'] as const)
    it(`invalidates a drag after ${change} changes without committing a stale position`, async () => {
      await harness(async ({ editor, env, drag, guides, gesture, cad, nodes, tldraw, start, pointer, snapshot, act, tick }) => {
        await start('y', { clientX: 400, clientY: 80 });
        await pointer(env.win, 'pointermove', { clientX: 400, clientY: 300 });
        await act(async () => {
          if (change === 'readonly') editor.updateInstanceState({ isReadonly: true });
          if (change === 'page') { const id = tldraw.PageRecordType.createId('other'); editor.createPage({ id, name: 'Other page' }); editor.setCurrentPage(id); }
          if (change === 'calibration') cad.writeCadSettings(editor, { ...cad.DEFAULT_CAD_SETTINGS, originY: 400 });
          if (change === 'guides') {
            // Another collaborator bypasses this editor's local busy gesture
            // guard. Apply their page record as an external metadata update.
            const page = editor.getCurrentPage(), state = guides.readDrawingGuides(editor);
            editor.updatePage({ id: page.id, meta: { ...page.meta, omsGuides: { ...state,
              guides: [...state.guides, { id: 'guide:collaborator', axis: 'x', position: 800, visible: true, locked: false }] } } });
          }
          if (change === 'tool') editor.setCurrentTool('draw');
          if (change === 'nodes') nodes.setCadNodeEditing(editor, true);
          if (change === 'camera') editor.setCamera({ x: 30, y: 40, z: 2 });
          if (change === 'viewport') editor.updateViewportScreenBounds(new tldraw.Box(160, 90, 780, 600));
          if (change === 'menu') editor.addOpenMenu('test-menu');
        });
        await tick(); const afterChange = snapshot();
        assert.equal(drag.drawingGuideDrag(editor).get(), null); assert.equal(gesture.isDrawingPointerGestureActive(editor), false);
        await pointer(env.win, 'pointerup', { clientX: 400, clientY: 350 }); assert.deepEqual(snapshot(), afterChange);
      });
    });

  it('rejects protected or non-primary starts without consuming their pointer events', async () => {
    await harness(async ({ editor, guides, drag, gesture, nodes, addGuide, start, snapshot, act }) => {
      await addGuide();
      for (const mode of ['readonly', 'all-locked', 'locked', 'hidden', 'all-hidden', 'nodes', 'drawing', 'menu', 'right-button', 'non-primary']) {
        await act(async () => {
          editor.updateInstanceState({ isReadonly: false }); editor.setCurrentTool('select'); nodes.setCadNodeEditing(editor, false); editor.deleteOpenMenu('test-menu');
          const page = editor.getCurrentPage();
          editor.updatePage({ id: page.id, meta: { ...page.meta, omsGuides: { version: 1, visible: mode !== 'all-hidden', locked: mode === 'all-locked',
            guides: [{ id: 'guide:test', axis: 'x', position: 150, visible: mode !== 'hidden', locked: mode === 'locked' }] } } });
          if (mode === 'readonly') editor.updateInstanceState({ isReadonly: true });
          if (mode === 'nodes') nodes.setCadNodeEditing(editor, true);
          if (mode === 'drawing') editor.setCurrentTool('draw');
          if (mode === 'menu') editor.addOpenMenu('test-menu');
        });
        const before = snapshot(), result = await start('x', { button: mode === 'right-button' ? 2 : 0, isPrimary: mode !== 'non-primary' }, 'guide:test');
        assert.equal(result.started, false, mode); assert.equal(result.event.defaultPrevented, false, mode);
        assert.equal(gesture.isDrawingPointerGestureActive(editor), false, mode); assert.equal(drag.drawingGuideDrag(editor).get(), null);
        assert.deepEqual(snapshot(), before); assert.equal(guides.readDrawingGuides(editor).guides.length, 1);
      }
    });
  });

  it('blocks a second pointer before native canvas handling and allows another gesture after cancellation', async () => {
    await harness(async ({ editor, env, canvas, rulerX, drag, gesture, start, pointer, snapshot, act }) => {
      const before = snapshot(); assert.equal((await start('x', { clientX: 130, clientY: 300, pointerId: 11 })).started, true);
      const preview = structuredClone(drag.drawingGuideDrag(editor).get());
      for (const target of [canvas, rulerX]) {
        const event = await pointer(target, 'pointerdown', { clientX: 500, clientY: 300, pointerId: 22, pointerType: 'touch', isPrimary: false });
        assert.equal(event.defaultPrevented, true); assert.equal(editor.getPath(), 'select.idle');
      }
      assert.equal(gesture.claimDrawingPointerGesture(editor, 'skew', 22), null);
      assert.deepEqual(drag.drawingGuideDrag(editor).get(), preview); assert.deepEqual(snapshot(), before);
      await pointer(env.win, 'pointercancel', { pointerId: 11 });
      assert.equal((await start('y', { clientX: 400, clientY: 80, pointerId: 22 })).started, true);
      await act(async () => drag.cancelDrawingGuideDrag(editor));
      assert.equal(gesture.isDrawingPointerGestureActive(editor), false);
    });
  });

  it('keeps form pointer and text editing out of drawing and guide gestures', async () => {
    await harness(async ({ editor, container, gesture, pointer, key, addArtwork, snapshot, act }) => {
      const id = await addArtwork(), before = snapshot(), input = container.querySelector('input')!;
      await pointer(input, 'pointerdown', { clientX: 400, clientY: 300 });
      // jsdom dispatch does not perform the browser's default focus on click.
      await act(async () => input.focus());
      await key(input, 'ArrowRight'); await key(input, 'Delete');
      assert.equal(editor.getPath(), 'select.idle'); assert.equal(gesture.isDrawingPointerGestureActive(editor), false);
      assert.deepEqual(snapshot(), before); assert.deepEqual(editor.getSelectedShapeIds(), [id]);
    });
  });

  it('nudges, inspects and deletes a focused guide without nudging or deleting selected artwork', async () => {
    await harness(async ({ editor, guides, addGuide, addArtwork, line, key, sent, act, snapshot }) => {
      const id = await addArtwork(); await addGuide();
      const artwork = structuredClone(editor.getShape(id)), target = line();
      await act(async () => target.focus());
      await key(target, 'ArrowRight'); near(guides.readDrawingGuides(editor).guides[0].position, 151);
      await key(target, 'ArrowRight', { shiftKey: true }); near(guides.readDrawingGuides(editor).guides[0].position, 161);
      await key(target, 'ArrowLeft', { ctrlKey: true }); near(guides.readDrawingGuides(editor).guides[0].position, 160.9);
      await key(target, 'Enter'); assert.deepEqual(sent, [{ kind: 'panel', action: 'guides' }]);
      assert.equal(editor.getPath(), 'select.idle', 'Enter keyup must not start text editing on the selected artwork');
      await key(target, 'Escape'); assert.equal(guides.selectedDrawingGuide(editor).get(), null);
      assert.deepEqual(editor.getShape(id), artwork); assert.deepEqual(editor.getSelectedShapeIds(), [id]);
      const beforeDelete = snapshot();
      await key(target, 'Delete'); assert.equal(guides.readDrawingGuides(editor).guides.length, 0); assert.deepEqual(editor.getShape(id), artwork);
      await act(async () => editor.undo()); assert.deepEqual(snapshot(), beforeDelete);
    });
  });

  it('uses physical nudge distance and upward CAD Y for horizontal guide keyboard movement', async () => {
    await harness(async ({ editor, guides, cad, addGuide, line, key, act }) => {
      await act(async () => cad.writeCadSettings(editor, { ...cad.DEFAULT_CAD_SETTINGS, originY: 500, nudge: 25.4, scale: 2 }));
      await addGuide('y', 200);
      await key(line(), 'ArrowUp'); near(guides.readDrawingGuides(editor).guides[0].position, 152);
      const position = guides.guidePositionToUnit('y', 152, cad.readCadSettings(editor)); near(position, 184.15);
    });
  });

  it('allows modifier transitions on guide controls without leaving the native editor modifiers stuck', async () => {
    await harness(async ({ editor, addArtwork, addGuide, line, act, tick, snapshot }) => {
      await addArtwork(); await addGuide(); const before = snapshot(), target = line();
      await act(async () => target.focus());
      for (const [key, flag] of [['Shift', 'shiftKey'], ['Control', 'ctrlKey'], ['Alt', 'altKey']]) {
        await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key, code: `${key}Left`, [flag]: true, bubbles: true, cancelable: true })));
        await tick(); assert.equal(editor.inputs[flag], true, `${key} pressed`);
        await act(async () => target.dispatchEvent(new KeyboardEvent('keyup', { key, code: `${key}Left`, [flag]: false, bubbles: true, cancelable: true })));
        // Native tldraw intentionally delays modifier release by 150 ms.
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 180)); });
        assert.equal(editor.inputs[flag], false, `${key} released`);
      }
      assert.deepEqual(snapshot(), before); assert.equal(editor.getPath(), 'select.idle');
    });
  });
});
