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
  const workers: any[] = [], bitmaps: any[] = [], contexts: any[] = [];
  let dimensions = { width: 64, height: 32 }, workerMode: 'auto' | 'hold' = 'auto', workerResult: any;
  values.fetch = async () => ({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) });
  values.createImageBitmap = async () => {
    const bitmap = { ...dimensions, closed: false, close() { this.closed = true; } }; bitmaps.push(bitmap); return bitmap;
  };
  values.Worker = class {
    onmessage: any; onerror: any; terminated = false; posted: any;
    constructor() { workers.push(this); }
    terminate() { this.terminated = true; }
    postMessage(value: unknown) { this.posted = value; if (workerMode === 'auto') queueMicrotask(() => this.onmessage?.({ data: { result: structuredClone(workerResult) } })); }
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
  const { locale } = await import('svelte-i18n'); locale.set('en');
  const host = document.createElement('div'); host.tabIndex = 0; document.body.append(host);
  const shapeUtils = [...tl.defaultShapeUtils, CadBezierShapeUtil];
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
  try { await run({ editor, tl, host, get, click, select, input, upload, act, tick, render, snapshot, cad, plans, vector, curves, source, review, documentFixture,
    locale, workers, bitmaps, contexts, dimensions: (width: number, height: number) => { dimensions = { width, height }; },
    hold: () => { workerMode = 'hold'; }, result: (value: any) => { workerResult = value; },
    release: () => workers.at(-1)?.onmessage?.({ data: { result: structuredClone(workerResult) } }) }); }
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

  it('aligns bitmap and real curve geometry in the same pixel frame and applies one undoable result', async () => harness(async h => {
    const { upload, click, get, select, host, snapshot, editor, act, curves, documentFixture } = h, before = snapshot();
    await upload(); await click('trace-prepare');
    assert.equal(get('trace-source-preview').getAttribute('viewBox'), '0 0 64 32');
    assert.equal(get('trace-result-preview').getAttribute('viewBox'), '0 0 64 32');
    assert.equal(get('trace-result-preview').querySelector('path[fill="#16324f"]').getAttribute('d'), curves.curvePathData(documentFixture().paths[0].contours));
    assert.equal(get('trace-curve-count').textContent, '1'); assert.equal(get('trace-line-count').textContent, '3');
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
    near(plan.shapes[0].meta.omsVectorPaint.fillOpacity, .12);
    const transform = editor.getShapePageTransform(original), expected = transform.applyToPoint({ x: (64 - 10) * 2, y: 10 * 3 });
    const node = plan.contours[0].nodes[0]; near(node.x, expected.x); near(node.y, expected.y);
    const control = transform.applyToPoint({ x: (64 - 20) * 2, y: 2 * 3 });
    near(node.x + node.outX, control.x); near(node.y + node.outY, control.y);
    await act(async () => assert.equal(plans.applyCadPlan(editor, plan), true));
    assert.deepEqual(editor.getShape(id), original); const saved = editor.getOnlySelectedShape();
    assert.equal(saved.type, 'cad-bezier'); assert.equal(saved.parentId, editor.getCurrentPageId());
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
    await click('trace-use-selected'); await click('trace-prepare'); assert.equal(workers.length, 0); assert.match(get('trace-status').textContent, /Repeated material/);
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
    const doc = documentFixture(); assert.deepEqual(review.rasterTraceCounts(doc), { contours: 1, nodes: 4, curves: 1, lines: 3 });
    doc.paths[0].contours[0].nodes[0].outY = 0; doc.paths[0].contours[0].nodes[1].inY = 0;
    assert.deepEqual(review.rasterTraceCounts(doc), { contours: 1, nodes: 4, curves: 0, lines: 4 });
  }));

  it('renders EN/RU/LV trace terminology and keeps approximation notices informational', async () => harness(async h => {
    const { locale, act, tick, host, upload, click, get } = h;
    for (const [lang, label] of [['ru', 'Сохранять острые углы'], ['lv', 'Saglabāt asus stūrus'], ['en', 'Preserve sharp corners']]) {
      await act(async () => locale.set(lang)); await tick(); assert.ok(host.textContent.includes(label));
    }
    await upload(); await click('trace-prepare'); assert.equal(get('vector-apply').matches(':disabled'), false);
    assert.equal(host.querySelector('[data-testid="trace-review-ack"]'), null);
  }));
});
