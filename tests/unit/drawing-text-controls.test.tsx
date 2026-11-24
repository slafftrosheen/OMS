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
    await run({ editor, host, get, input, key, focus, blur, click, choose, select, add, snapshot, pointer, act, tick, tl, textStyle, defaults, spacing, fonts, operations, outlines: () => outlines, locale });
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
});
