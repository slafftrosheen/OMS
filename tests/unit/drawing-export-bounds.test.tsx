import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

/** Actual Editor SVG export and independent native raster rendering; no browser execution. */
async function harness(run: (h: any) => void | Promise<void>) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window, channels: MessageChannel[] = [], NativeChannel = globalThis.MessageChannel;
  win.fetch = globalThis.fetch.bind(globalThis);
  const media = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  win.matchMedia = media;
  const values: Record<string, unknown> = { matchMedia: media,
    getComputedStyle: win.getComputedStyle.bind(win), requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    MessageChannel: class extends NativeChannel { constructor() { super(); channels.push(this); } },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  for (const key of ['window', 'document', 'navigator', 'self', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
    'DOMParser', 'XMLSerializer', 'SVGSVGElement', 'SVGElement', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'DOMRect', 'MutationObserver', 'Image', 'localStorage'])
    values[key] = key === 'window' || key === 'self' ? win : win[key];
  const clearNodeTimeout = globalThis.clearTimeout, clearNodeInterval = globalThis.clearInterval;
  values.clearTimeout = (id: any) => typeof id === 'number' ? win.clearTimeout(id) : clearNodeTimeout(id);
  values.clearInterval = (id: any) => typeof id === 'number' ? win.clearInterval(id) : clearNodeInterval(id);
  win.HTMLImageElement.prototype.decode = async () => {};
  win.Element.prototype.setPointerCapture = function () {};
  win.Element.prototype.hasPointerCapture = function () { return false; };
  win.Element.prototype.releasePointerCapture = function () {};
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const tl = await import('@tldraw/tldraw');
  const curves = await import('../../src/lib/components/canvas/cad-curves');
  const vector = await import('../../src/lib/components/canvas/cad-vector');
  const cad = await import('../../src/lib/components/canvas/cad-settings');
  const outline = await import('../../src/lib/components/canvas/drawing-outline');
  const measurements = await import('../../src/lib/components/canvas/cad-measurements');
  const { CadBezierShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadBezierShape');
  const { CadPathShapeUtil, CadEllipseShapeUtil, CadArcShapeUtil, CadDimensionShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadShapes');
  const { planDrawingExport } = await import('../../src/lib/components/canvas/drawing-operations');
  const host = document.createElement('div'); document.body.append(host);
  const shapeUtils = [...tl.defaultShapeUtils, CadBezierShapeUtil, CadPathShapeUtil, CadEllipseShapeUtil, CadArcShapeUtil, CadDimensionShapeUtil];
  const editor = new tl.Editor({ store: tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }), shapeUtils,
    bindingUtils: tl.defaultBindingUtils, tools: [...tl.defaultTools, ...tl.defaultShapeTools], getContainer: () => host, initialState: 'select' });
  editor.updateViewportScreenBounds(new tl.Box(0, 0, 800, 600));
  editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS } } });
  const contour = (points: number[][], closed = false) => ({ closed, nodes: points.map(([x, y]) => curves.nodeAt({ x, y })) });
  const rectangle = (x: number, y: number, w: number, h: number) => contour([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true);
  const paint = { ...vector.VECTOR_DEFAULT_PAINT, fill: 'none', stroke: '#000000', strokeOpacity: .8, strokeWidth: 40, lineCap: 'round', lineJoin: 'round', dash: [] };
  const create = (contours = [contour([[0, 0], [100, 0]])], appearance = {}, placement = {}) => {
    assert.ok(vector.validVectorPaint({ ...paint, ...appearance }), 'fixture paint must exercise its intended appearance');
    const id = tl.createShapeId(); editor.createShape({ id, type: 'cad-bezier', x: 100, y: 100, opacity: 1, ...placement,
      props: { contours, fillRule: 'evenodd' }, meta: { omsVectorPaint: JSON.parse(JSON.stringify({ ...paint, ...appearance })) } });
    return editor.getShape(id);
  };
  const pagePoint = (shape: any, point: number[]) => editor.getShapePageTransform(shape).applyToPoint({ x: point[0], y: point[1] });
  const pick = (shape: any, point: number[], opts = {}) => editor.getShapeAtPoint(pagePoint(shape, point), { filter: (s: any) => s.id === shape.id, ...opts });
  const margin = () => editor.options.hitTestMargin / editor.getZoomLevel();
  const snapshot = () => structuredClone(editor.store.getStoreSnapshot('document'));
  try { await run({ editor, tl, win, curves, cad, outline, measurements, contour, rectangle, create, paint, pagePoint, pick, margin, snapshot, planDrawingExport }); }
  finally {
    editor.dispose(); host.remove(); channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
}


async function exported(h: any, ids: any[], padding = 0) {
  h.editor.setSelectedShapes(ids);
  const plan = h.planDrawingExport(h.editor, 'svg', { scope: 'selected', scale: 1, background: false, padding });
  assert.equal(plan.ok, true); if (!plan.ok) throw new Error(plan.error);
  const b = plan.value.bounds;
  const svg = await h.editor.getSvgString(plan.value.ids, { bounds: new h.tl.Box(b.x, b.y, b.w, b.h), padding, scale: 1, background: false });
  assert.ok(svg); near(svg.width, b.w + 2 * padding); near(svg.height, b.h + 2 * padding);
  assert.equal(Math.ceil(svg.width), plan.value.width); assert.equal(Math.ceil(svg.height), plan.value.height);
  const { createCanvas, loadImage } = createRequire(`${process.cwd()}/package.json`)('@napi-rs/canvas');
  const canvas = createCanvas(plan.value.width, plan.value.height), ctx = canvas.getContext('2d');
  ctx.drawImage(await loadImage(Buffer.from(svg.svg)), 0, 0);
  const alpha = (x: number, y: number) => ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data[3];
  return { plan: plan.value, svg: svg.svg, alpha, pixel: (point: any) => ({ x: point.x - b.x + padding, y: point.y - b.y + padding }) };
}

describe('production save control', () => {
  it('rejects a changed export while rendering and places a confirmed file after a canvas edit', async () => harness(async () => {
    const React = await import('react'), { act } = React;
    const { createRoot } = await import('react-dom/client');
    const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
    const { ProductionSaveButton } = await import('../../src/lib/components/canvas/ProductionSaveButton');
    const { setOrderBridge } = await import('../../src/lib/components/canvas/state-bridge');
    const { fixture } = await import('../helpers/cad-editor');
    const f = fixture();
    f.editor.createShape({ id:'shape:pocket', type:'frame', props:{w:800,h:500}, meta:{omsFilePocket:'visuals'} });
    let uploads = 0, renders = 0, finish!: (blob: Blob) => void;
    const pending = new Promise<Blob>(resolve => { finish = resolve; });
    const blob = new Blob(['%PDF-fixture'], { type:'application/pdf' });
    setOrderBridge(f.editor, { orderId:'draft', onFilesUpload:async()=>{}, onStoreCanvasFile:async()=>{
      uploads++;
      return { id:'stored', url:'blob:stored' };
    } });
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    const oldAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    const previousFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value:true, configurable:true });
    const render = (source: string, disabled = false) => act(async () => root.render(<EditorContext.Provider value={f.editor}>
      <ProductionSaveButton extension="pdf" source={source} disabled={disabled} createFile={() => ++renders === 1 ? pending : blob}
        errorMessage={() => 'Artwork export failed'} />
    </EditorContext.Provider>));
    try {
      await render('original');
      await act(async () => host.querySelector('button')!.click());
      await render('changed');
      await act(async () => finish(blob));
      assert.match(host.textContent ?? '', /drawing changed/i);
      assert.equal(uploads, 0);

      f.state.failCreation = true;
      await act(async () => host.querySelector('button')!.click());
      assert.match(host.querySelector('button')!.textContent ?? '', /Place saved file/);
      assert.equal(uploads, 1);
      assert.equal(f.shapes.size, 1);
      f.state.failCreation = false;
      f.editor.updatePage({ meta:{ edited:true } });
      await render('changed', true);
      assert.equal(host.querySelector('button')!.disabled, false);
      await act(async () => host.querySelector('button')!.click());
      assert.equal(uploads, 1);
      assert.equal(renders, 2);
      assert.equal([...f.shapes.values()].find(shape => shape.type === 'document')?.parentId, 'shape:pocket');

      setOrderBridge(f.editor, { orderId:'stored-order' });
      globalThis.fetch = async () => new Response('<html>Payload too large</html>', { status:413 });
      await render('saved-order');
      await act(async () => host.querySelector('button')!.click());
      assert.match(host.querySelector('[role="status"]')?.textContent ?? '', /server rejected the attachment size/i);
      assert.equal(f.shapes.size, 2);
    } finally {
      globalThis.fetch = previousFetch;
      await act(async () => root.unmount());
      host.remove();
      if (oldAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', oldAct);
      else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    }
  }));
});

describe('paint-aware CAD artwork export bounds', () => {
  for (const vertical of [false, true]) it(`exports the complete thick ${vertical ? 'vertical' : 'horizontal'} centerline with zero padding`, async () => harness(async h => {
    const shape = h.create([h.contour(vertical ? [[0, 0], [0, 100]] : [[0, 0], [100, 0]])], { strokeWidth: 100, strokeOpacity: 1 });
    const before = h.snapshot(), result = await exported(h, [shape.id]);
    assert.deepEqual(result.plan.bounds, { x: 50, y: 50, w: vertical ? 100 : 200, h: vertical ? 200 : 100 });
    assert.ok(result.svg.includes('stroke-width="100"'));
    const inside = result.pixel(vertical ? { x: 100, y: 52 } : { x: 52, y: 100 });
    assert.ok(result.alpha(inside.x, inside.y) > 240, 'near-cap ink is inside the native output viewport');
    near(vertical ? h.editor.getShapeGeometry(shape).bounds.w : h.editor.getShapeGeometry(shape).bounds.h, 0);
    assert.deepEqual(h.snapshot(), before, 'export planning/rendering must not modify saved geometry');
  }));

  it('adds user padding outside the painted extent and preserves requested PNG scales', async () => harness(async h => {
    const shape = h.create(undefined, { strokeWidth: 100, strokeOpacity: 1 });
    const result = await exported(h, [shape.id], 24);
    assert.equal(result.plan.width, 248); assert.equal(result.plan.height, 148);
    assert.equal(result.alpha(4, 74), 0); assert.ok(result.alpha(26, 74) > 240);
    for (const scale of [1, 2, 4]) {
      const plan = h.planDrawingExport(h.editor, 'png', { scope: 'selected', scale, background: false, padding: 24 });
      assert.equal(plan.ok, true); assert.equal(plan.value.width, 248 * scale); assert.equal(plan.value.height, 148 * scale);
      assert.equal(plan.value.nativeScale, scale / 2);
    }
  }));

  it('includes rotated round/square caps, miter joins and cubic extrema in the export frame', async () => harness(async h => {
    const straight = h.create(undefined, { strokeWidth: 100, strokeOpacity: 1, lineCap: 'square' }, { rotation: Math.PI / 4 });
    const square = await exported(h, [straight.id]);
    const corner = h.pagePoint(straight, [-48, -48]), pixel = square.pixel(corner);
    assert.ok(square.alpha(pixel.x, pixel.y) > 240);
    const elbow = h.create([h.contour([[0, 100], [50, 0], [60, 100]])], { strokeWidth: 30, strokeOpacity: 1, lineJoin: 'miter', miterLimit: 10 }, { x: 400, y: 200 });
    const miter = await exported(h, [elbow.id]);
    assert.ok(miter.plan.bounds.y < 200 - 60, 'acute join projection is not clipped to a half-width expansion');
    const tip = miter.pixel(h.pagePoint(elbow, [54, -40])); assert.ok(miter.alpha(tip.x, tip.y) > 240);
    const arch = h.contour([[0, 0], [100, 0]]); arch.nodes[0].outY = -80; arch.nodes[1].inY = -80;
    const curve = h.create([arch], { strokeWidth: 40, strokeOpacity: 1 }, { x: 300, y: 300, rotation: .3 });
    const curveResult = await exported(h, [curve.id]);
    const local = h.curves.cubicAt(h.curves.cubicPoints(arch.nodes[0], arch.nodes[1]), .5);
    const middle = curveResult.pixel(h.pagePoint(curve, [local.x, local.y]));
    assert.ok(curveResult.alpha(middle.x, middle.y) > 240);
  }));

  it('bounds analytic CAD paths/ellipses/arcs without converting their saved geometry', async () => harness(async h => {
    for (const [type, props] of [['cad-path', { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], closed: false }],
      ['cad-ellipse', { w: 100, h: 40 }], ['cad-arc', { radius: 50, startAngle: 0, endAngle: 180 }]] as const) {
      const id = h.tl.createShapeId(); h.editor.createShape({ id, type, x: 100, y: 100, props,
        meta: { omsVectorPaint: { ...h.paint, strokeWidth: 40, strokeOpacity: 1 } } });
      const before = h.snapshot(), result = await exported(h, [id]);
      assert.ok(result.svg.includes('stroke-width="40"')); assert.ok(result.plan.width > 100);
      assert.deepEqual(h.snapshot(), before);
    }
  }));

  it('clips painted bounds after expansion and retains ink entering a native frame from an outside centerline', async () => harness(async h => {
    const source = h.create(undefined, { strokeWidth: 100, strokeOpacity: 1, clips: [{ contours: [h.rectangle(20, -10, 60, 20)], fillRule: 'nonzero' }] });
    const clipped = await exported(h, [source.id]);
    assert.deepEqual(clipped.plan.bounds, { x: 120, y: 90, w: 60, h: 20 });
    assert.ok(clipped.alpha(30, 10) > 240);
    const frame = h.tl.createShapeId(); h.editor.createShape({ id: frame, type: 'frame', x: 400, y: 100, props: { w: 100, h: 100 } });
    const outside = h.create(undefined, { strokeWidth: 40, strokeOpacity: 1 }, { parentId: frame, x: 0, y: -10 });
    assert.equal(h.editor.getShapeMaskedPageBounds(outside.id), undefined, 'native centerline-only bounds are outside the frame');
    const framed = await exported(h, [outside.id]);
    assert.deepEqual(framed.plan.bounds, { x: 400, y: 100, w: 100, h: 10 });
    assert.ok(framed.alpha(50, 5) > 240, 'visible pen area is retained despite the outside centerline');
  }));

  it('does not expand invisible strokes and enforces pixel budgets against the full paint', async () => harness(h => {
    const shape = h.create([h.rectangle(0, 0, 100, 100)], { fill: '#ff0000', strokeOpacity: 0, strokeWidth: 10000 });
    h.editor.select(shape.id);
    let plan = h.planDrawingExport(h.editor, 'png', { scope: 'selected', scale: 1, background: false, padding: 0 });
    assert.equal(plan.ok, true); assert.equal(plan.value.width, 100); assert.equal(plan.value.height, 100);
    h.editor.updateShape({ id: shape.id, type: shape.type, meta: { omsVectorPaint: { ...h.paint, strokeWidth: 10000 } } });
    plan = h.planDrawingExport(h.editor, 'png', { scope: 'selected', scale: 1, background: false, padding: 0 });
    assert.deepEqual(plan, { ok: false, error: 'exportTooLarge' });
  }));
});

/** JSDOM supplies only the DOM. Decode, render and encode through the independent
 * native canvas implementation so the installed public PNG exporter is exercised. */
async function nativeRasterApis(h: any, run: (png: Uint8Array<ArrayBuffer>) => Promise<void>) {
  const { createCanvas, loadImage } = createRequire(`${process.cwd()}/package.json`)('@napi-rs/canvas');
  const sharp = createRequire(`${process.cwd()}/package.json`)('sharp');
  const realFetch = globalThis.fetch, oldReader = Object.getOwnPropertyDescriptor(globalThis, 'FileReader');
  const oldBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  const proto = h.win.HTMLCanvasElement.prototype, canvases = new WeakMap<any, any>();
  const oldContext = proto.getContext, oldBlob = proto.toBlob;
  const oldWidth = Object.getOwnPropertyDescriptor(proto, 'width')!, oldHeight = Object.getOwnPropertyDescriptor(proto, 'height')!;
  const oldImage = h.win.Image;
  const nativeCanvas = (element: any) => {
    if (!canvases.has(element)) canvases.set(element, createCanvas(element.width, element.height));
    return canvases.get(element);
  };
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async (blob: Blob) => {
    const decoded = await sharp(Buffer.from(await blob.arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
    return { width: decoded.info.width, height: decoded.info.height, close() {} };
  } });
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: class {
    result = ''; onload?: () => void; onerror?: () => void;
    readAsDataURL(blob: Blob) { void blob.arrayBuffer().then(buffer => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`; this.onload?.();
    }, () => this.onerror?.()); }
  } });
  h.win.Image = class {
    image: any; onload?: () => void; onerror?: () => void;
    set src(url: string) { void realFetch(url).then(r => r.arrayBuffer()).then(bytes => sharp(Buffer.from(bytes)).png().toBuffer()).then(bytes => loadImage(bytes)).then(image => {
      this.image = image; this.onload?.();
    }, () => this.onerror?.()); }
  };
  for (const [key, descriptor] of [['width', oldWidth], ['height', oldHeight]] as const) Object.defineProperty(proto, key, { ...descriptor, set(value) {
    descriptor.set!.call(this, value); if (canvases.has(this)) canvases.get(this)[key] = this[key];
  } });
  proto.getContext = function () {
    const ctx = nativeCanvas(this).getContext('2d');
    return new Proxy(ctx, { get(target, key) {
      if (key === 'drawImage') return (image: any, ...args: any[]) => target.drawImage(image.image ?? image, ...args);
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    }, set(target, key, value) { return Reflect.set(target, key, value, target); } });
  };
  proto.toBlob = function (callback: (blob: Blob) => void) { callback(new Blob([nativeCanvas(this).toBuffer('image/png')], { type: 'image/png' })); };
  const source = createCanvas(2, 2), ctx = source.getContext('2d'); ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 2, 2);
  try { await run(new Uint8Array(source.toBuffer('image/png'))); }
  finally {
    globalThis.fetch = realFetch; h.win.Image = oldImage; proto.getContext = oldContext; proto.toBlob = oldBlob;
    Object.defineProperty(proto, 'width', oldWidth); Object.defineProperty(proto, 'height', oldHeight);
    if (oldReader) Object.defineProperty(globalThis, 'FileReader', oldReader); else Reflect.deleteProperty(globalThis, 'FileReader');
    if (oldBitmap) Object.defineProperty(globalThis, 'createImageBitmap', oldBitmap); else Reflect.deleteProperty(globalThis, 'createImageBitmap');
  }
}

const rasterId = (n = 0) => `12345678-1234-1234-1234-${String(n).padStart(12, '0')}`;
function material(h: any, n = 0, repeat = false, toolkit = false) {
  const fileId = rasterId(n), png = toolkit ? `/oms/api/toolkit/assets/${rasterId(99)}/${fileId}` : `/api/files/${fileId}/download`;
  return h.create([h.rectangle(0, 0, 100, 50)], { stroke: 'none', fill: 'none', fillOpacity: 1,
    raster: { usage: 'material', width: 2, height: 2, png, external: true, fileId, hasAlpha: false, matrix: [100, 0, 0, 50, 0, 0], ...(repeat ? { repeat: true } : {}) }
  }, { x: n * 200, y: 0 });
}
const exportOptions = { scope: 'selected' as const, scale: 1 as const, background: false, padding: 0 };

describe('physical drawing pages', () => {
  it('persists independent page sizes and drawings and keeps setup and creation undoable', async () => harness(async h => {
    const { addDrawingPage, drawingPageBounds, fitDrawingPage, readDrawingPageSize, saveDrawingPage, switchDrawingPage } =
      await import('../../src/lib/components/canvas/drawing-pages');
    const { captureCanvasDocument, registerCanvasDraft } = await import('../../src/lib/components/canvas/canvas-document');
    const editor = h.editor;
    const first = editor.getCurrentPageId(), shape = h.create();
    const a4 = { widthMm: 210, heightMm: 297 }, custom = { widthMm: 300, heightMm: 120 };
    const options = { ...exportOptions, scope: 'page' as const };
    assert.deepEqual(h.planDrawingExport(editor, 'svg', options), { ok: false, error: 'pageNeedsSize' });
    editor.updatePage({ id: first, meta: { existing: 'kept' } });
    assert.equal(saveDrawingPage(editor, 'Front', a4), true);
    assert.equal(h.cad.readCadSettings(editor).scale, 1);
    assert.equal(editor.getCurrentPage().meta.existing, 'kept');
    const originalBounds = drawingPageBounds(editor)!;
    assert.equal(h.cad.writeCadSettings(editor, { ...h.cad.DEFAULT_CAD_SETTINGS, originX: 90, originY: 50 }), true);
    assert.deepEqual(drawingPageBounds(editor), originalBounds);
    assert.equal(saveDrawingPage(editor, 'Invalid', { widthMm: 0, heightMm: 20 }), false);
    assert.equal(fitDrawingPage(editor), true);

    assert.equal(addDrawingPage(editor, 'Reverse'), true);
    const second = editor.getCurrentPageId();
    assert.notEqual(second, first);
    assert.equal(editor.getCurrentPageShapeIds().size, 0);
    assert.deepEqual(readDrawingPageSize(editor), a4);
    assert.equal(h.cad.readCadSettings(editor).originX, 0);
    editor.undo();
    assert.equal(editor.getCurrentPageId(), first);
    assert.equal(editor.getPage(second), undefined);
    editor.redo();
    assert.equal(editor.getCurrentPageId(), second);
    assert.equal(saveDrawingPage(editor, 'Panel back', custom), true);
    editor.undo();
    assert.deepEqual(readDrawingPageSize(editor), a4);
    editor.redo();
    assert.deepEqual(readDrawingPageSize(editor), custom);

    const reverseShape = h.create();
    const stopDraft = registerCanvasDraft(editor, () => ({ id: reverseShape.id, props: reverseShape.props }));
    assert.equal(switchDrawingPage(editor, first), false);
    assert.equal(addDrawingPage(editor, 'While drawing'), false);
    stopDraft();
    const saved = structuredClone(captureCanvasDocument(editor));
    h.tl.loadSnapshot(editor.store, saved);
    editor.updateInstanceState({ isReadonly: true });
    assert.equal(switchDrawingPage(editor, first), true);
    assert.deepEqual([...editor.getCurrentPageShapeIds()], [shape.id]);
    assert.deepEqual(readDrawingPageSize(editor), a4);
    assert.equal(switchDrawingPage(editor, second), true);
    assert.equal(editor.getCurrentPage().name, 'Panel back');
    assert.deepEqual([...editor.getCurrentPageShapeIds()], [reverseShape.id]);
    assert.deepEqual(readDrawingPageSize(editor), custom);
    assert.equal(addDrawingPage(editor, 'Protected'), false);
    assert.equal(saveDrawingPage(editor, 'Protected', null), false);
  }));

  it('exports SVG and PNG to the active sheet and trims objects at the sheet edge', async () => harness(async h => nativeRasterApis(h, async () => {
    const { addDrawingPage, saveDrawingPage } = await import('../../src/lib/components/canvas/drawing-pages');
    const { exportDrawingArtwork } = await import('../../src/lib/components/canvas/drawing-artwork-export');
    const editor = h.editor, signal = new AbortController().signal;
    const size = { widthMm: 25.4, heightMm: 12.7 };
    const options = { ...exportOptions, scope: 'page' as const, padding: 24 };
    const rectangle = (x: number, y: number, fill: string) =>
      h.create([h.rectangle(0, 0, 40, 20)], { stroke: 'none', fill, fillOpacity: 1 }, { x, y });
    rectangle(8, 8, '#0000ff');
    assert.equal(addDrawingPage(editor, 'Cut sheet'), true);
    assert.equal(saveDrawingPage(editor, 'Cut sheet', size), true);
    const partial = rectangle(80, 16, '#ff0000'), outside = rectangle(150, 16, '#00ff00');
    editor.select(outside.id);
    const before = h.snapshot();
    const svg = await exportDrawingArtwork(editor, 'svg', options, signal);
    assert.deepEqual(svg.physical, size);
    assert.deepEqual(svg.plan.ids, [partial.id]);
    const contents = await svg.blob.text();
    const root = new DOMParser().parseFromString(contents, 'image/svg+xml').documentElement;
    assert.equal(root.getAttribute('width'), '25.4mm');
    assert.equal(root.getAttribute('height'), '12.7mm');
    assert.equal(root.getAttribute('viewBox'), '0 0 96 48');
    assert.equal(root.querySelector('clipPath#oms-export-page rect')?.getAttribute('width'), '96');
    assert.ok(root.querySelector('g[clip-path="url(#oms-export-page)"] path'));
    assert.ok(!contents.includes('#00ff00'));
    assert.ok(!contents.includes('#0000ff'));
    const png = await exportDrawingArtwork(editor, 'png', { ...options, scale: 2 }, signal);
    assert.deepEqual([png.width, png.height, png.reduced], [192, 96, false]);
    const sharp = createRequire(`${process.cwd()}/package.json`)('sharp');
    const image = Buffer.from(await png.blob.arrayBuffer());
    const pixel = (left: number, top: number) => sharp(image).ensureAlpha().extract({ left, top, width: 1, height: 1 }).raw().toBuffer();
    assert.deepEqual([...await pixel(191, 40)], [255, 0, 0, 255]);
    assert.equal((await pixel(25, 40))[3], 0);
    assert.deepEqual(h.snapshot(), before);
  })));
});

describe('portable artwork export through native SVG and PNG APIs', () => {
  it('places local symbol instances as independent, full-size cutting curves', async () => harness(async h => {
    const { exportDrawingArtwork } = await import('../../src/lib/components/canvas/drawing-artwork-export');
    const { readVectorSvg } = await import('../../src/lib/components/canvas/cad-svg-import');
    const { prepareVectorImport } = await import('../../src/lib/components/canvas/cad-vector');
    const { applyCadPlan } = await import('../../src/lib/components/canvas/cad-plans');
    const { buildCadDxf } = await import('../../src/lib/components/canvas/cad-dxf');
    const imported = readVectorSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
      <defs><symbol id="letter" viewBox="0 0 20 10"><path fill-rule="evenodd"
        d="M0 0C5 0 15 0 20 0V10H0Z M5 3H15V7H5Z"/></symbol></defs>
      <use href="#letter" x="10" y="10" width="20" height="10" fill="#a31426"/>
      <use href="#letter" x="60" y="10" width="40" height="20" transform="rotate(30 60 10)" fill="#235897"/></svg>`);
    const plan = prepareVectorImport(h.editor, h.cad.DEFAULT_CAD_SETTINGS, imported.document, imported.widthMm, { x:0, y:0 }, 'Instances');
    assert.deepEqual(plan.warnings, []);
    assert.equal(applyCadPlan(h.editor, plan), true);
    const shapes = h.editor.getSelectedShapes();
    assert.equal(shapes.length, 2);
    assert.notEqual(shapes[0].id, shapes[1].id);
    assert.deepEqual(shapes.map((shape: any) => shape.meta.omsVectorPaint.fill), ['#a31426', '#235897']);
    assert.deepEqual(shapes.map((shape: any) => shape.props.contours.length), [2,2]);
    near(h.curves.curveBounds(shapes[0].props.contours).w * 25.4 / 96, 20);
    const [start, end] = shapes[1].props.contours[0].nodes;
    near(Math.hypot(end.x - start.x, end.y - start.y) * 25.4 / 96, 40);
    assert.ok(shapes.every((shape: any) => !shape.meta.omsVectorPaint.clips));
    const dxf = buildCadDxf(h.editor, 'selected', h.cad.DEFAULT_CAD_SETTINGS);
    assert.equal(dxf.closedContours, 4);
    assert.deepEqual(dxf.omitted, []);
    const exported = await exportDrawingArtwork(h.editor, 'svg', { ...exportOptions, scope: 'selected' }, new AbortController().signal);
    const content = await exported.blob.text();
    assert.doesNotMatch(content, /<use\b|#letter/);
    near(readVectorSvg(content).widthMm, 50 + 40 * Math.cos(Math.PI / 6));
  }));

  it('reimports a full-size OMS SVG with a sharp gradient transition, cubic and hole geometry and exports its cutting curves', async () => harness(async h => {
    const { exportDrawingArtwork } = await import('../../src/lib/components/canvas/drawing-artwork-export');
    const { readVectorSvg } = await import('../../src/lib/components/canvas/cad-svg-import');
    const { prepareVectorImport } = await import('../../src/lib/components/canvas/cad-vector');
    const { applyCadPlan } = await import('../../src/lib/components/canvas/cad-plans');
    const { buildCadDxf } = await import('../../src/lib/components/canvas/cad-dxf');
    const { getGradientFillSettings } = await import('../../src/lib/components/canvas/gradient-fill');
    const outer = h.rectangle(0, 0, 160, 100);
    outer.nodes[0].outX = 48;
    outer.nodes[1].inX = -41;
    const gradient = { type: 'linear', matrix: [1, 0, 0, 1, 0, 0], start: [0, 0], end: [160, 100],
      r0: 0, r1: 0, stops: [{ offset: 0, color: '#007e5d' }, { offset: .5, color: '#007e5d' },
        { offset: .5, color: '#ac125f' }, { offset: 1, color: '#ac125f' }] };
    const source = h.create([outer, h.rectangle(50, 20, 60, 60)], { fill: 'none', stroke: 'none', gradient });
    h.editor.select(source.id);
    const svg = await exportDrawingArtwork(h.editor, 'svg', { ...exportOptions, scope: 'selected' }, new AbortController().signal);
    const imported = readVectorSvg(await svg.blob.text());
    near(imported.widthMm, svg.physical!.widthMm);
    assert.equal(imported.document.paths.length, 1);
    assert.deepEqual(imported.document.warnings, []);
    const plan = prepareVectorImport(h.editor, h.cad.DEFAULT_CAD_SETTINGS, imported.document, imported.widthMm, { x:350, y:150 }, 'Round trip');
    assert.equal(applyCadPlan(h.editor, plan), true);
    const result = h.editor.getOnlySelectedShape();
    assert.equal(result.props.fillRule, 'evenodd');
    assert.equal(result.props.contours.length, 2);
    near(result.props.contours[0].nodes[0].outX, 48);
    const appliedGradient = result.meta.omsVectorPaint.gradient;
    assert.deepEqual(appliedGradient.stops, gradient.stops);
    assert.deepEqual(getGradientFillSettings(h.editor)?.stops, gradient.stops);
    assert.deepEqual(appliedGradient.end, gradient.end);
    appliedGradient.matrix.slice(0, 4).forEach((value: number, i: number) => near(value, gradient.matrix[i]));
    near(appliedGradient.matrix[4], result.props.contours[0].nodes[0].x);
    near(appliedGradient.matrix[5], result.props.contours[0].nodes[0].y);
    const dxf = buildCadDxf(h.editor, 'selected', h.cad.DEFAULT_CAD_SETTINGS);
    assert.equal(dxf.closedContours, 2);
    assert.deepEqual(dxf.omitted, []);
  }));

  it('embeds authenticated order and Idea rasters, deduplicates repeated fills, and emits an uploadable SVG', async () => harness(async h => nativeRasterApis(h, async png => {
    const { exportDrawingArtwork } = await import('../../src/lib/components/canvas/drawing-artwork-export');
    const { normalizeOrderFile, matchesOrderFileSignature } = await import('../../src/lib/server/files/order-storage');
    const shapes = [material(h), material(h, 0, true), material(h, 1, false, true)];
    h.editor.select(...shapes.map(s => s.id));
    const before = h.snapshot(), calls: string[] = [];
    globalThis.fetch = async (url: any, init?: NonNullable<Parameters<typeof fetch>[1]>) => {
      calls.push(url); assert.equal(init?.credentials, 'same-origin'); assert.equal(init?.redirect, 'error'); assert.ok(init?.signal);
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    };
    const output = await exportDrawingArtwork(h.editor, 'svg', exportOptions, new AbortController().signal);
    const svg = await output.blob.text();
    assert.equal(calls.length, 2, 'the shared original is fetched once even for pattern and clipped images');
    assert.equal(output.blob.type, 'image/svg+xml');
    assert.equal(normalizeOrderFile(new File([output.blob], 'drawing.svg', { type: output.blob.type })).mime, 'image/svg+xml');
    assert.equal(matchesOrderFileSignature('svg', new Uint8Array(await output.blob.arrayBuffer())), true);
    assert.ok(!svg.includes('/api/')); assert.ok(svg.includes('data:image/png;base64,')); assert.ok(svg.includes('<pattern'));
    assert.deepEqual(h.snapshot(), before, 'export hydration never expands private bytes into the saved document');
    const sharp = createRequire(`${process.cwd()}/package.json`)('sharp');
    const pixel = await sharp(Buffer.from(svg)).resize(output.width, output.height).ensureAlpha().extract({ left: 50, top: 25, width: 1, height: 1 }).raw().toBuffer();
    assert.deepEqual([...pixel], [255, 0, 0, 255], 'self-contained SVG renders original pixels independently');
  })));

  it('rasterizes the hydrated SVG through the installed public PNG exporter at 1×, 2× and 4×', async () => harness(async h => nativeRasterApis(h, async png => {
    const { exportDrawingArtwork } = await import('../../src/lib/components/canvas/drawing-artwork-export');
    const { createCanvas, loadImage } = createRequire(`${process.cwd()}/package.json`)('@napi-rs/canvas');
    const shape = material(h); h.editor.select(shape.id);
    globalThis.fetch = async () => new Response(png, { headers: { 'content-type': 'image/png' } });
    for (const scale of [1, 2, 4] as const) {
      const output = await exportDrawingArtwork(h.editor, 'png', { ...exportOptions, scale }, new AbortController().signal);
      assert.equal(output.blob.type, 'image/png'); assert.equal(output.width, 100 * scale); assert.equal(output.height, 50 * scale); assert.equal(output.reduced, false);
      assert.equal(output.physical, undefined);
      const canvas = createCanvas(output.width, output.height), ctx = canvas.getContext('2d');
      ctx.drawImage(await loadImage(Buffer.from(await output.blob.arrayBuffer())), 0, 0);
      assert.deepEqual([...ctx.getImageData(50 * scale, 25 * scale, 1, 1).data], [255, 0, 0, 255]);
    }
  })));

  it('exports calibrated millimetres consistently with PDF/DXF, scaling explicit padding while preserving legacy pixels', async () => harness(async h => {
    const { exportDrawingArtwork, prepareDrawingArtworkSvg } = await import('../../src/lib/components/canvas/drawing-artwork-export');
    const { buildCadDxf } = await import('../../src/lib/components/canvas/cad-dxf');
    const { prepareVectorExport } = await import('../../src/lib/components/canvas/cad-vector-export');
    const shape = h.create([h.rectangle(0, 0, 100, 50)], { fill: '#000000', stroke: 'none' }); h.editor.select(shape.id);
    const settings = { ...h.cad.DEFAULT_CAD_SETTINGS, unit: 'in', scale: 10 }; h.editor.updatePage({ id: h.editor.getCurrentPageId(), meta: { omsCad: settings } });
    const output = await exportDrawingArtwork(h.editor, 'svg', exportOptions, new AbortController().signal), svg = new DOMParser().parseFromString(await output.blob.text(), 'image/svg+xml').documentElement;
    const dxf = buildCadDxf(h.editor, 'selected', settings), pdf = prepareVectorExport(h.editor, settings, 'selected', 'pdf');
    near(parseFloat(svg.getAttribute('width')!), dxf.widthMm); near(h.curves.curveBounds(pdf.paths[0].contours).w * 25.4 / 72, dxf.widthMm);
    assert.ok(svg.getAttribute('width')!.endsWith('mm')); assert.equal(svg.getAttribute('viewBox'), '100 100 100 50');
    const padded = await prepareDrawingArtworkSvg(h.editor, 'svg', { ...exportOptions, padding: 24 }, new AbortController().signal);
    near(padded.physical!.widthMm, 148 * h.cad.cadMmPerPixel(settings)); near(padded.physical!.heightMm, 98 * h.cad.cadMmPerPixel(settings));
    assert.equal(new DOMParser().parseFromString(padded.svg, 'image/svg+xml').documentElement.getAttribute('viewBox'), '76 76 148 98');
    const png = await prepareDrawingArtworkSvg(h.editor, 'png', { ...exportOptions, scale: 4 }, new AbortController().signal);
    assert.equal(png.physical, undefined); assert.equal(new DOMParser().parseFromString(png.svg, 'image/svg+xml').documentElement.getAttribute('width'), '200');
    h.editor.updatePage({ id: h.editor.getCurrentPageId(), meta: {} });
    const legacy = await exportDrawingArtwork(h.editor, 'svg', exportOptions, new AbortController().signal);
    assert.equal(legacy.physical, undefined); assert.equal(new DOMParser().parseFromString(await legacy.blob.text(), 'image/svg+xml').documentElement.getAttribute('width'), '100');
  }));

  it('exports the same physical text em from an exact point-size edit at four document scales', async () => harness(async h => {
    const { prepareDrawingArtworkSvg } = await import('../../src/lib/components/canvas/drawing-artwork-export');
    const { applySelectedDrawingTextStyle } = await import('../../src/lib/components/canvas/drawing-text-style');
    const { installDrawingTextUtil } = await import('../../src/lib/components/canvas/shapes/DrawingTextShape');
    const { svgTransform, svgViewport } = await import('../../src/lib/components/canvas/cad-svg-coordinates');
    const { multiplyMatrix } = await import('../../src/lib/components/canvas/cad-appearance');
    Object.defineProperty(document, 'fonts', { configurable: true, value: new Set() });
    // Deterministic layout supplies spans; the real native SVG exporter still
    // owns font-size, nested transforms and physical viewport serialization.
    h.editor.textMeasure.measureText = (text: string, options: any) => ({ x: 0, y: 0,
      w: options.maxWidth ?? Math.max(1, text.length) * options.fontSize / 2,
      h: options.fontSize * options.lineHeight, scrollWidth: text.length * options.fontSize / 2 });
    h.editor.textMeasure.measureTextSpans = (text: string, options: any) => [{ text, box: {
      x: 0, y: 0, w: text.length * options.fontSize / 2, h: options.fontSize * options.lineHeight } }];
    installDrawingTextUtil(h.editor);
    for (const [scale, unit] of [[.1, 'mm'], [1, 'in'], [10, 'cm'], [1000, 'm']] as const) {
      h.editor.updatePage({ id: h.editor.getCurrentPageId(), meta: { omsCad: { ...h.cad.DEFAULT_CAD_SETTINGS, scale, unit } } });
      const id = h.tl.createShapeId();
      h.editor.createShape({ id, type: 'text', x: 100, y: 100, props: { text: '72 pt', font: 'sans', size: 'm', autoSize: true } });
      h.editor.select(id);
      assert.equal(applySelectedDrawingTextStyle(h.editor, [id], { pointSize: 72 }), true);
      const before = h.snapshot();
      const output = await prepareDrawingArtworkSvg(h.editor, 'svg', exportOptions, new AbortController().signal);
      const root = new DOMParser().parseFromString(output.svg, 'image/svg+xml').documentElement;
      const texts = [...root.querySelectorAll('text')];
      assert.ok(texts.length, 'the exported file contains the live text');
      for (const text of texts) {
        let transform = svgTransform(text.getAttribute('transform'));
        for (let parent = text.parentElement; parent && parent !== root; parent = parent.parentElement)
          transform = multiplyMatrix(svgTransform(parent.getAttribute('transform')), transform);
        transform = multiplyMatrix(svgViewport(root).matrix, transform);
        const emMm = Number(text.getAttribute('font-size')) * Math.hypot(transform[2], transform[3]) * 25.4 / 96;
        near(emMm, 25.4); // 72 physical points = one inch, independent of calibration.
      }
      assert.deepEqual(h.snapshot(), before, 'export does not rewrite the text or page calibration');
      h.editor.deleteShapes([id]);
    }
  }));

  it('exports exact physical dimension lettering and stable line widths independently of the camera', async () => harness(async h => {
    const { prepareDrawingArtworkSvg } = await import('../../src/lib/components/canvas/drawing-artwork-export');
    const { createCadDimension } = await import('../../src/lib/components/canvas/cad-geometry');
    const defaults = await import('../../src/lib/components/canvas/cad-dimension-defaults');
    const { DRAWING_CAMERA_OPTIONS } = await import('../../src/lib/components/canvas/drawing-camera');
    const settings = { ...h.cad.DEFAULT_CAD_SETTINGS, unit: 'in', scale: 10 };
    h.editor.updatePage({ id: h.editor.getCurrentPageId(), meta: { omsCad: settings } });
    h.editor.setCameraOptions(DRAWING_CAMERA_OPTIONS);
    assert.equal(defaults.writeDimensionDefaults(h.editor, defaults.dimensionDefaultsRevision(h.editor), {
      ...defaults.DEFAULT_CAD_DIMENSION_DEFAULTS, mode: 'physical', textHeightMm: 3.5, offsetMm: 8,
    }), true);
    const source = h.create([h.rectangle(0, 0, 100, 50)]);
    h.editor.select(source.id);
    assert.equal(createCadDimension(h.editor, settings, 'horizontal'), true);
    const before = h.snapshot();
    const appearance: string[] = [];
    for (const zoom of [.025, 1, 4]) {
      h.editor.setCamera({ x: 0, y: 0, z: zoom });
      const output = await prepareDrawingArtworkSvg(h.editor, 'svg', exportOptions, new AbortController().signal);
      const root = new DOMParser().parseFromString(output.svg, 'image/svg+xml').documentElement;
      const dimension = root.querySelector('[data-dimension-state]');
      const text = dimension?.querySelector('text');
      assert.ok(dimension && text, 'the native exporter retains the dimension annotation');
      const viewWidth = Number(root.getAttribute('viewBox')!.split(/\s+/)[2]);
      const mmPerUnit = parseFloat(root.getAttribute('width')!) / viewWidth;
      near(Number(text.getAttribute('font-size')) * mmPerUnit, 3.5);
      assert.equal(dimension.querySelector('[vector-effect="non-scaling-stroke"]'), null,
        'the exported line must not depend on the viewing viewport');
      appearance.push(dimension.outerHTML);
      assert.deepEqual(h.snapshot(), before);
    }
    assert.equal(appearance[0], appearance[1]); assert.equal(appearance[1], appearance[2]);
  }));

  it('rejects missing, mismatched and corrupt originals instead of returning a successful export', async () => harness(async h => nativeRasterApis(h, async png => {
    const { exportDrawingArtwork } = await import('../../src/lib/components/canvas/drawing-artwork-export');
    const shape = material(h); h.editor.select(shape.id);
    const attempt = () => exportDrawingArtwork(h.editor, 'svg', exportOptions, new AbortController().signal);
    globalThis.fetch = async () => new Response('Denied', { status: 403 }); await assert.rejects(attempt, /asset-fetch/);
    globalThis.fetch = async () => new Response(png, { headers: { 'content-type': 'text/html' } }); await assert.rejects(attempt, /asset-fetch/);
    const mismatch = png.slice(); new DataView(mismatch.buffer).setUint32(16, 3);
    globalThis.fetch = async () => new Response(mismatch, { headers: { 'content-type': 'image/png' } }); await assert.rejects(attempt, /asset-fetch/);
    globalThis.fetch = async () => new Response(png.slice(0, 24), { headers: { 'content-type': 'image/png' } }); await assert.rejects(attempt, /asset-fetch/);
  })));

  it('stops at declared and streamed byte limits, including the aggregate across distinct originals', async () => harness(async h => nativeRasterApis(h, async png => {
    const { exportDrawingArtwork, DRAWING_EXPORT_ASSET_BYTES, DRAWING_EXPORT_TOTAL_ASSET_BYTES } = await import('../../src/lib/components/canvas/drawing-artwork-export');
    const shapes = [material(h), material(h, 1), material(h, 2)]; h.editor.select(shapes[0].id);
    const attempt = () => exportDrawingArtwork(h.editor, 'svg', exportOptions, new AbortController().signal);
    globalThis.fetch = async () => new Response(png, { headers: { 'content-type': 'image/png', 'content-length': String(DRAWING_EXPORT_ASSET_BYTES + 1) } });
    await assert.rejects(attempt, /limit/);
    let cancelled = false;
    globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(DRAWING_EXPORT_ASSET_BYTES + 1)); }, cancel() { cancelled = true; } }), { headers: { 'content-type': 'image/png' } });
    await assert.rejects(attempt, /limit/); assert.equal(cancelled, true, 'body reading is cancelled as soon as its limit is crossed');
    // PNG decoders accept ancillary trailing data. It counts toward memory use,
    // so three valid originals can still exceed the total export allowance.
    const large = new Uint8Array(DRAWING_EXPORT_ASSET_BYTES); large.set(png);
    h.editor.select(...shapes.map(s => s.id)); let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(large, { headers: { 'content-type': 'image/png', 'content-length': String(large.length) } }); };
    await assert.rejects(attempt, /limit/); assert.equal(calls, Math.floor(DRAWING_EXPORT_TOTAL_ASSET_BYTES / large.length) + 1);
  })));

  it('discards exports after selection, paint, calibration or asset revisions, and propagates cancellation', async () => harness(async h => nativeRasterApis(h, async png => {
    const { exportDrawingArtwork } = await import('../../src/lib/components/canvas/drawing-artwork-export');
    const shape = material(h); h.editor.select(shape.id);
    const attempt = (signal = new AbortController().signal) => exportDrawingArtwork(h.editor, 'svg', exportOptions, signal);
    for (const change of [() => h.editor.selectNone(), () => h.editor.updateShape({ id: shape.id, type: shape.type, x: 25 }),
      () => h.editor.updatePage({ id: h.editor.getCurrentPageId(), meta: { omsCad: { ...h.cad.DEFAULT_CAD_SETTINGS, scale: 10 } } }),
      () => h.editor.createAssets([{ id: h.tl.AssetRecordType.createId(), typeName: 'asset', type: 'image', meta: {}, props: { name: 'changed', src: 'data:image/png;base64,eA==', w: 1, h: 1, mimeType: 'image/png', isAnimated: false } }])]) {
      h.editor.select(shape.id);
      globalThis.fetch = async () => { change(); return new Response(png, { headers: { 'content-type': 'image/png' } }); };
      await assert.rejects(() => attempt(), /stale/);
    }
    h.editor.select(shape.id); const controller = new AbortController();
    globalThis.fetch = async (_url: any, init?: NonNullable<Parameters<typeof fetch>[1]>) => { controller.abort(); assert.equal(init!.signal!.aborted, true); throw new DOMException('Aborted', 'AbortError'); };
    await assert.rejects(() => attempt(controller.signal), /cancelled/);
    let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('must not fetch'); };
    await assert.rejects(() => attempt(controller.signal), /cancelled/); assert.equal(calls, 0);
  })));
});


describe('production vector PDF and EPS', () => {
  it('publishes the active sheet at trim size and only includes art reaching its bleed', async () => harness(async h => {
    const { prepareVectorExport } = await import('../../src/lib/components/canvas/cad-vector-export');
    const { prepareVectorExportWithAssets } = await import('../../src/lib/components/canvas/cad-vector-export-client');
    const { addDrawingPage, saveDrawingPage } = await import('../../src/lib/components/canvas/drawing-pages');
    const settings = { ...h.cad.DEFAULT_CAD_SETTINGS, scale: 4 / 3, originX: 350, originY: 490 };
    h.cad.writeCadSettings(h.editor, settings);
    const colored = (x: number, width: number, fill: string) =>
      h.create([h.rectangle(0, 0, width, 12)], { fill, stroke: 'none' }, { x, y: 6 });
    colored(10, 20, '#0000ff');
    assert.throws(() => prepareVectorExport(h.editor, settings, { pageBleedMm: 0 }, 'pdf'), /sheet-size/);
    assert.equal(addDrawingPage(h.editor, 'Sign face'), true);
    const size = { widthMm: 25.4, heightMm: 12.7 };
    assert.equal(saveDrawingPage(h.editor, 'Sign face', size), true);
    assert.equal(h.cad.writeCadSettings(h.editor, settings), true);
    colored(-10, 30, '#ff0000');
    colored(73, 10, '#00ff00'); // Reaches bleed, but lies outside the trim.
    const offPage = material(h, 1);
    h.editor.select(offPage.id);
    const scope = { pageBleedMm: 25.4 / 18 }; // Four PDF points.
    const before = h.snapshot(), signal = new AbortController().signal;
    assert.throws(() => prepareVectorExport(h.editor, settings, scope, 'eps'), /page-scope/);
    assert.throws(() => prepareVectorExport(h.editor, settings, { pageBleedMm: 51 }, 'pdf'), /bleed-range/);
    const trimmed = prepareVectorExport(h.editor, settings, { pageBleedMm: 0 }, 'pdf');
    assert.equal(trimmed.paths.length, 1);
    assert.match(trimmed.text, /\/MediaBox \[0 0 72 36\] \/TrimBox \[0 0 72 36\]/);
    const fetchBefore = globalThis.fetch;
    try {
      globalThis.fetch = async () => { throw new Error('off-sheet assets must not be fetched'); };
      const pdf = await prepareVectorExportWithAssets(h.editor, settings, scope, 'pdf', signal);
      assert.deepEqual(pdf.sheet, { ...size, bleedMm: scope.pageBleedMm });
      assert.deepEqual(pdf.paths.map((path: any) => path.paint.fill), ['#ff0000', '#00ff00']);
      assert.deepEqual(pdf.omitted, []);
      assert.match(pdf.text, /\/MediaBox \[0 0 80 44\] \/TrimBox \[4 4 76 40\] \/BleedBox \[0 0 80 44\]/);
      assert.match(pdf.text, /^0 0 80 44 re W n$/m);
      assert.deepEqual(h.snapshot(), before, 'publishing does not edit the saved drawing');
    } finally { globalThis.fetch = fetchBefore; }
    assert.equal(saveDrawingPage(h.editor, 'Oversize', { widthMm: 5080, heightMm: 297 }), true);
    h.editor.deleteShapes([offPage.id]);
    const large = prepareVectorExport(h.editor, settings, scope, 'pdf');
    assert.match(large.text, /\/UserUnit 10\b/);
    assert.deepEqual(large.sheet, { widthMm: 5080, heightMm: 297, bleedMm: scope.pageBleedMm });
    assert.equal(saveDrawingPage(h.editor, 'Beyond PDF limit', { widthMm: 50800, heightMm: 297 }), true);
    assert.throws(() => prepareVectorExport(h.editor, settings, scope, 'pdf', true), /page-limit/);
  }));

  it('preserves frame and shape clips, the counter, inherited opacity and physical bounds', async () => harness(async h => {
    const { prepareVectorExport } = await import('../../src/lib/components/canvas/cad-vector-export');
    const { buildCadDxf } = await import('../../src/lib/components/canvas/cad-dxf');
    const settings = { ...h.cad.DEFAULT_CAD_SETTINGS, scale: 4 / 3 };
    h.editor.updatePage({ id: h.editor.getCurrentPageId(), meta: { omsCad: settings } });
    const frame = h.tl.createShapeId();
    h.editor.createShape({ id: frame, type: 'frame', x: 100, y: 100, opacity: .5, props: { w: 120, h: 80 } });
    const artwork = h.create([h.rectangle(-10, -20, 140, 120), h.curves.arcContour(60, 40, 12, 12, 0, Math.PI * 2)], {
      fill: '#d62828', stroke: 'none', clips: [{ contours: [h.rectangle(20, -10, 80, 100)], fillRule: 'nonzero' }]
    }, { parentId: frame, x: 0, y: 0 });
    const hidden = h.create([h.rectangle(0, 0, 20, 20)], { fill: '#0033ff', stroke: 'none' }, { parentId: frame, x: 200, y: 200 });
    h.editor.select(artwork.id, hidden.id);
    const before = h.snapshot(), pdf = prepareVectorExport(h.editor, settings, 'selected', 'pdf');
    assert.equal(pdf.paths.length, 1);
    assert.equal(pdf.omitted.length, 1);
    assert.equal(pdf.paths[0].fillRule, 'evenodd');
    assert.equal(pdf.paths[0].contours.length, 2);
    assert.equal(pdf.paths[0].paint.clips.length, 2);
    near(pdf.paths[0].paint.fillOpacity, .5);
    assert.match(pdf.text, /\/MediaBox \[0 0 80\.02 80\.02\]/);
    const eps = prepareVectorExport(h.editor, settings, 'selected', 'eps');
    assert.equal(eps.omitted.length, 2);
    assert.equal(eps.text, '');
    const dxf = buildCadDxf(h.editor, 'selected', settings);
    assert.equal(dxf.entities, 0);
    assert.deepEqual(dxf.omitted.map(item => item.reason), ['clipped', 'clipped']);
    assert.deepEqual(h.snapshot(), before);
  }));

  it('uses each visible stroke to bound the page and never turns a zero-width stroke into a hairline', async () => harness(async h => {
    const { prepareVectorExport } = await import('../../src/lib/components/canvas/cad-vector-export');
    const settings = { ...h.cad.DEFAULT_CAD_SETTINGS, scale: 4 / 3 };
    const stroke = h.create([h.contour([[0, 0], [100, 0]])], { strokeWidth: 40, strokeOpacity: 1 });
    const face = h.create([h.rectangle(0, 0, 100, 20)], { fill: '#33aaff', strokeWidth: 0, strokeOpacity: .2 }, { x: 300, y: 90 });
    const outline = h.create([h.contour([[0, 0], [100, 0]])], { strokeWidth: 0 }, { x: 1000, y: 100 });
    const invisible = h.create([h.rectangle(0, 0, 100, 100)], { fill: '#ff0000', stroke: 'none' }, { x: 1200, opacity: 0 });
    h.editor.select(stroke.id, face.id, outline.id, invisible.id);
    for (const format of ['svg', 'png'] as const) {
      const result = h.planDrawingExport(h.editor, format, { scope: 'selected', scale: 1, background: false, padding: 0 });
      assert.equal(result.ok, true);
      assert.deepEqual(result.value.bounds, { x: 80, y: 80, w: 320, h: 40 });
      assert.deepEqual(result.value.ids, [stroke.id, face.id]);
    }
    for (const format of ['pdf', 'eps'] as const) {
      const output = prepareVectorExport(h.editor, settings, 'selected', format);
      assert.equal(output.paths.length, 2);
      assert.equal(output.omitted.length, 2);
      if (format === 'pdf') {
        assert.match(output.text, /\/MediaBox \[0 0 320\.02 40\.02\]/);
        assert.equal(output.text.match(/^S$/gm)?.length, 1);
        assert.match(output.text, /^f\*$/m);
      } else {
        assert.match(output.text, /%%HiResBoundingBox: 0 0 320\.02 40\.02/);
        assert.equal(output.text.match(/setrgbcolor stroke/g)?.length, 1);
      }
    }
  }));

  it('retains stroke ink that reaches a native frame from an outside centerline', async () => harness(async h => {
    const { prepareVectorExport } = await import('../../src/lib/components/canvas/cad-vector-export');
    const settings = { ...h.cad.DEFAULT_CAD_SETTINGS, scale: 4 / 3 };
    const frame = h.tl.createShapeId();
    h.editor.createShape({ id: frame, type: 'frame', x: 100, y: 100, props: { w: 120, h: 80 } });
    const stroke = h.create([h.contour([[0, 0], [100, 0]])], { strokeWidth: 40, strokeOpacity: 1 },
      { parentId: frame, x: 0, y: -10 });
    assert.equal(h.editor.getShapeMaskedPageBounds(stroke.id), undefined);
    h.editor.select(stroke.id);
    const output = prepareVectorExport(h.editor, settings, 'selected', 'pdf');
    assert.deepEqual(output.omitted, []);
    assert.equal(output.paths[0].paint.clips.length, 1);
    assert.match(output.text, /\/MediaBox \[0 0 120\.02 10\.02\]/);
  }));

});
