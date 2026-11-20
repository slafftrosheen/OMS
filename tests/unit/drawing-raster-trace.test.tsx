import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

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
  const captures = new Map<number, Element>();
  win.Element.prototype.setPointerCapture = function (id: number) { captures.set(id, this); };
  win.Element.prototype.hasPointerCapture = function (id: number) { return captures.get(id) === this; };
  win.Element.prototype.releasePointerCapture = function (id: number) { if (captures.get(id) === this) captures.delete(id); };
  win.HTMLImageElement.prototype.decode = async () => {};
  const workers: any[] = [], bitmaps: any[] = [], contexts: any[] = [], fetches: string[] = [];
  let dimensions = { width: 64, height: 32 }, workerMode: 'auto' | 'hold' = 'auto', workerResult: any, workerError: string | undefined;
  values.fetch = async (url: string) => { fetches.push(url); return { ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) }; };
  values.createImageBitmap = async () => {
    const bitmap = { ...dimensions, closed: false, close() { this.closed = true; } }; bitmaps.push(bitmap); return bitmap;
  };
  values.Worker = class {
    onmessage: any; onerror: any; terminated = false; posted: any;
    constructor() { workers.push(this); }
    terminate() { this.terminated = true; }
    postMessage(value: unknown) { this.posted = value; if (workerMode === 'auto') queueMicrotask(() => this.onmessage?.({
      data: workerError ? { error: workerError } : { result: structuredClone(workerResult) },
    })); }
  };
  win.HTMLCanvasElement.prototype.getContext = function () {
    const { width, height } = this;
    const context = { imageSmoothingEnabled: false, imageSmoothingQuality: 'low', drawImage() {},
      getImageData() { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; } };
    contexts.push(context); return context;
  };
  win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,iVBORw0KGgoAAAAA';
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client');
  const tl = await import('@tldraw/tldraw');
  const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
  const { RasterTrace } = await import('../../src/lib/components/canvas/RasterTrace');
  const review = await import('../../src/lib/components/canvas/RasterTraceReview');
  const source = await import('../../src/lib/components/canvas/cad-trace-source');
  const cad = await import('../../src/lib/components/canvas/cad-settings');
  const plans = await import('../../src/lib/components/canvas/cad-plans');
  const vector = await import('../../src/lib/components/canvas/cad-vector');
  const curves = await import('../../src/lib/components/canvas/cad-curves');
  const { CadBezierShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadBezierShape');
  const toolkitFiles = await import('../../src/lib/components/canvas/toolkit-media-import');
  const orderFiles = await import('../../src/lib/components/canvas/order-file-documents');
  // Use the actual attachment factories and native box geometry without
  // mounting PDF/Svelte card preview components in this raster-specific test.
  class AttachmentCard extends tl.BaseBoxShapeUtil<any> {
    static override type = 'document';
    static override props = { w: tl.T.number, h: tl.T.number, title: tl.T.string, content: tl.T.string, status: tl.T.string,
      kind: tl.T.string, url: tl.T.string, mime: tl.T.string, fileId: tl.T.string, fit: tl.T.string, opacity: tl.T.number, pdfPage: tl.T.number, previewImage: tl.T.string };
    getDefaultProps() { return { w: 240, h: 300, title: '', content: '', status: 'ready', kind: 'image', url: '', mime: '', fileId: '', fit: 'contain', opacity: 100, pdfPage: 1, previewImage: '' }; }
    component() { return null; } indicator() { return null; }
  }
  const { locale } = await import('svelte-i18n'); locale.set('en');
  const host = document.createElement('div'); host.tabIndex = 0; document.body.append(host);
  const shapeUtils = [...tl.defaultShapeUtils, CadBezierShapeUtil, AttachmentCard];
  const editor = new tl.Editor({ store: tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }), shapeUtils,
    bindingUtils: tl.defaultBindingUtils, tools: [...tl.defaultTools, ...tl.defaultShapeTools], getContainer: () => host, initialState: 'select' });
  editor.updateViewportScreenBounds(new tl.Box(0, 0, 800, 600)); editor.updateInstanceState({ isFocused: true });
  editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: cad.DEFAULT_CAD_SETTINGS } });
  const root = createRoot(host);
  const documentFixture = () => ({ width: 64, height: 32, warnings: ['trace-approximation'], paths: [{
    contours: [{ closed: true, nodes: [
      { ...curves.nodeAt({ x: 10, y: 10 }), outX: 10, outY: -8 },
      { ...curves.nodeAt({ x: 50, y: 10 }), inX: -10, inY: -8 },
      curves.nodeAt({ x: 50, y: 25 }), curves.nodeAt({ x: 10, y: 25 }),
    ] }], fillRule: 'evenodd', paint: { ...vector.VECTOR_DEFAULT_PAINT, fill: '#16324f', fillOpacity: .4, stroke: 'none', dash: [] },
  }] });
  const centerlineFixture = () => {
    const doc = documentFixture(); doc.warnings = ['trace-centerline-approximation'];
    doc.paths[0].paint = { ...doc.paths[0].paint, fill: 'none', stroke: '#16324f', strokeOpacity: .4, strokeWidth: 1, lineCap: 'round', lineJoin: 'round' };
    doc.paths.push(structuredClone(doc.paths[0]));
    doc.paths[0].contours[0] = { closed: false, nodes: doc.paths[0].contours[0].nodes.slice(0, 2) };
    return doc;
  };
  workerResult = documentFixture();
  function Scene() {
    const state = tl.useValue('trace test props', () => ({ settings: cad.readCadSettings(editor), revision: plans.cadRevision(editor), disabled: editor.getInstanceState().isReadonly }), []);
    return <RasterTrace {...state} />;
  }
  const render = async (element: any = <Scene />) => { await act(async () => root.render(<EditorContext.Provider value={editor}>{element}</EditorContext.Provider>)); };
  await render();
  const tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  const get = (id: string) => { const element = host.querySelector(`[data-testid="${id}"]`) as HTMLElement; assert.ok(element, id); return element; };
  const click = async (id: string) => { await act(async () => get(id).click()); await tick(); };
  const select = async (id: string, value: string) => { await act(async () => { const element = get(id) as HTMLSelectElement;
    element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })); }); await tick(); };
  const input = async (id: string, value: string) => { await act(async () => { const element = get(id) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true })); }); await tick(); };
  const upload = async (name = 'logo.png') => { await act(async () => { const element = get('trace-source-file');
    Object.defineProperty(element, 'files', { configurable: true, value: [new win.File(['png'], name, { type: 'image/png' })] });
    element.dispatchEvent(new Event('change', { bubbles: true })); }); await tick(); };
  const snapshot = () => structuredClone(editor.store.getStoreSnapshot('document'));
  try { await run({ editor, tl, host, get, click, select, input, upload, act, tick, render, snapshot, cad, plans, vector, curves, source, review, documentFixture, centerlineFixture,
    locale, workers, bitmaps, contexts, fetches, toolkitFiles, orderFiles, dimensions: (width: number, height: number) => { dimensions = { width, height }; },
    hold: () => { workerMode = 'hold'; }, result: (value: any) => { workerResult = value; workerError = undefined; }, error: (code: string) => { workerError = code; },
    release: () => workers.at(-1)?.onmessage?.({ data: workerError ? { error: workerError } : { result: structuredClone(workerResult) } }) }); }
  finally {
    await act(async () => root.unmount()); editor.dispose(); host.remove();
    channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
}

describe('raster tracing source preparation and review', () => {
  it('exposes detail, corner and resolution controls without writing a document and rejects invalid drafts', async () => harness(async h => {
    const { get, input, click, select, upload, workers, snapshot, host } = h, before = snapshot();
    assert.equal(get('trace-resolution').value, '2048'); assert.equal(get('trace-preserve-corners').checked, true);
    assert.equal(get('trace-smoothing').value, '0.75'); assert.equal(get('trace-noise').value, '0');
    assert.equal(get('trace-preset').value, 'logo'); assert.equal(get('trace-background').value, 'all');
    assert.equal(get('trace-method').value, 'outline');
    assert.equal(get('trace-group-result').checked, true); assert.equal(host.querySelector('[data-testid="trace-remove-white"]'), null);
    await upload(); await input('trace-smoothing', '');
    assert.equal(get('trace-smoothing').getAttribute('aria-invalid'), 'true'); assert.equal(get('trace-prepare').matches(':disabled'), true);
    await click('trace-prepare'); assert.equal(workers.length, 0);
    await input('trace-smoothing', '.25'); await input('trace-noise', '3'); await click('trace-preserve-corners');
    await select('trace-resolution', '1024'); await select('trace-mode', 'color');
    assert.ok(host.querySelector('[data-testid="trace-colors"]')); assert.equal(host.querySelector('[data-testid="trace-threshold"]'), null);
    await input('trace-colors', '12'); assert.deepEqual(snapshot(), before);
    await click('trace-prepare'); assert.equal(workers[0].posted.options.smoothing, .25); assert.equal(workers[0].posted.options.noise, 3);
    assert.equal(workers[0].posted.options.preserveCorners, false); assert.equal(workers[0].posted.options.colors, 12); assert.equal(workers[0].terminated, true);
    assert.deepEqual(snapshot(), before);
  }));

  it('uses profiles as a starting point while preserving background, resolution and output choices', async () => harness(async h => {
    const { upload, select, input, click, get, workers, snapshot } = h, before = snapshot();
    await upload(); await select('trace-background', 'border'); await select('trace-resolution', '1024');
    await input('trace-width', '75'); await click('trace-group-result'); await select('trace-preset', 'lineart');
    assert.equal(get('trace-mode').value, 'mono'); assert.equal(get('trace-threshold').value, '160'); assert.equal(get('trace-smoothing').value, '0.35');
    assert.equal(get('trace-background').value, 'border'); assert.equal(get('trace-resolution').value, '1024');
    assert.equal(get('trace-width').value, '75'); assert.equal(get('trace-group-result').checked, false);
    await input('trace-smoothing', '.5'); assert.equal(get('trace-preset').value, 'custom');
    await select('trace-preset', 'color'); assert.equal(get('trace-colors').value, '8'); assert.equal(get('trace-background').value, 'border');
    await click('trace-prepare'); assert.equal(workers.at(-1).posted.options.background, 'border');
    assert.equal(workers.at(-1).posted.options.mode, 'color'); assert.deepEqual(snapshot(), before);
  }));

  it('keeps outline profiles compatible and preserves source and output choices across centerline profiles and methods', async () => harness(async h => {
    const { upload, select, input, click, get, host, workers, snapshot, result, centerlineFixture } = h, before = snapshot();
    await upload('lines.png'); await select('trace-background', 'border'); await select('trace-resolution', '1024');
    await input('trace-width', '75'); await click('trace-group-result'); await select('trace-preset', 'lineart');
    assert.equal(get('trace-method').value, 'outline'); assert.match(get('trace-method-help').textContent, /filled outlines/);
    assert.deepEqual([...get('trace-preset').options].map((o: any) => o.value), ['logo', 'lineart', 'color', 'custom']);
    await select('trace-method', 'centerline');
    assert.equal(get('trace-preset').value, 'technical'); assert.equal(get('trace-threshold').value, '160');
    assert.equal(get('trace-smoothing').value, '0.35'); assert.equal(get('trace-preserve-corners').checked, true);
    assert.equal(get('trace-stroke-width').value, '0.25'); assert.match(get('trace-stroke-width').parentElement.textContent, /\(mm\)/);
    assert.equal(host.querySelector('[data-testid="trace-mode"]'), null); assert.equal(host.querySelector('[data-testid="trace-colors"]'), null);
    assert.equal(host.querySelector('[data-testid="trace-background"]'), null);
    assert.deepEqual([...get('trace-preset').options].map((o: any) => o.value), ['technical', 'drawing', 'custom']);
    await input('trace-stroke-width', '.6'); assert.equal(get('trace-preset').value, 'technical');
    await select('trace-preset', 'drawing'); assert.equal(get('trace-threshold').value, '128');
    assert.equal(get('trace-preserve-corners').checked, false); assert.equal(get('trace-smoothing').value, '0.75');
    assert.equal(get('trace-stroke-width').value, '.6'); await input('trace-noise', '3'); assert.equal(get('trace-preset').value, 'custom');
    assert.match(get('trace-noise').parentElement.textContent, /disconnected components/);
    await select('trace-method', 'outline'); assert.equal(get('trace-preset').value, 'logo');
    assert.equal(get('trace-background').value, 'border'); assert.equal(get('trace-resolution').value, '1024');
    assert.equal(get('trace-width').value, '75'); assert.equal(get('trace-group-result').checked, false);
    assert.match(get('trace-source-summary').textContent, /lines\.png/);
    await select('trace-method', 'centerline'); assert.equal(get('trace-stroke-width').value, '.6');
    result(centerlineFixture()); await click('trace-prepare');
    assert.equal(workers.at(-1).posted.options.method, 'centerline'); assert.equal(workers.at(-1).posted.options.mode, 'mono');
    assert.equal(workers.at(-1).posted.options.background, 'border');
    assert.ok(!('strokeWidth' in workers.at(-1).posted.options)); assert.ok(!('strokeWidthMm' in workers.at(-1).posted.options));
    assert.deepEqual(snapshot(), before);
  }));

  it('validates physical centerline width independently of document units, profiles and the worker', async () => harness(async h => {
    const { upload, select, input, click, get, workers, editor, act, cad, result, centerlineFixture } = h;
    await upload(); await select('trace-method', 'centerline'); result(centerlineFixture());
    for (const invalid of ['', '0', '.0009', '-1', '1000.01']) {
      await input('trace-stroke-width', invalid); assert.equal(get('trace-stroke-width').getAttribute('aria-invalid'), 'true');
      assert.equal(get('trace-prepare').matches(':disabled'), true); await click('trace-prepare'); assert.equal(workers.length, 0);
    }
    await act(async () => editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS, unit: 'in', scale: .001 } } }));
    await input('trace-stroke-width', '1000'); assert.equal(get('trace-prepare').matches(':disabled'), true);
    await input('trace-stroke-width', '.25'); assert.equal(get('trace-stroke-width').getAttribute('aria-invalid'), 'false');
    assert.match(get('trace-stroke-width').parentElement.textContent, /\(mm\)/);
    await click('trace-prepare'); await click('vector-apply');
    const group = editor.getOnlySelectedShape(), child = editor.getShape(editor.getSortedChildIdsForParent(group.id)[0]);
    near(child.meta.omsVectorPaint.strokeWidth, .25 / cad.cadMmPerPixel({ ...cad.DEFAULT_CAD_SETTINGS, unit: 'in', scale: .001 }));
    assert.equal(workers.length, 1);
  }));

  it('reviews real open curves and closed loops at inspection width and applies editable strokes as one undoable group', async () => harness(async h => {
    const { upload, select, input, click, get, host, editor, act, snapshot, cad, result, centerlineFixture } = h;
    const doc = centerlineFixture(), original = structuredClone(doc); result(doc);
    await act(async () => editor.updateInstanceState({ opacityForNextShape: .2 }));
    const before = snapshot(); await upload(); await select('trace-method', 'centerline'); await input('trace-stroke-width', '.4');
    await click('trace-prepare');
    assert.equal(get('trace-source-preview').getAttribute('viewBox'), '0 0 64 32');
    assert.equal(get('trace-result-preview').getAttribute('viewBox'), '0 0 64 32');
    assert.equal(get('trace-object-count').textContent, '2'); assert.equal(get('trace-color-count').textContent, '1');
    assert.equal(get('trace-open-count').textContent, '1'); assert.equal(get('trace-closed-count').textContent, '1');
    assert.equal(get('trace-node-count').textContent, '6'); assert.equal(get('trace-curve-count').textContent, '2');
    assert.equal(get('trace-line-count').textContent, '3'); assert.equal(get('trace-output-stroke-width').textContent, '0.4');
    assert.match(get('trace-result-grouping').textContent, /editable strokes/); assert.match(get('trace-centerline-inspection').textContent, /fixed inspection width/);
    assert.equal(host.querySelector('[data-testid="trace-review-ack"]'), null);
    for (const mode of ['side', 'overlay', 'outline']) {
      await select('trace-preview-mode', mode);
      const paths = [...get('trace-result-preview').querySelectorAll('[data-testid="trace-centerline-path"]')]; assert.equal(paths.length, 2);
      assert.ok(!paths[0].getAttribute('d').includes('Z')); assert.ok(paths[1].getAttribute('d').includes('Z'));
      assert.ok(paths.every((p: any) => p.getAttribute('fill') === 'none' && p.getAttribute('stroke-width') === '1.5' && p.getAttribute('vector-effect') === 'non-scaling-stroke'));
    }
    assert.deepEqual(doc, original); assert.deepEqual(snapshot(), before);
    await click('vector-apply'); const group = editor.getOnlySelectedShape(); assert.equal(group.type, 'group'); assert.equal(group.opacity, 1);
    const children = editor.getSortedChildIdsForParent(group.id).map((id: any) => editor.getShape(id));
    assert.deepEqual(children.map((s: any) => s.props.contours[0].closed).sort(), [false, true]);
    for (const child of children) {
      assert.equal(child.type, 'cad-bezier'); assert.equal(child.opacity, 1); assert.equal(child.meta.omsVectorPaint.fill, 'none');
      near(child.meta.omsVectorPaint.strokeWidth, .4 / cad.cadMmPerPixel(cad.DEFAULT_CAD_SETTINGS));
      near(child.meta.omsVectorPaint.strokeOpacity, .4); assert.equal(child.meta.omsVectorPaint.lineCap, 'round'); assert.equal(child.meta.omsVectorPaint.lineJoin, 'round');
    }
    const after = snapshot(); await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
    await act(async () => editor.redo()); assert.deepEqual(snapshot(), after);
  }));

  it('applies a horizontal zero-height centerline as an open editable stroke without adding a closing edge', async () => harness(async h => {
    const { centerlineFixture, curves, result, upload, select, click, get, editor, snapshot, act, cad } = h;
    const doc = centerlineFixture(); doc.paths = [doc.paths[0]];
    doc.paths[0].contours = [{ closed: false, nodes: [curves.nodeAt({ x: 5, y: 16 }), curves.nodeAt({ x: 59, y: 16 })] }]; result(doc);
    const before = snapshot(); await upload(); await select('trace-method', 'centerline'); await click('trace-group-result'); await click('trace-prepare');
    assert.equal(get('trace-open-count').textContent, '1'); assert.equal(get('trace-closed-count').textContent, '0');
    assert.equal(get('trace-curve-count').textContent, '0'); assert.equal(get('trace-line-count').textContent, '1');
    assert.ok(!get('trace-result-preview').querySelector('path').getAttribute('d').includes('Z'));
    await click('vector-apply'); const shape = editor.getOnlySelectedShape();
    assert.equal(shape.type, 'cad-bezier'); assert.equal(shape.props.contours[0].closed, false);
    assert.equal(shape.props.contours[0].nodes.length, 2); assert.equal(editor.getShapeGeometry(shape).bounds.h, 0);
    near(shape.meta.omsVectorPaint.strokeWidth, .25 / cad.cadMmPerPixel(cad.DEFAULT_CAD_SETTINGS));
    await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
  }));

  it('keeps the captured method and applied width on stale reviews and preserves inspection state while retracing', async () => harness(async h => {
    const { centerlineFixture, documentFixture, result, upload, select, input, click, get, host, snapshot, hold, release, act, tick } = h;
    result(centerlineFixture()); const before = snapshot(); await upload(); await select('trace-method', 'centerline'); await click('trace-prepare');
    await select('trace-preview-mode', 'outline'); await select('trace-preview-zoom', '4'); await input('trace-source-opacity', '35');
    await input('trace-stroke-width', '.5'); assert.equal(get('vector-apply').matches(':disabled'), true);
    assert.equal(get('trace-output-stroke-width').textContent, '0.25'); await click('vector-apply'); assert.deepEqual(snapshot(), before);
    hold(); await click('trace-prepare'); assert.equal(get('vector-apply').matches(':disabled'), true);
    await act(async () => release()); await tick();
    assert.equal(get('trace-output-stroke-width').textContent, '0.5'); assert.equal(get('trace-preview-zoom').value, '4');
    assert.equal(get('trace-source-opacity').value, '35'); assert.equal(get('trace-preview-mode').value, 'outline');
    await select('trace-method', 'outline'); assert.equal(get('vector-apply').matches(':disabled'), true);
    assert.match(get('trace-review-method').textContent, /Centerline/); assert.ok(get('trace-centerline-inspection'));
    assert.equal(get('trace-output-stroke-width').textContent, '0.5');
    result(documentFixture()); await click('trace-prepare'); await act(async () => release()); await tick();
    assert.match(get('trace-review-method').textContent, /Filled outlines/);
    assert.equal(host.querySelector('[data-testid="trace-centerline-inspection"]'), null); assert.equal(host.querySelector('[data-testid="trace-output-stroke-width"]'), null);
    assert.equal(get('trace-preview-zoom').value, '4'); assert.deepEqual(snapshot(), before);
  }));

  it('requires acknowledgement for omitted centerline dots while approximation and component filtering stay informational', async () => harness(async h => {
    const { centerlineFixture, result, error, upload, select, click, get, host, snapshot } = h, doc = centerlineFixture(), before = snapshot();
    doc.warnings.push('trace-noise'); result(doc); await upload(); await select('trace-method', 'centerline'); await click('trace-prepare');
    assert.equal(get('vector-apply').matches(':disabled'), false); assert.equal(host.querySelector('[data-testid="trace-review-ack"]'), null);
    assert.match(host.textContent, /Disconnected components shorter/);
    doc.warnings.push('trace-centerline-dots'); result(doc); await click('trace-prepare');
    assert.equal(get('vector-apply').matches(':disabled'), true); assert.match(host.textContent, /Isolated dots were omitted/);
    await click('trace-review-ack'); assert.equal(get('vector-apply').matches(':disabled'), false);
    await click('trace-prepare'); assert.equal(get('trace-review-ack').checked, false); assert.equal(get('vector-apply').matches(':disabled'), true);
    error('trace-centerline-empty'); await click('trace-prepare'); assert.match(get('trace-status').textContent, /No centerline paths were found/);
    assert.deepEqual(snapshot(), before);
  }));

  it('aligns bitmap and real curve geometry in the same pixel frame and applies one undoable result', async () => harness(async h => {
    const { upload, click, get, select, host, snapshot, editor, act, curves, documentFixture } = h, before = snapshot();
    await upload(); await click('trace-prepare');
    assert.equal(get('trace-source-preview').getAttribute('viewBox'), '0 0 64 32');
    assert.equal(get('trace-result-preview').getAttribute('viewBox'), '0 0 64 32');
    assert.equal(get('trace-result-preview').querySelector('path[fill="#16324f"]').getAttribute('d'), curves.curvePathData(documentFixture().paths[0].contours));
    assert.equal(get('trace-curve-count').textContent, '1'); assert.equal(get('trace-line-count').textContent, '3');
    assert.equal(get('trace-object-count').textContent, '1'); assert.equal(get('trace-color-count').textContent, '1');
    assert.equal(get('trace-node-count').textContent, '4'); assert.equal(host.querySelector('[data-testid="trace-review-ack"]'), null);
    assert.equal(get('vector-apply').matches(':disabled'), false); assert.deepEqual(snapshot(), before);
    await select('trace-preview-mode', 'outline'); assert.equal(host.querySelector('[data-testid="trace-source-preview"]'), null);
    assert.ok(get('trace-result-preview').querySelector('image')); assert.equal(get('trace-result-preview').querySelector('path').getAttribute('fill'), 'none');
    await select('trace-preview-mode', 'overlay'); assert.equal(get('trace-result-preview').querySelector('g').getAttribute('opacity'), '0.55');
    await click('vector-apply'); const after = snapshot(); assert.equal(editor.getCurrentPageShapeIds().size, 1);
    assert.equal(editor.getOnlySelectedShape().type, 'cad-bezier'); assert.equal(host.querySelector('[data-testid="vector-review"]'), null);
    await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
    await act(async () => editor.redo()); assert.deepEqual(snapshot(), after);
  }));

  it('keeps the inspected view, zoom, opacity and center through a new trace preview', async () => harness(async h => {
    const { upload, click, get, select, input, hold, release, act, tick, workers, snapshot } = h, before = snapshot();
    await upload(); await click('trace-prepare'); await select('trace-preview-mode', 'outline'); await select('trace-preview-zoom', '4');
    await input('trace-source-opacity', '35');
    const viewport = get('trace-result-viewport');
    Object.defineProperties(viewport, { clientWidth: { configurable: true, value: 200 }, clientHeight: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 800 }, scrollHeight: { configurable: true, value: 800 } });
    await act(async () => { viewport.scrollLeft = 130; viewport.scrollTop = 210; viewport.dispatchEvent(new Event('scroll')); });
    await input('trace-smoothing', '.5'); hold(); await click('trace-prepare');
    assert.equal(get('vector-apply').matches(':disabled'), true); assert.equal(get('trace-result-viewport'), viewport);
    await act(async () => release()); await tick();
    assert.equal(workers.length, 2); assert.equal(get('trace-preview-mode').value, 'outline'); assert.equal(get('trace-preview-zoom').value, '4');
    assert.equal(get('trace-source-opacity').value, '35'); assert.equal(get('trace-result-viewport'), viewport);
    near(viewport.scrollLeft, 130); near(viewport.scrollTop, 210); assert.deepEqual(snapshot(), before);
  }));

  it('centers the full uploaded image frame and creates editable color groups in one undo step', async () => harness(async h => {
    const { editor, source, cad, documentFixture, curves, snapshot, upload, click, get, result, dimensions, act } = h;
    const doc = documentFixture(); doc.width = 128;
    const second = structuredClone(doc.paths[0]); second.paint.fill = '#cc2255'; second.paint.fillOpacity = .8;
    second.contours = curves.mapContours(second.contours, (p: any) => ({ x: p.x + 64, y: p.y })); doc.paths.push(second);
    dimensions(128, 32); result(doc);
    await act(async () => editor.updateInstanceState({ opacityForNextShape: .25 }));
    const before = snapshot(), center = editor.getViewportPageBounds().center, scale = 100 / cad.cadMmPerPixel(cad.DEFAULT_CAD_SETTINGS) / doc.width;
    const plan = source.prepareRasterTraceFilePlan(editor, cad.DEFAULT_CAD_SETTINGS, doc, 100, 'logo.png', { originalWidth: 128, originalHeight: 32 });
    near(plan.contours[0].nodes[0].x, center.x + (10 - 64) * scale);
    near(plan.contours[0].nodes[0].y, center.y + (10 - 16) * scale);
    assert.deepEqual(snapshot(), before);
    await upload(); await click('trace-prepare');
    assert.equal(get('trace-object-count').textContent, '2'); assert.equal(get('trace-color-count').textContent, '2');
    assert.match(get('trace-result-grouping').textContent, /one group/); await click('vector-apply');
    const group = editor.getOnlySelectedShape(); assert.equal(group.type, 'group'); assert.equal(group.opacity, 1);
    assert.match(group.meta.omsObjectName, /logo\.png/);
    const children = editor.getSortedChildIdsForParent(group.id).map((id: any) => editor.getShape(id));
    assert.equal(children.length, 2); assert.ok(children.every((shape: any) => shape.type === 'cad-bezier' && shape.opacity === 1));
    assert.deepEqual(children.map((shape: any) => shape.meta.omsVectorPaint.fill).sort(), ['#16324f', '#cc2255']);
    assert.deepEqual(children.map((shape: any) => shape.meta.omsVectorPaint.fillOpacity).sort(), [.4, .8]);
    const after = snapshot(); await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
    await act(async () => editor.redo()); assert.deepEqual(snapshot(), after);
  }));

  it('preserves thin and non-integral original aspect ratios for file and attachment plans without changing working pixels or curves', async () => harness(async h => {
    const { editor, act, toolkitFiles, source, cad, curves, documentFixture, snapshot } = h;
    await act(async () => {
      toolkitFiles.placeToolkitAsset(editor, '00000000-0000-4000-8000-000000000011', {
        id: '00000000-0000-4000-8000-000000000022', fileName: 'thin.png', mime: 'image/png', bytes: 100,
      }, { x: 120, y: 80 });
      editor.select(editor.getCurrentPageShapesSorted().find((shape: any) => shape.type === 'document').id);
    });
    const before = snapshot(), center = editor.getViewportPageBounds().center, cardBounds = editor.getShapePageBounds(editor.getOnlySelectedShape());
    for (const [originalWidth, originalHeight, width, height] of [[50000, 2, 2048, 1], [4096, 997, 2048, 499]]) {
      const doc = documentFixture(); doc.width = width; doc.height = height;
      doc.paths[0].contours = curves.mapContours(doc.paths[0].contours, (p: any) => ({ x: p.x * width / 64, y: p.y * height / 32 }));
      const originalDoc = structuredClone(doc), pixels = new Uint8ClampedArray(width * height * 4).fill(173), originalPixels = pixels.slice();
      const decoded = { originalWidth, originalHeight, image: { width, height, data: pixels } };
      const fullWidth = 80 / cad.cadMmPerPixel(cad.DEFAULT_CAD_SETTINGS), fullHeight = fullWidth * originalHeight / originalWidth;
      const file = source.prepareRasterTraceFilePlan(editor, cad.DEFAULT_CAD_SETTINGS, doc, 80, 'thin.png', decoded);
      const attached = source.prepareAttachedRasterTracePlan(editor, cad.DEFAULT_CAD_SETTINGS, doc, 80, decoded);
      for (const [plan, origin] of [[file, { x: center.x - fullWidth / 2, y: center.y - fullHeight / 2 }],
        [attached, { x: cardBounds.maxX + 24, y: cardBounds.minY }]] as any) {
        const actual = plan.contours[0].nodes[0], input = doc.paths[0].contours[0].nodes[0];
        near(actual.x, origin.x + input.x / width * fullWidth); near(actual.y, origin.y + input.y / height * fullHeight);
        near(actual.outX, input.outX / width * fullWidth); near(actual.outY, input.outY / height * fullHeight);
        const last = plan.contours[0].nodes[1], inputLast = doc.paths[0].contours[0].nodes[1];
        near(last.inX, inputLast.inX / width * fullWidth); near(last.inY, inputLast.inY / height * fullHeight);
      }
      assert.deepEqual(doc, originalDoc); assert.deepEqual(pixels, originalPixels); assert.deepEqual(snapshot(), before);
    }
    for (const original of [{ originalWidth: 0, originalHeight: 1 }, { originalWidth: 1.5, originalHeight: 1 },
      { originalWidth: Infinity, originalHeight: 1 }, { originalWidth: 10000, originalHeight: 10000 }]) {
      assert.throws(() => source.prepareRasterTraceFilePlan(editor, cad.DEFAULT_CAD_SETTINGS, documentFixture(), 80, 'invalid.png', original), /geometry/);
      assert.throws(() => source.prepareAttachedRasterTracePlan(editor, cad.DEFAULT_CAD_SETTINGS, documentFixture(), 80, original), /geometry/);
    }
  }));

  for (const context of ['idea', 'order'] as const) it(`traces an actual ${context} attachment card beside its source without applying card crop or opacity`, async () => harness(async h => {
    const { editor, tl, act, toolkitFiles, orderFiles, source, cad, documentFixture, upload, click, input, get, host, snapshot, fetches } = h;
    const fileId = '00000000-0000-4000-8000-000000000022', boardId = '00000000-0000-4000-8000-000000000011';
    let frame: any;
    await act(async () => {
      if (context === 'idea') toolkitFiles.placeToolkitAsset(editor, boardId, { id: fileId, fileName: 'attached-logo.png', mime: 'image/png', bytes: 100 }, { x: 120, y: 80 });
      else {
        const frameId = tl.createShapeId('trace-visuals');
        editor.createShape({ id: frameId, type: 'frame', x: 100, y: 80, rotation: .2, opacity: .5,
          props: { w: 800, h: 600, name: 'Visuals (PDF/Rasters)' }, meta: { omsFilePocket: 'visuals' } });
        orderFiles.addOrderFileDocument(editor, { id: fileId, originalName: 'attached-logo.png', mimeType: 'image/png', url: `/api/files/${fileId}/download` }, { x: 150, y: 300 }, 'visuals');
        frame = editor.getShape(frameId);
      }
      const card = editor.getCurrentPageShapesSorted().find((shape: any) => shape.type === 'document');
      editor.updateShape({ id: card.id, type: 'document', opacity: .6, props: { fit: 'cover', opacity: 30, previewImage: 'https://example.com/thumbnail.png' } });
      editor.select(card.id); editor.updateInstanceState({ opacityForNextShape: .25 }); editor.mark('attachment-fixture');
    });
    const card = editor.getOnlySelectedShape(), original = structuredClone(card), before = snapshot();
    if (frame) { assert.equal(card.parentId, frame.id); assert.ok(editor.getShapeMask(card.id)); }
    if (context === 'idea') await upload('retained-file.png');
    assert.match(get('trace-use-selected').textContent, /Trace attached image/); await click('trace-use-selected');
    assert.match(get('trace-source-summary').textContent, /attached-logo\.png/);
    assert.equal(host.querySelector('[data-testid="trace-replace"]'), null); assert.ok(get('trace-width'));
    if (context === 'idea') {
      await click('trace-use-file'); assert.match(get('trace-source-summary').textContent, /retained-file\.png/);
      await click('trace-use-selected');
    }
    await input('trace-width', '80');
    const bounds = editor.getShapePageBounds(card), doc = documentFixture(), plan = source.prepareAttachedRasterTracePlan(editor, cad.DEFAULT_CAD_SETTINGS, doc, 80, { originalWidth: 64, originalHeight: 32 });
    const scale = 80 / cad.cadMmPerPixel(cad.DEFAULT_CAD_SETTINGS) / doc.width;
    assert.deepEqual(plan.removeIds, []); assert.deepEqual(plan.sourceIds, [card.id]); assert.equal(plan.placement, undefined);
    near(plan.contours[0].nodes[0].x, bounds.maxX + 24 + 10 * scale); near(plan.contours[0].nodes[0].y, bounds.minY + 10 * scale);
    near(plan.shapes[0].meta.omsVectorPaint.fillOpacity, .4); assert.equal(plan.shapes[0].opacity, 1);
    assert.deepEqual(snapshot(), before); await click('trace-prepare'); assert.equal(fetches.at(-1), card.props.url);
    assert.ok(!fetches.includes(card.props.previewImage), 'the trace must fetch the original attachment, not a preview');
    assert.equal(get('trace-original-size').textContent, '64 × 32 px'); assert.deepEqual(snapshot(), before);
    await click('vector-apply'); const resultShape = editor.getOnlySelectedShape();
    assert.equal(resultShape.type, 'cad-bezier'); assert.equal(resultShape.parentId, editor.getCurrentPageId());
    assert.equal(resultShape.opacity, 1); near(resultShape.meta.omsVectorPaint.fillOpacity, .4);
    assert.deepEqual(editor.getShape(card.id), original); if (frame) assert.deepEqual(editor.getShape(frame.id), frame);
    assert.equal(get('trace-use-selected').matches(':disabled'), true);
    assert.equal(get('trace-prepare').matches(':disabled'), context !== 'idea');
    if (context === 'idea') assert.match(get('trace-source-summary').textContent, /retained-file\.png/);
    await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
    await act(async () => { editor.select(card.id); editor.updateShape({ id: frame?.id ?? card.id, type: frame ? 'frame' : 'document', isLocked: true }); });
    assert.throws(() => source.selectedAttachedRasterTraceSource(editor), /locked/);
    assert.equal(get('trace-use-selected').matches(':disabled'), true);
  }));

  for (const context of ['idea', 'order'] as const) it(`creates centerlines from the original ${context} attachment at physical width while keeping its card and file link`, async () => harness(async h => {
    const { editor, tl, act, toolkitFiles, orderFiles, centerlineFixture, curves, result, dimensions, select, click, input, get, host, snapshot, fetches, cad } = h;
    const fileId = '00000000-0000-4000-8000-000000000022', boardId = '00000000-0000-4000-8000-000000000011';
    await act(async () => {
      if (context === 'idea') toolkitFiles.placeToolkitAsset(editor, boardId, { id: fileId, fileName: 'technical.png', mime: 'image/png', bytes: 100 }, { x: 120, y: 80 });
      else {
        editor.createShape({ id: tl.createShapeId('centerline-visuals'), type: 'frame', x: 100, y: 80, rotation: .2, opacity: .5,
          props: { w: 800, h: 600, name: 'Visuals (PDF/Rasters)' }, meta: { omsFilePocket: 'visuals' } });
        orderFiles.addOrderFileDocument(editor, { id: fileId, originalName: 'technical.png', mimeType: 'image/png', url: `/api/files/${fileId}/download` }, { x: 150, y: 300 }, 'visuals');
      }
      const card = editor.getCurrentPageShapesSorted().find((shape: any) => shape.type === 'document');
      editor.updateShape({ id: card.id, type: 'document', opacity: .6, props: { fit: 'cover', opacity: 30, previewImage: 'https://example.com/centerline-thumb.png' } });
      editor.select(card.id); editor.updateInstanceState({ opacityForNextShape: .2 }); editor.mark('centerline-attachment');
    });
    const card = structuredClone(editor.getOnlySelectedShape()), before = snapshot(), bounds = editor.getShapePageBounds(card);
    const doc = centerlineFixture(); doc.paths = [doc.paths[0]]; doc.width = 2048; doc.height = 499;
    doc.paths[0].contours = curves.mapContours(doc.paths[0].contours, (p: any) => ({ x: p.x * doc.width / 64, y: p.y * doc.height / 32 }));
    const originalDoc = structuredClone(doc); result(doc); dimensions(4096, 997);
    await click('trace-use-selected'); await select('trace-method', 'centerline'); await input('trace-width', '72'); await input('trace-stroke-width', '.35');
    assert.equal(host.querySelector('[data-testid="trace-replace"]'), null); await click('trace-prepare');
    assert.equal(fetches.at(-1), card.props.url); assert.ok(!fetches.includes(card.props.previewImage));
    assert.equal(get('trace-original-size').textContent, '4096 × 997 px'); assert.equal(get('trace-working-size').textContent, '2048 × 499 px');
    assert.equal(get('trace-open-count').textContent, '1'); assert.equal(get('trace-closed-count').textContent, '0');
    assert.equal(get('trace-output-stroke-width').textContent, '0.35'); assert.deepEqual(snapshot(), before);
    await click('vector-apply'); const output = editor.getOnlySelectedShape();
    assert.equal(output.type, 'cad-bezier'); assert.equal(output.parentId, editor.getCurrentPageId()); assert.equal(output.opacity, 1);
    assert.equal(output.props.contours[0].closed, false); assert.equal(output.meta.omsVectorPaint.fill, 'none');
    near(output.meta.omsVectorPaint.strokeWidth, .35 / cad.cadMmPerPixel(cad.DEFAULT_CAD_SETTINGS)); near(output.meta.omsVectorPaint.strokeOpacity, .4);
    const fullWidth = 72 / cad.cadMmPerPixel(cad.DEFAULT_CAD_SETTINGS), fullHeight = fullWidth * 997 / 4096;
    near(output.props.contours[0].nodes[0].x, bounds.maxX + 24 + 10 / 64 * fullWidth);
    near(output.props.contours[0].nodes[0].y, bounds.minY + 10 / 32 * fullHeight);
    near(output.props.contours[0].nodes[0].outY, -8 / 32 * fullHeight);
    assert.deepEqual(editor.getShape(card.id), card); assert.equal(editor.getShape(card.id).props.fileId, fileId); assert.deepEqual(doc, originalDoc);
    assert.equal(get('trace-use-selected').matches(':disabled'), true);
    const after = snapshot(); await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
    await act(async () => editor.redo()); assert.deepEqual(snapshot(), after);
  }));

  it('zooms aligned previews together, synchronizes scroll centers and adjusts overlay opacity without editing the drawing', async () => harness(async h => {
    const { upload, click, get, select, input, snapshot, act } = h, before = snapshot();
    await upload(); await click('trace-prepare');
    assert.deepEqual(Array.from(get('trace-preview-zoom').options, (option: any) => option.value), ['1', '2', '4', '8']);
    const source = get('trace-source-viewport'), result = get('trace-result-viewport');
    for (const viewport of [source, result]) {
      Object.defineProperties(viewport, {
        clientWidth: { configurable: true, value: 160 }, clientHeight: { configurable: true, value: 200 },
        scrollWidth: { configurable: true, get: () => 160 * Number(get('trace-preview-zoom').value) },
        scrollHeight: { configurable: true, get: () => 200 * Number(get('trace-preview-zoom').value) },
      });
    }
    await select('trace-preview-zoom', '4');
    for (const viewport of [source, result]) { assert.equal(viewport.scrollLeft, 240); assert.equal(viewport.scrollTop, 300); }
    await act(async () => { source.scrollLeft = 150; source.scrollTop = 180; source.dispatchEvent(new Event('scroll')); });
    assert.equal(result.scrollLeft, 150); assert.equal(result.scrollTop, 180);
    await act(async () => { result.scrollLeft = 320; result.scrollTop = 440; result.dispatchEvent(new Event('scroll')); });
    assert.equal(source.scrollLeft, 320); assert.equal(source.scrollTop, 440);
    await select('trace-preview-zoom', '8');
    for (const viewport of [source, result]) { assert.equal(viewport.scrollLeft, 720); assert.equal(viewport.scrollTop, 980); }
    for (const name of ['source', 'result']) {
      assert.equal(get(`trace-${name}-surface`).style.width, '800%'); assert.equal(get(`trace-${name}-surface`).style.height, '800%');
      assert.equal(get(`trace-${name}-preview`).getAttribute('viewBox'), '0 0 64 32');
    }
    await select('trace-preview-mode', 'overlay'); await input('trace-source-opacity', '30'); await input('trace-vector-opacity', '80');
    assert.equal(get('trace-result-preview').querySelector('image').getAttribute('opacity'), '0.3');
    assert.equal(get('trace-result-preview').querySelector('g').getAttribute('opacity'), '0.8');
    assert.equal(get('trace-result-surface').style.width, '800%');
    await select('trace-preview-mode', 'outline');
    assert.equal(get('trace-result-preview').querySelector('image').getAttribute('opacity'), '0.3');
    assert.equal(get('trace-result-preview').querySelector('path').getAttribute('vector-effect'), 'non-scaling-stroke');
    assert.equal(get('vector-apply').matches(':disabled'), false); assert.deepEqual(snapshot(), before);
  }));

  it('reports exact source and reduced dimensions and uses explicit high-quality resampling', async () => harness(async h => {
    const { dimensions, source, contexts, bitmaps } = h;
    dimensions(4096, 2048);
    const result = await source.decodeTraceRaster(new Blob(['png'], { type: 'image/png' }), 2048, new AbortController().signal);
    assert.deepEqual([result.originalWidth, result.originalHeight, result.image.width, result.image.height], [4096, 2048, 2048, 1024]);
    assert.equal(result.reduced, true); assert.equal(contexts.at(-1).imageSmoothingEnabled, true); assert.equal(contexts.at(-1).imageSmoothingQuality, 'high');
    assert.equal(bitmaps.at(-1).closed, true);
    dimensions(63, 31); const small = await source.decodeTraceRaster(new Blob(['png'], { type: 'image/png' }), 1024, new AbortController().signal);
    assert.deepEqual([small.image.width, small.image.height, small.reduced], [63, 31, false]);
  }));

  it('shows the actual reduced working size and keeps all trace quality notices informational', async () => harness(async h => {
    const { dimensions, result, documentFixture, upload, click, get, host } = h;
    dimensions(4096, 2048); const doc = documentFixture();
    doc.width = 2048; doc.height = 1024; doc.warnings = ['trace-approximation', 'trace-topology', 'trace-noise']; result(doc);
    await upload(); await click('trace-prepare');
    assert.equal(get('trace-original-size').textContent, '4096 × 2048 px'); assert.equal(get('trace-working-size').textContent, '2048 × 1024 px');
    assert.equal(get('trace-source-preview').getAttribute('viewBox'), '0 0 2048 1024'); assert.equal(get('trace-result-preview').getAttribute('viewBox'), '0 0 2048 1024');
    assert.match(host.textContent, /source was reduced/); assert.match(host.textContent, /were omitted/);
    assert.equal(host.querySelector('[data-testid="trace-review-ack"]'), null); assert.equal(get('vector-apply').matches(':disabled'), false);
  }));

  it('keeps acknowledgement for noninformational warnings and disables stale selected-source application', async () => harness(async h => {
    const { result, documentFixture, upload, click, get, editor, tl, act, tick, snapshot } = h;
    const doc = documentFixture(); doc.warnings = ['trace-approximation', 'fontError']; result(doc);
    await upload(); await click('trace-prepare'); assert.equal(get('vector-apply').matches(':disabled'), true);
    await click('trace-review-ack'); assert.equal(get('vector-apply').matches(':disabled'), false);
    await act(async () => { const id = tl.createShapeId('external-selection'); editor.createShape({ id, type: 'geo' }); editor.select(id); }); await tick();
    const external = snapshot(); assert.equal(get('vector-apply').matches(':disabled'), true); await click('vector-apply'); assert.deepEqual(snapshot(), external);
  }));

  it('closes decoded resources on limits and honors cancellation before decoding', async () => harness(async ({ dimensions, source, bitmaps }) => {
    const canceled = new AbortController(); canceled.abort();
    await assert.rejects(source.decodeTraceRaster(new Blob([], { type: 'image/png' }), 2048, canceled.signal), /cancelled/);
    assert.equal(bitmaps.length, 0);
    dimensions(10000, 10000);
    await assert.rejects(source.decodeTraceRaster(new Blob(['png'], { type: 'image/png' }), 2048, new AbortController().signal), /limit/);
    assert.equal(bitmaps.at(-1).closed, true);
    await assert.rejects(source.decodeTraceRaster(new Blob(['svg'], { type: 'image/svg+xml' }), 2048, new AbortController().signal), /limit/);
  }));

  it('invalidates old previews after options, source selection or read-only changes', async () => harness(async h => {
    const { upload, click, get, input, editor, act, tick, snapshot } = h, before = snapshot();
    await upload(); await click('trace-prepare'); await input('trace-smoothing', '.2');
    assert.equal(get('vector-apply').matches(':disabled'), true); await click('vector-apply'); assert.deepEqual(snapshot(), before);
    await click('trace-prepare'); await act(async () => editor.updateInstanceState({ isReadonly: true })); await tick();
    assert.equal(get('trace-prepare').matches(':disabled'), true); assert.equal(get('vector-apply').matches(':disabled'), true);
    assert.deepEqual(snapshot(), before);
  }));

  it('discards canceled and stale asynchronous work without adding shapes', async () => harness(async h => {
    const { upload, click, hold, release, get, host, workers, editor, act, snapshot, tick } = h;
    await upload(); hold(); const before = snapshot(); await click('trace-prepare');
    assert.equal(get('trace-smoothing').matches(':disabled'), true); await click('trace-cancel');
    assert.equal(workers[0].terminated, true); assert.equal(host.querySelector('[data-testid="vector-review"]'), null); assert.deepEqual(snapshot(), before);
    await click('trace-prepare');
    await act(async () => editor.updatePage({ id: editor.getCurrentPageId(), meta: { ...editor.getCurrentPage().meta, external: 'keep' } }));
    const external = snapshot(); await act(async () => release()); await tick();
    assert.equal(host.querySelector('[data-testid="vector-review"]'), null); assert.match(get('trace-status').textContent, /changed/); assert.deepEqual(snapshot(), external);
    await click('trace-prepare'); await act(async () => editor.updateInstanceState({ isReadonly: true }));
    await act(async () => release()); await tick();
    assert.equal(host.querySelector('[data-testid="vector-review"]'), null); assert.match(get('trace-status').textContent, /read-only/); assert.deepEqual(snapshot(), external);
  }));

  it('terminates a pending trace on unmount and never installs its late preview', async () => harness(async ({ upload, click, hold, workers, render, release, act, snapshot }) => {
    await upload(); hold(); const before = snapshot(); await click('trace-prepare'); await render(null);
    assert.equal(workers[0].terminated, true); await act(async () => release()); assert.deepEqual(snapshot(), before);
  }));

  it('preserves transformed/flipped selected image geometry and source/group alpha with native Undo', async () => harness(async h => {
    const { editor, tl, act, source, documentFixture, cad, plans, snapshot, curves } = h;
    const group = tl.createShapeId('trace-group'), id = tl.createShapeId('trace-image');
    await act(async () => {
      editor.createShapes([{ id: group, type: 'group', x: 200, y: 150, rotation: .4, opacity: .5 },
        { id, type: 'image', parentId: group, x: 20, y: 30, rotation: -.2, opacity: .6, props: { w: 128, h: 96, flipX: true, flipY: false } }]);
      editor.select(id); editor.mark('trace-source-fixture');
    });
    const before = snapshot(), original = editor.getShape(id), doc = documentFixture();
    const plan = source.prepareSelectedRasterTracePlan(editor, cad.DEFAULT_CAD_SETTINGS, doc, false);
    assert.deepEqual(snapshot(), before); assert.deepEqual(plan.removeIds, []);
    near(plan.shapes[0].meta.omsVectorPaint.fillOpacity, .24);
    assert.deepEqual(plan.placement, { parentId: group, aboveId: id }); assert.equal(plan.shapes[0].opacity, 1);
    const transform = editor.getShapePageTransform(original), expected = transform.applyToPoint({ x: (64 - 10) * 2, y: 10 * 3 });
    const node = plan.contours[0].nodes[0], parentTransform = editor.getShapePageTransform(group), pageNode = parentTransform.applyToPoint(node);
    near(pageNode.x, expected.x); near(pageNode.y, expected.y);
    const control = transform.applyToPoint({ x: (64 - 20) * 2, y: 2 * 3 });
    const pageControl = parentTransform.applyToPoint({ x: node.x + node.outX, y: node.y + node.outY });
    near(pageControl.x, control.x); near(pageControl.y, control.y);
    await act(async () => assert.equal(plans.applyCadPlan(editor, plan), true));
    assert.deepEqual(editor.getShape(id), original); const saved = editor.getOnlySelectedShape();
    assert.equal(saved.type, 'cad-bezier'); assert.equal(saved.parentId, group);
    near(saved.meta.omsVectorPaint.fillOpacity * saved.opacity * editor.getShape(group).opacity, .12);
    assert.equal(curves.curvePathData(saved.props.contours), curves.curvePathData(plan.contours));
    await act(async () => editor.undo()); assert.deepEqual(snapshot(), before);
  }));

  it('rejects repeated materials and protected sources while retaining source clipping and alpha', async () => harness(async h => {
    const { editor, tl, act, source, documentFixture, cad, snapshot, vector, curves, click, get, workers } = h;
    const id = tl.createShapeId('trace-raster'), boundary = { closed: true, nodes: [[0, 0], [128, 0], [128, 64], [0, 64]].map(([x, y]) => curves.nodeAt({ x, y })) };
    const paint = { ...vector.VECTOR_DEFAULT_PAINT, fillOpacity: .5, raster: { width: 64, height: 32,
      png: 'data:image/png;base64,iVBORw0KGgoAAAAA', rgb: 'AAAA', matrix: [128, 0, 0, 64, 0, 0], usage: 'material', repeat: true } };
    await act(async () => { editor.createShape({ id, type: 'cad-bezier', opacity: .5, props: { contours: [boundary] }, meta: { omsVectorPaint: paint } }); editor.select(id); });
    const before = snapshot(); assert.throws(() => source.prepareSelectedRasterTracePlan(editor, cad.DEFAULT_CAD_SETTINGS, documentFixture(), true), /trace-repeat/);
    assert.deepEqual(snapshot(), before);
    assert.equal(get('trace-use-selected').matches(':disabled'), true);
    await click('trace-use-selected'); await click('trace-prepare'); assert.equal(workers.length, 0); assert.match(get('trace-source-unavailable').textContent, /Repeated material/);
    const plainPaint = structuredClone(paint); delete plainPaint.raster.repeat;
    await act(async () => editor.updateShape({ id, type: 'cad-bezier', meta: { omsVectorPaint: plainPaint } }));
    const plan = source.prepareSelectedRasterTracePlan(editor, cad.DEFAULT_CAD_SETTINGS, documentFixture(), true);
    assert.deepEqual(plan.removeIds, [id]); near(plan.shapes[0].meta.omsVectorPaint.fillOpacity, .1); assert.deepEqual(plan.shapes[0].meta.omsVectorPaint.clips, []);
    const bowtie = { ...boundary, nodes: [boundary.nodes[0], boundary.nodes[2], boundary.nodes[1], boundary.nodes[3]] };
    await act(async () => editor.updateShape({ id, type: 'cad-bezier', props: { contours: [bowtie] } }));
    const clipped = source.prepareSelectedRasterTracePlan(editor, cad.DEFAULT_CAD_SETTINGS, documentFixture(), false);
    assert.deepEqual(clipped.shapes[0].meta.omsVectorPaint.clips[0].contours, [bowtie]);
    await act(async () => editor.updateShape({ id, type: 'cad-bezier', isLocked: true }));
    assert.throws(() => source.selectedRasterTraceSource(editor), /locked/);
  }));

  it('counts actual curvature rather than nonzero collinear handles or C path commands', async () => harness(async ({ review, documentFixture }) => {
    const doc = documentFixture(); assert.deepEqual(review.rasterTraceCounts(doc), { objects: 1, colors: 1, contours: 1, open: 0, closed: 1, nodes: 4, curves: 1, lines: 3 });
    doc.paths[0].contours[0].nodes[0].outY = 0; doc.paths[0].contours[0].nodes[1].inY = 0;
    assert.deepEqual(review.rasterTraceCounts(doc), { objects: 1, colors: 1, contours: 1, open: 0, closed: 1, nodes: 4, curves: 0, lines: 4 });
  }));

  it('counts visible stroke colors and open/closed paths without inventing a closure or counting invisible paint', async () => harness(async ({ review, centerlineFixture }) => {
    const doc = centerlineFixture();
    assert.deepEqual(review.rasterTraceCounts(doc), { objects: 2, colors: 1, contours: 2, open: 1, closed: 1, nodes: 6, curves: 2, lines: 3 });
    doc.paths[1].paint.stroke = '#ffffff'; doc.paths[1].paint.strokeOpacity = 0;
    assert.equal(review.rasterTraceCounts(doc).colors, 1);
    doc.paths[1].paint.strokeOpacity = 1; doc.paths[1].paint.strokeWidth = 0;
    assert.equal(review.rasterTraceCounts(doc).colors, 1);
    doc.paths[1].paint.strokeWidth = 1; assert.equal(review.rasterTraceCounts(doc).colors, 2);
    doc.paths[0].paint.fill = '#16324F'; assert.equal(review.rasterTraceCounts(doc).colors, 2);
  }));

  it('renders EN/RU/LV trace terminology and keeps approximation notices informational', async () => harness(async h => {
    const { locale, act, tick, host, upload, click, get, select, result, centerlineFixture } = h;
    await select('trace-method', 'centerline'); result(centerlineFixture());
    for (const [lang, label, method] of [['ru', 'Сохранять острые углы', 'Осевые линии'], ['lv', 'Saglabāt asus stūrus', 'Viduslīnijas'], ['en', 'Preserve sharp corners', 'Centerline']]) {
      await act(async () => locale.set(lang)); await tick(); assert.ok(host.textContent.includes(label));
      assert.equal(get('trace-method').selectedOptions[0].textContent, method);
    }
    await upload(); await click('trace-prepare'); assert.equal(get('vector-apply').matches(':disabled'), false);
    assert.equal(host.querySelector('[data-testid="trace-review-ack"]'), null);
  }));
});
