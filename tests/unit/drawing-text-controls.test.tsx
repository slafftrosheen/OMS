import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

/** Real Editor, native text tool, history, React controls and DOM events. Text
 * metrics are deterministic because JSDOM has no layout; this does not verify
 * browser wrapping or rendered pixel positions. */
async function harness(run: (h: any) => Promise<void>) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window, channels: MessageChannel[] = [], NativeChannel = globalThis.MessageChannel;
  win.fetch = globalThis.fetch.bind(globalThis);
  const media = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  win.matchMedia = media;
  const values: Record<string, unknown> = { matchMedia: media, IS_REACT_ACT_ENVIRONMENT: true,
    getComputedStyle: win.getComputedStyle.bind(win), requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    MessageChannel: class extends NativeChannel { constructor() { super(); channels.push(this); } },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  for (const key of ['window', 'document', 'navigator', 'self', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
    'SVGElement', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'DOMRect', 'MutationObserver', 'Image', 'localStorage'])
    values[key] = key === 'window' || key === 'self' ? win : win[key];
  const clearNodeTimeout = globalThis.clearTimeout, clearNodeInterval = globalThis.clearInterval;
  values.clearTimeout = (id: any) => typeof id === 'number' ? win.clearTimeout(id) : clearNodeTimeout(id);
  values.clearInterval = (id: any) => typeof id === 'number' ? win.clearInterval(id) : clearNodeInterval(id);
  win.Element.prototype.setPointerCapture = () => {};
  win.Element.prototype.hasPointerCapture = () => false;
  win.Element.prototype.releasePointerCapture = () => {};
  win.Element.prototype.scrollIntoView = () => {};
  win.HTMLImageElement.prototype.decode = async () => {};
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client');
  const tl = await import('@tldraw/tldraw');
  const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
  const controls = await import('../../src/lib/components/canvas/DrawingTextControls');
  const { TextPanel } = await import('../../src/lib/components/canvas/WorkbenchPanels');
  const textStyle = await import('../../src/lib/components/canvas/drawing-text-style');
  const defaults = await import('../../src/lib/components/canvas/drawing-text-defaults');
  const spacing = await import('../../src/lib/components/canvas/drawing-text-spacing');
  const fonts = await import('../../src/lib/components/canvas/drawing-fonts');
  const operations = await import('../../src/lib/components/canvas/workbench-operations');
  const cad = await import('../../src/lib/components/canvas/cad-settings');
  const { installDrawingTextUtil } = await import('../../src/lib/components/canvas/shapes/DrawingTextShape');
  const { locale, t } = await import('svelte-i18n'); locale.set('en'); const stopText = t.subscribe(() => {});
  const host = document.createElement('div'); host.tabIndex = 0; document.body.append(host);
  host.getBoundingClientRect = () => win.DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 });
  const shapeUtils = tl.defaultShapeUtils;
  const editor = new tl.Editor({ store: tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }), shapeUtils,
    bindingUtils: tl.defaultBindingUtils, tools: [...tl.defaultTools, ...tl.defaultShapeTools], getContainer: () => host, initialState: 'select' });
  editor.updateViewportScreenBounds(new tl.Box(0, 0, 800, 600)); editor.updateInstanceState({ isFocused: true });
  editor.textMeasure.measureText = (text: string, options: any) => {
    const tracking = parseFloat(editor.textMeasure.baseElm.style.letterSpacing || '0');
    const charWidth = options.fontSize * (options.fontFamily.includes('mono') ? .7 : .5) + tracking;
    const lengths = text.split('\n').map(line => Math.max(1, line.length) * charWidth);
    const lines = lengths.reduce((n, width) => n + (options.maxWidth ? Math.max(1, Math.ceil(width / options.maxWidth)) : 1), 0);
    return { x: 0, y: 0, w: options.maxWidth || Math.max(...lengths), h: lines * options.fontSize * options.lineHeight, scrollWidth: Math.max(...lengths) };
  };
  installDrawingTextUtil(editor);
  const stopDefaults = defaults.installDrawingTextDefaults(editor), stopFonts = fonts.installDrawingFonts(editor);
  const root = createRoot(host);
  let outlines = 0;
  function Scene() {
    const state = tl.useValue('text controls test selection', () => ({
      shapes: editor.getSelectedShapes().filter((shape: any) => shape.type === 'text'), readonly: editor.getInstanceState().isReadonly,
    }), [editor]);
    const disabled = state.readonly || state.shapes.some((shape: any) => editor.isShapeOrAncestorLocked(shape));
    return <>
      {state.shapes.length > 0 && <controls.SelectedTextStyleFields shapes={state.shapes as any} disabled={disabled} />}
      <controls.NextTextProperties disabled={state.readonly} />
      <TextPanel onOutlines={() => outlines++} onLettering={() => {}} />
    </>;
  }
  const tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 24)); }); };
  const get = (id: string) => { const element = host.querySelector(`[data-testid="${id}"]`) as HTMLElement; assert.ok(element, id); return element; };
  const input = async (id: string, value: string) => {
    await act(async () => {
      const node = get(id) as HTMLInputElement | HTMLTextAreaElement;
      Object.getOwnPropertyDescriptor(node instanceof win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype, 'value')!.set!.call(node, value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
    }); await tick();
  };
  const key = async (id: string, value: string, extra = {}) => { await act(async () => get(id).dispatchEvent(new KeyboardEvent('keydown', { key: value, code: value, bubbles: true, cancelable: true, ...extra }))); await tick(); };
  const focus = async (id: string) => { await act(async () => get(id).focus()); await tick(); };
  const blur = async (id: string) => { await act(async () => get(id).blur()); await tick(); };
  const click = async (id: string) => { await act(async () => get(id).click()); await tick(); };
  const choose = async (id: string, value: string) => { await act(async () => { const node = get(id) as HTMLSelectElement; node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); }); await tick(); };
  const select = async (...ids: any[]) => { await act(async () => { editor.setCurrentTool('select'); editor.setSelectedShapes(ids); }); await tick(); };
  const add = async (name: string, props = {}, extra = {}) => {
    const id = tl.createShapeId(name);
    await act(async () => editor.createShape({ id, type: 'text', x: 100, y: 100, meta: { keep: name }, props: { text: 'ABCD', font: 'sans', size: 'm', scale: 1, textAlign: 'middle', autoSize: true, ...props }, ...extra } as any)); await tick();
    return id;
  };
  const snapshot = () => JSON.stringify(editor.store.getStoreSnapshot('document'));
  const pointer = async (name: string, x: number, y: number) => {
    await act(async () => editor.dispatch({ type: 'pointer', name, target: 'canvas', point: { x, y, z: .5 }, button: 0,
      pointerId: 1, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isPen: false } as any)); await tick();
  };
  try {
    await act(async () => root.render(<EditorContext.Provider value={editor}><Scene /></EditorContext.Provider>)); await tick();
    await run({ editor, host, get, input, key, focus, blur, click, choose, select, add, snapshot, pointer, act, tick, tl, textStyle, defaults, spacing, fonts, operations, cad, outlines: () => outlines, locale });
  } finally {
    await act(async () => root.unmount()); stopDefaults(); stopFonts(); stopText(); editor.dispose(); host.remove();
    channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
}

describe('Text controls with a real editor', () => {
  it('commits numeric Enter/blur once, cancels Escape, validates ranges and resets equal-value selection drafts', async () => {
    await harness(async ({ editor, add, select, input, focus, blur, key, get, operations, spacing, act, tick }) => {
      const a = await add('a'), b = await add('b'); await select(a, b);
      await input('drawing-text-point-size', '36'); await key('drawing-text-point-size', 'Enter');
      near(operations.textPointSize(editor.getShape(a)), 36); near(operations.textPointSize(editor.getShape(b)), 36);
      await act(async () => editor.undo()); await tick();
      near(operations.textPointSize(editor.getShape(a)), 18); near(operations.textPointSize(editor.getShape(b)), 18);
      await focus('drawing-text-letter-spacing'); await input('drawing-text-letter-spacing', '20'); await blur('drawing-text-letter-spacing');
      assert.equal(spacing.getDrawingTextSpacing(editor.getShape(a)).letterSpacing, 20);
      await input('drawing-text-point-size', '0'); await key('drawing-text-point-size', 'Enter');
      assert.equal(get('drawing-text-point-size').getAttribute('aria-invalid'), 'true'); near(operations.textPointSize(editor.getShape(a)), 18);
      await key('drawing-text-point-size', 'Escape'); assert.equal((get('drawing-text-point-size') as HTMLInputElement).value, '18');
      await input('drawing-text-line-spacing', '200'); await key('drawing-text-line-spacing', 'Enter');
      assert.equal(spacing.getDrawingTextSpacing(editor.getShape(a)).lineHeight, 2);
      await select(a); await input('drawing-text-point-size', '72'); await select(b);
      assert.equal((get('drawing-text-point-size') as HTMLInputElement).value, '18');
      await key('drawing-text-point-size', 'Enter'); near(operations.textPointSize(editor.getShape(b)), 18);
      await input('drawing-text-point-size', '99'); await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
      assert.equal(get('drawing-text-point-size').matches(':disabled'), true); near(operations.textPointSize(editor.getShape(b)), 18);
    });
  });

  it('applies docker typography immediately without losing pending content and saves content in one undo step', async () => {
    await harness(async ({ editor, add, select, input, key, get, choose, click, operations, act, tick, snapshot, outlines }) => {
      const a = await add('a'); await select(a);
      await act(async () => assert.equal(operations.editDrawingText(editor, a, { text: 'ABCD', font: 'serif', pointSize: 18, textAlign: 'middle', autoSize: true }), true)); await tick();
      assert.equal(editor.getShape(a).props.font, 'serif'); assert.deepEqual(editor.getShape(a).meta, { keep: 'a' });
      await input('drawing-text-docker-content', 'Rīga\nNew lettering');
      await choose('drawing-text-docker-font', 'mono');
      assert.equal(editor.getShape(a).props.font, 'mono'); assert.equal(editor.getShape(a).props.text, 'ABCD');
      await input('drawing-text-docker-point-size', '30'); await key('drawing-text-docker-point-size', 'Enter');
      near(operations.textPointSize(editor.getShape(a)), 30);
      assert.equal((get('drawing-text-docker-content') as HTMLTextAreaElement).value, 'Rīga\nNew lettering');
      await key('drawing-text-docker-content', 'Enter', { ctrlKey: true });
      assert.equal(editor.getShape(a).props.text, 'Rīga\nNew lettering');
      await act(async () => editor.undo()); await tick(); assert.equal(editor.getShape(a).props.text, 'ABCD'); near(operations.textPointSize(editor.getShape(a)), 30);
      await input('drawing-text-docker-content', 'cancel me'); await key('drawing-text-docker-content', 'Escape');
      assert.equal((get('drawing-text-docker-content') as HTMLTextAreaElement).value, 'ABCD');
      const before = snapshot(), original = editor.updateShape;
      editor.updateShape = () => editor;
      try { await input('drawing-text-docker-content', 'refused'); await click('drawing-text-docker-apply'); assert.equal(snapshot(), before); assert.ok(get('drawing-text-docker-apply').parentElement?.querySelector('[role=alert]')); }
      finally { editor.updateShape = original; }
      await input('drawing-text-docker-content', 'Final'); await click('drawing-text-docker-outlines');
      assert.equal(editor.getShape(a).props.text, 'Final'); assert.equal(outlines(), 1);
    });
  });

  it('keeps rotated text anchors, freezes its displayed box width and leaves native resizing anchored correctly', async () => {
    await harness(async ({ editor, add, select, textStyle, operations, act, tick, tl }) => {
      const id = await add('scaled', { scale: 2, textAlign: 'end' }, { rotation: .7 }); await select(id);
      const anchor = () => { const shape = editor.getShape(id), bounds = editor.getShapeGeometry(shape).bounds; return editor.getShapePageTransform(shape).applyToPoint({ x: bounds.w, y: bounds.h / 2 }); };
      const before = structuredClone(editor.getShape(id)), initial = anchor();
      await act(async () => assert.equal(textStyle.applySelectedDrawingTextStyle(editor, [id], { pointSize: 72 }), true)); await tick();
      near(anchor().x, initial.x); near(anchor().y, initial.y); near(operations.textPointSize(editor.getShape(id)), 72);
      await act(async () => editor.undo()); await tick(); assert.deepEqual(editor.getShape(id), before);
      await act(async () => { textStyle.applySelectedDrawingTextStyle(editor, [id], { font: 'mono' }); }); await tick();
      const physicalWidth = editor.getShapeGeometry(id).bounds.w, fixedAt = { x: editor.getShape(id).x, y: editor.getShape(id).y };
      await act(async () => assert.equal(textStyle.applySelectedDrawingTextStyle(editor, [id], { autoSize: false }), true)); await tick();
      near(editor.getShapeGeometry(id).bounds.w, physicalWidth); near(editor.getShape(id).x, fixedAt.x); near(editor.getShape(id).y, fixedAt.y);
      await act(async () => assert.equal(textStyle.applySelectedDrawingTextStyle(editor, [id], { pointSize: 54 }), true)); await tick();
      near(editor.getShapeGeometry(id).bounds.w, physicalWidth);
      await act(async () => textStyle.applySelectedDrawingTextStyle(editor, [id], { autoSize: true })); await tick();
      const shape = editor.getShape(id), origin = editor.getShapePageTransform(shape).applyToPoint({ x: 0, y: 0 });
      await act(async () => editor.resizeShape(shape, { x: 2, y: 2 }, { scaleOrigin: new tl.Vec(origin.x, origin.y), mode: 'scale_shape' })); await tick();
      near(editor.getShape(id).x, shape.x); near(editor.getShape(id).y, shape.y); near(editor.getShape(id).props.scale, shape.props.scale * 2);
    });
  });

  it('invalidates cached fixed-text geometry for spacing changes and restores geometry on undo/redo', async () => {
    await harness(async ({ editor, add, select, textStyle, spacing, act, tick }) => {
      const id = await add('fixed', { text: 'A long paragraph\nwith a second line', autoSize: false, w: 120 }); await select(id);
      const before = editor.getShapeGeometry(id).bounds.h;
      await act(async () => assert.equal(textStyle.applySelectedDrawingTextStyle(editor, [id], { letterSpacing: 20, lineHeight: 2 }), true)); await tick();
      const after = editor.getShapeGeometry(id).bounds.h; assert.ok(after > before);
      assert.deepEqual(spacing.getDrawingTextSpacing(editor.getShape(id)), { letterSpacing: 20, lineHeight: 2 });
      await act(async () => editor.undo()); await tick(); near(editor.getShapeGeometry(id).bounds.h, before);
      await act(async () => editor.redo()); await tick(); near(editor.getShapeGeometry(id).bounds.h, after);
      await act(async () => assert.equal(textStyle.applySelectedDrawingTextStyle(editor, [id], { letterSpacing: 0, lineHeight: 1.35 }), true)); await tick();
      near(editor.getShapeGeometry(id).bounds.h, before);
    });
  });

  it('rejects oversized type in a narrow paragraph before mutation and explains how to keep editing', async () => {
    await harness(async ({ editor, add, select, textStyle, operations, snapshot, input, focus, blur, key, get, choose, act, tick }) => {
      const id = await add('narrow', { text: 'ABCD', size: 'm', scale: 1, autoSize: false, w: 64 }); await select(id);
      const before = snapshot(); near(editor.getShapeGeometry(id).bounds.w, 64);
      await act(async () => assert.equal(textStyle.applySelectedDrawingTextStyle(editor, [id], { pointSize: 96 }), false)); await tick();
      assert.equal(snapshot(), before); near(editor.getShapeGeometry(id).bounds.w, 64);
      await act(async () => assert.equal(operations.editDrawingText(editor, id, { text: 'Must not overwrite', font: 'mono', pointSize: 96, textAlign: 'start', autoSize: false }), false)); await tick();
      assert.equal(snapshot(), before);

      await input('drawing-text-point-size', '96'); await key('drawing-text-point-size', 'Enter');
      assert.equal(get('drawing-text-point-size').getAttribute('aria-invalid'), 'true');
      const message = document.getElementById(get('drawing-text-point-size').getAttribute('aria-describedby')!)!;
      assert.match(message.textContent!, /smaller size, widen the box, or choose Fit width to text/);
      assert.equal(snapshot(), before); await key('drawing-text-point-size', 'Escape');
      assert.equal((get('drawing-text-point-size') as HTMLInputElement).value, '18');
      await focus('drawing-text-docker-point-size'); await input('drawing-text-docker-point-size', '96'); await blur('drawing-text-docker-point-size');
      assert.equal(get('drawing-text-docker-point-size').getAttribute('aria-invalid'), 'true'); assert.equal(snapshot(), before);
      await key('drawing-text-docker-point-size', 'Escape');

      // At 72pt the 64px box has exactly 16 native layout pixels: geometry,
      // TextLabel and SVG span measurement retain the same supported width.
      await input('drawing-text-point-size', '72'); await key('drawing-text-point-size', 'Enter');
      near(editor.getShape(id).props.w, 16); near(editor.getShape(id).props.scale, 4); near(editor.getShapeGeometry(id).bounds.w, 64);
      await act(async () => editor.undo()); await tick(); assert.equal(snapshot(), before);

      // The suggested Fit width action makes larger type usable deliberately.
      await input('drawing-text-point-size', '96'); await key('drawing-text-point-size', 'Enter');
      assert.equal(get('drawing-text-point-size').getAttribute('aria-invalid'), 'true');
      await choose('drawing-text-auto-width', 'true');
      assert.equal(get('drawing-text-point-size').getAttribute('aria-invalid'), 'false');
      const fittedBefore = snapshot();
      await act(async () => assert.equal(textStyle.applySelectedDrawingTextStyle(editor, [id], { pointSize: 96, autoSize: false }), false)); await tick();
      assert.equal(snapshot(), fittedBefore, 'combined mode and type-size edits use the same guard');
      await act(async () => assert.equal(operations.editDrawingText(editor, id, { text: 'No partial content', font: 'sans', pointSize: 96, textAlign: 'middle', autoSize: false }), false)); await tick();
      assert.equal(snapshot(), fittedBefore);
      await input('drawing-text-point-size', '96'); await key('drawing-text-point-size', 'Enter');
      near(operations.textPointSize(editor.getShape(id)), 96); assert.equal(editor.getShape(id).props.autoSize, true);
    });
  });

  it('uses exact new-text defaults through native click and drag creation while preserving imported text', async () => {
    await harness(async ({ editor, input, key, choose, get, defaults, spacing, operations, fonts, snapshot, pointer, act, tick, tl }) => {
      const before = snapshot();
      await input('drawing-next-text-point-size', '36'); await key('drawing-next-text-point-size', 'Enter');
      await input('drawing-next-text-letter-spacing', '15'); await key('drawing-next-text-letter-spacing', 'Enter');
      await input('drawing-next-text-line-spacing', '200'); await key('drawing-next-text-line-spacing', 'Enter');
      await choose('drawing-next-text-align', 'end'); await choose('drawing-property-font', 'mono');
      assert.equal(snapshot(), before); assert.equal(editor.getCanUndo(), false);
      await act(async () => editor.setCurrentTool('text')); await tick();
      await pointer('pointer_down', 200, 150); await pointer('pointer_up', 200, 150);
      const created = editor.getOnlySelectedShape(); assert.equal(created.type, 'text'); near(operations.textPointSize(created), 36);
      assert.equal(created.props.textAlign, 'end'); assert.equal(created.props.font, 'mono'); assert.equal(created.props.autoSize, true);
      assert.deepEqual(spacing.getDrawingTextSpacing(created), { letterSpacing: 15, lineHeight: 2 });
      assert.deepEqual(Object.keys(created.meta.omsTextSpacing).sort(), ['letterSpacing', 'lineHeight']);
      await act(async () => { editor.updateShape({ id: created.id, type: 'text', props: { text: 'Native label' } }); editor.complete(); editor.setCurrentTool('text'); }); await tick();
      const importedId = tl.createShapeId('imported');
      await act(async () => editor.createShape({ id: importedId, type: 'text', props: { text: 'Imported', scale: .5, font: 'serif', textAlign: 'start' }, meta: { keep: true } })); await tick();
      const imported = editor.getShape(importedId); assert.equal(imported.props.scale, .5); assert.equal(imported.props.font, 'serif'); assert.deepEqual(imported.meta, { keep: true });
      await pointer('pointer_down', 400, 300); await pointer('pointer_move', 600, 300); await pointer('pointer_up', 600, 300);
      const paragraph = editor.getOnlySelectedShape(); assert.equal(paragraph.type, 'text'); assert.equal(paragraph.props.autoSize, false); near(operations.textPointSize(paragraph), 36);
      await act(async () => { editor.updateShape({ id: paragraph.id, type: 'text', props: { text: 'Paragraph' } }); editor.complete(); editor.setStyleForNextShapes(tl.DefaultSizeStyle, 'xl'); }); await tick();
      near(defaults.getNextDrawingTextStyle(editor).pointSize, 33);
      await act(async () => editor.setStyleForNextShapes(tl.DefaultSizeStyle, 'm')); await tick();
      near(defaults.getNextDrawingTextStyle(editor).pointSize, 18);
      await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
      assert.equal(get('drawing-next-text-point-size').matches(':disabled'), true);
      assert.equal(defaults.setNextDrawingTextStyle(editor, { pointSize: 100 }), false); assert.equal(fonts.setNextDrawingFont(editor, 'sans'), false);
    });
  });

  it('creates a dragged paragraph at the drawn width regardless of calibrated text size', async () => {
    await harness(async ({ editor, defaults, operations, pointer, cad, act, tick }) => {
      for (const scale of [.1, 1, 10, 1000]) {
        await act(async () => {
          editor.complete(); editor.selectNone();
          editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS, scale } } });
          defaults.setNextDrawingTextStyle(editor, { pointSize: 36 });
          editor.setCurrentTool('text');
        }); await tick();
        await pointer('pointer_down', 100, 300); await pointer('pointer_move', 700, 300); await pointer('pointer_up', 700, 300);
        const paragraph = editor.getOnlySelectedShape();
        assert.equal(paragraph.type, 'text'); assert.equal(paragraph.props.autoSize, false);
        near(operations.textPointSize(paragraph, cad.readCadSettings(editor)), 36);
        near(editor.getShapeGeometry(paragraph).bounds.w, 600);
      }
    });
  });

  it('keeps reverse paragraph drags exact when zoomed and retains native cancellation and undo', async () => {
    await harness(async ({ editor, defaults, pointer, cad, act, tick }) => {
      await act(async () => {
        editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS, scale: 10 } } });
        defaults.setNextDrawingTextStyle(editor, { pointSize: 72 });
        editor.setCamera({ x: 0, y: 0, z: 2 }); editor.setCurrentTool('text');
      }); await tick();
      await pointer('pointer_down', 500, 300); await pointer('pointer_move', 100, 300); await pointer('pointer_up', 100, 300);
      const shape = editor.getOnlySelectedShape();
      near(editor.getShapeGeometry(shape).bounds.w, 200);
      near(editor.getShapePageBounds(shape).minX, 50);
      await act(async () => { editor.updateShape({ id: shape.id, type: 'text', props: { text: 'Paragraph' } }); editor.complete(); }); await tick();
      const saved = structuredClone(editor.getShape(shape.id));
      await act(async () => editor.undo()); await tick(); assert.equal(editor.getShape(shape.id), undefined);
      await act(async () => editor.redo()); await tick(); assert.deepEqual(editor.getShape(shape.id), saved);
      await act(async () => { editor.selectNone(); editor.setCurrentTool('text'); }); await tick();
      await pointer('pointer_down', 200, 450); await pointer('pointer_move', 700, 450);
      const draft = editor.getOnlySelectedShape(); assert.notEqual(draft.id, saved.id);
      await act(async () => editor.cancel()); await tick();
      assert.equal(editor.getShape(draft.id), undefined); assert.deepEqual(editor.getShape(saved.id), saved);
    });
  });

  it('keeps click anchors and drawn paragraph widths exact inside rotated frames for every text alignment', async () => {
    await harness(async ({ editor, defaults, operations, pointer, cad, act, tick, tl }) => {
      const parent = tl.createShapeId('rotated-text-parent');
      await act(async () => editor.createShape({ id: parent, type: 'frame', x: -700, y: -700, rotation: .4,
        props: { w: 2500, h: 2500 } })); await tick();
      for (const align of ['start', 'middle', 'end']) for (const reverse of [false, true]) {
        const scale = reverse ? 10 : .1, zoom = reverse ? 2 : 1;
        await act(async () => {
          editor.complete(); editor.selectNone();
          editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS, scale } } });
          defaults.setNextDrawingTextStyle(editor, { pointSize: 36, textAlign: align });
          editor.setCamera({ x: 0, y: 0, z: zoom }); editor.setCurrentTool('text');
        }); await tick();
        await pointer('pointer_down', 200 * zoom, 150 * zoom); await pointer('pointer_up', 200 * zoom, 150 * zoom);
        const clickText = editor.getOnlySelectedShape(); assert.equal(clickText.parentId, parent);
        const bounds = editor.getShapePageBounds(clickText);
        near(align === 'start' ? bounds.minX : align === 'end' ? bounds.maxX : bounds.midX, 200);
        near(bounds.midY, 150); near(operations.textPointSize(clickText, cad.readCadSettings(editor)), 36);
        await act(async () => { editor.complete(); editor.selectNone(); editor.setCurrentTool('text'); }); await tick();
        const start = reverse ? 700 : 100, end = reverse ? 100 : 700;
        await pointer('pointer_down', start * zoom, 350 * zoom);
        await pointer('pointer_move', end * zoom, 350 * zoom); await pointer('pointer_up', end * zoom, 350 * zoom);
        const paragraph = editor.getOnlySelectedShape(); assert.equal(paragraph.parentId, parent);
        near(editor.getShapePageBounds(paragraph).minX, 100);
        near(editor.getShapePageBounds(paragraph).w, 600);
        near(operations.textPointSize(paragraph, cad.readCadSettings(editor)), 36);
      }
    });
  });

  it('keeps calibrated exact type anchored and gives its changes a single undo step', async () => {
    await harness(async ({ editor, add, select, operations, textStyle, cad, act, tick }) => {
      for (const scale of [.1, 1, 10, 1000]) {
        await act(async () => editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS, scale } } })); await tick();
        const id = await add(`physical-${scale}`, { scale: 1 / scale, textAlign: 'end' }, { rotation: .7 }); await select(id);
        const before = structuredClone(editor.getShape(id));
        const anchor = () => { const shape = editor.getShape(id), bounds = editor.getShapeGeometry(shape).bounds; return editor.getShapePageTransform(shape).applyToPoint({ x: bounds.w, y: bounds.h / 2 }); };
        const initial = anchor();
        await act(async () => assert.equal(textStyle.applySelectedDrawingTextStyle(editor, [id], { pointSize: 36 }), true)); await tick();
        near(operations.textPointSize(editor.getShape(id), cad.readCadSettings(editor)), 36);
        near(anchor().x, initial.x); near(anchor().y, initial.y);
        await act(async () => editor.undo()); await tick(); assert.deepEqual(editor.getShape(id), before);
        await act(async () => editor.redo()); await tick();
        near(operations.textPointSize(editor.getShape(id), cad.readCadSettings(editor)), 36);
      }
    });
  });

  it('refreshes physical point sizes without resizing artwork and rejects a stale calibration blur', async () => {
    await harness(async ({ editor, add, select, input, focus, blur, key, get, cad, operations, act, tick }) => {
      const id = await add('calibration'); await select(id);
      const before = structuredClone(editor.getShape(id));
      await focus('drawing-text-point-size'); await input('drawing-text-point-size', '36');
      await act(async () => {
        editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS, scale: 10 } } });
        get('drawing-text-point-size').blur();
      }); await tick();
      assert.deepEqual(editor.getShape(id), before);
      assert.equal((get('drawing-text-point-size') as HTMLInputElement).value, '180');
      assert.equal((get('drawing-text-docker-point-size') as HTMLInputElement).value, '180');
      await input('drawing-text-docker-point-size', '72'); await key('drawing-text-docker-point-size', 'Enter');
      near(operations.textPointSize(editor.getShape(id), cad.readCadSettings(editor)), 72);
      await act(async () => editor.undo()); await tick(); assert.deepEqual(editor.getShape(id), before);

      // A mixed selection remains visually blank after recalibration. Its
      // pending value must still be discarded, including a blur before render.
      const other = await add('mixed-calibration', { scale: 2 }); await select(id, other);
      await focus('drawing-text-point-size'); await input('drawing-text-point-size', '144');
      await act(async () => {
        editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS, scale: .1 } } });
        get('drawing-text-point-size').blur();
      }); await tick();
      near(editor.getShape(id).props.scale, 1); near(editor.getShape(other).props.scale, 2);
      assert.equal((get('drawing-text-point-size') as HTMLInputElement).value, '');
      await blur('drawing-text-point-size');
    });
  });

  it('keeps next text preferences physical across pages and leaves imported text untouched', async () => {
    await harness(async ({ editor, defaults, cad, operations, pointer, act, tick, tl, input, focus, get }) => {
      await act(async () => defaults.setNextDrawingTextStyle(editor, { pointSize: 72 })); await tick();
      for (const scale of [.1, 1, 10, 1000]) {
        await act(async () => {
          editor.complete(); editor.selectNone();
          editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS, scale } } });
          editor.setCurrentTool('text');
        }); await tick();
        near(defaults.getNextDrawingTextStyle(editor).pointSize, 72);
        await pointer('pointer_down', 200, 150); await pointer('pointer_up', 200, 150);
        near(operations.textPointSize(editor.getOnlySelectedShape(), cad.readCadSettings(editor)), 72);
      }
      await act(async () => { editor.complete(); editor.selectNone(); }); await tick();
      await focus('drawing-next-text-point-size'); await input('drawing-next-text-point-size', '48');
      await act(async () => {
        editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS, scale: 2 } } });
        get('drawing-next-text-point-size').blur();
      }); await tick();
      near(defaults.getNextDrawingTextStyle(editor).pointSize, 72);
      const imported = tl.createShapeId('physical-import');
      await act(async () => editor.createShape({ id: imported, type: 'text', props: { text: 'Import', size: 'm', scale: 3 } })); await tick();
      near(editor.getShape(imported).props.scale, 3);
      await act(async () => editor.setStyleForNextShapes(tl.DefaultSizeStyle, 'xl')); await tick();
      near(defaults.getNextDrawingTextStyle(editor).pointSize, 33);
    });
  });

  it('applies mixed typography to a text multi-selection from the docker and keeps next defaults separate', async () => {
    await harness(async ({ editor, add, select, input, key, get, host, choose, defaults, fonts, cad, operations, act, tick, tl, snapshot }) => {
      await act(async () => editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS, scale: 10 } } })); await tick();
      const a = await add('multi-a', { scale: .1 }), b = await add('multi-b', { scale: .2, font: 'serif' }); await select(a, b);
      const nextStyle = defaults.getNextDrawingTextStyle(editor), nextFont = fonts.getNextDrawingFont(editor);
      assert.equal((get('drawing-text-docker-point-size') as HTMLInputElement).value, '');
      assert.equal(host.querySelector('[data-testid="drawing-text-docker-content"]'), null);
      assert.equal(host.querySelector('[data-testid="drawing-next-text-docker-properties"]'), null);
      await input('drawing-text-docker-point-size', '72'); await key('drawing-text-docker-point-size', 'Enter');
      near(operations.textPointSize(editor.getShape(a), cad.readCadSettings(editor)), 72);
      near(operations.textPointSize(editor.getShape(b), cad.readCadSettings(editor)), 72);
      await act(async () => editor.undo()); await tick(); near(editor.getShape(a).props.scale, .1); near(editor.getShape(b).props.scale, .2);
      await choose('drawing-text-docker-font', 'mono');
      assert.equal(editor.getShape(a).props.font, 'mono'); assert.equal(editor.getShape(b).props.font, 'mono');
      assert.deepEqual(defaults.getNextDrawingTextStyle(editor), nextStyle); assert.equal(fonts.getNextDrawingFont(editor), nextFont);
      await act(async () => editor.updateShape({ id: b, type: 'text', isLocked: true })); await tick();
      assert.equal(get('drawing-text-docker-point-size').matches(':disabled'), true);
      const before = snapshot(); await input('drawing-text-docker-point-size', '144'); await key('drawing-text-docker-point-size', 'Enter');
      assert.equal(snapshot(), before);
      const rectangle = tl.createShapeId('mixed-rectangle');
      await act(async () => editor.createShape({ id: rectangle, type: 'geo' })); await tick(); await select(a, rectangle);
      assert.equal(host.querySelector('[data-testid="drawing-text-docker-point-size"]'), null);
      assert.equal(host.querySelector('[data-testid="drawing-next-text-docker-properties"]'), null);
    });
  });

  it('rolls back physical type overflow and content growth through rotated parents', async () => {
    await harness(async ({ editor, add, select, cad, operations, textStyle, act, tick, snapshot, tl }) => {
      await act(async () => editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS, scale: .001 } } })); await tick();
      const id = await add('large-type', { text: 'A', textAlign: 'start' }); await select(id);
      const before = snapshot();
      await act(async () => assert.equal(textStyle.applySelectedDrawingTextStyle(editor, [id], { pointSize: 3000 }), false)); await tick();
      assert.equal(snapshot(), before);
      await act(async () => assert.equal(operations.editDrawingText(editor, id, { text: 'A', font: 'sans', textAlign: 'start', autoSize: true, pointSize: 3000 }), false)); await tick();
      assert.equal(snapshot(), before);

      const group = tl.createShapeId('edge-parent');
      await act(async () => {
        editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: cad.DEFAULT_CAD_SETTINGS } });
        editor.run(() => {
          editor.createShape({ id: group, type: 'frame', props: { w: 16, h: 32 } });
          editor.updateShape({ id, type: 'text', parentId: group, x: 0, y: 0 });
          editor.updateShape({ id: group, type: 'frame', x: 999980, y: 100, rotation: Math.PI / 4 });
        });
      }); await tick();
      const original = structuredClone(editor.getShape(id)), edgeBefore = snapshot();
      assert.equal(original.parentId, group); assert.ok(editor.getShape(group));
      assert.ok(editor.getShapePageBounds(id).maxX < 1_000_000);
      await act(async () => assert.equal(textStyle.applySelectedDrawingTextStyle(editor, [id], { pointSize: 72 }), false)); await tick();
      assert.equal(snapshot(), edgeBefore);
      await act(async () => assert.equal(operations.editDrawingText(editor, id, { text: 'A'.repeat(100), font: 'sans', textAlign: 'start', autoSize: true }), false)); await tick();
      assert.equal(snapshot(), edgeBefore);
      // Native inline typing uses the same candidate geometry guard.
      await act(async () => editor.updateShape({ id, type: 'text', props: { text: 'A'.repeat(100) } })); await tick();
      assert.deepEqual(editor.getShape(id), original);
    });
  });

  it('allows repair of oversized saved text without increasing its previous extents', async () => {
    await harness(async ({ editor, add, select, operations, act, tick, snapshot }) => {
      const id = await add('old-oversized', { text: 'AAAA', scale: 200000, textAlign: 'start' }); await select(id);
      assert.ok(editor.getShapePageBounds(id).maxX > 1_000_000);
      const before = snapshot();
      await act(async () => assert.equal(operations.editDrawingText(editor, id, { text: 'AAAAAA', font: 'sans', textAlign: 'start', autoSize: true }), false)); await tick();
      assert.equal(snapshot(), before);
      await act(async () => assert.equal(operations.editDrawingText(editor, id, { text: 'A', font: 'sans', textAlign: 'start', autoSize: true }), true)); await tick();
      assert.equal(editor.getShape(id).props.text, 'A'); near(editor.getShape(id).props.scale, 200000);
      await act(async () => editor.undo()); await tick(); assert.equal(snapshot(), before);
      await act(async () => editor.redo()); await tick(); assert.equal(editor.getShape(id).props.text, 'A');
    });
  });

  it('rejects impossible next sizes and later native creation after recalibration without fallback or data loss', async () => {
    await harness(async ({ editor, add, defaults, pointer, cad, host, act, tick, snapshot }) => {
      const existing = await add('retained', { text: 'Keep me' });
      await act(async () => {
        editor.selectNone();
        editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS, scale: .001 } } });
      }); await tick();
      const messages: string[] = [];
      host.addEventListener('oms:canvas-upload', (event: any) => messages.push(event.detail.message));
      const initialDefaults = defaults.getNextDrawingTextStyle(editor), before = snapshot();
      await act(async () => assert.equal(defaults.setNextDrawingTextStyle(editor, { pointSize: 3000 }), false)); await tick();
      assert.deepEqual(defaults.getNextDrawingTextStyle(editor), initialDefaults); assert.equal(snapshot(), before);
      assert.match(messages.at(-1)!, /canvas limits/);

      await act(async () => {
        editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: cad.DEFAULT_CAD_SETTINGS } });
        assert.equal(defaults.setNextDrawingTextStyle(editor, { pointSize: 3000 }), true);
        editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS, scale: .001 } } });
        editor.setCurrentTool('text');
      }); await tick();
      const changedScale = snapshot();
      await pointer('pointer_down', 200, 150); await pointer('pointer_up', 200, 150);
      assert.equal(snapshot(), changedScale); assert.equal(editor.isIn('text.idle'), true);
      near(defaults.getNextDrawingTextStyle(editor).pointSize, 3000);
      await pointer('pointer_down', 100, 300); await pointer('pointer_move', 700, 300); await pointer('pointer_up', 700, 300);
      assert.equal(snapshot(), changedScale); assert.equal(editor.isIn('text.idle'), true);
      assert.equal(editor.getShape(existing).props.text, 'Keep me');
    });
  });

  it('rejects edge placement, unsafe paragraph completion and refused native creation while keeping one-step creation undo', async () => {
    await harness(async ({ editor, add, defaults, pointer, cad, act, tick, snapshot }) => {
      const existing = await add('keep-before-failure', { text: 'Retained' });
      await act(async () => {
        editor.selectNone(); editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: cad.DEFAULT_CAD_SETTINGS } });
        defaults.setNextDrawingTextStyle(editor, { pointSize: 72, textAlign: 'end' });
        editor.setCamera({ x: 1000099, y: 0, z: 1 }); editor.setCurrentTool('text');
      }); await tick();
      const before = snapshot();
      // The initial blank extends rightward from -999999; native right
      // alignment moves it left. Validate the final position, not the seed.
      await pointer('pointer_down', 100, 200); await pointer('pointer_up', 100, 200);
      assert.equal(snapshot(), before); assert.equal(editor.isIn('text.idle'), true);

      await act(async () => {
        defaults.setNextDrawingTextStyle(editor, { pointSize: 72, textAlign: 'start' });
        editor.setCamera({ x: -998900, y: 0, z: 1 }); editor.setCurrentTool('text');
      }); await tick();
      await pointer('pointer_down', 100, 200); await pointer('pointer_move', 2000, 200); await pointer('pointer_up', 2000, 200);
      assert.equal(snapshot(), before); assert.equal(editor.isIn('text.idle'), true);

      await act(async () => { editor.setCamera({ x: 0, y: 0, z: 1 }); editor.setCurrentTool('text'); }); await tick();
      const create = editor.createShape;
      editor.createShape = () => editor;
      try { await pointer('pointer_down', 100, 150); await pointer('pointer_up', 100, 150); }
      finally { editor.createShape = create; }
      assert.equal(snapshot(), before); assert.equal(editor.isIn('text.idle'), true);
      assert.equal(editor.getShape(existing).props.text, 'Retained');

      await pointer('pointer_down', 100, 150); await pointer('pointer_up', 100, 150);
      const created = editor.getOnlySelectedShape(); assert.equal(created.type, 'text');
      await act(async () => { editor.updateShape({ id: created.id, type: 'text', props: { text: 'Created and typed' } }); editor.complete(); }); await tick();
      const final = structuredClone(editor.getShape(created.id));
      await act(async () => editor.undo()); await tick();
      assert.equal(editor.getShape(created.id), undefined); assert.equal(editor.getShape(existing).props.text, 'Retained');
      await act(async () => editor.redo()); await tick(); assert.deepEqual(editor.getShape(created.id), final);
    });
  });
});
