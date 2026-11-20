import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import DxfParser from 'dxf-parser';
import type { CadPlan } from '../../src/lib/components/canvas/cad-plans';
import type { VectorDocument } from '../../src/lib/components/canvas/cad-paint';

const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (actual: number, expected: number, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

/** Actual Editor, group utilities, history, schema, node commands and exporters.
 * No browser rendering, pointer hardware or raster-fitting claim is made here. */
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
    'SVGElement', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'DOMRect', 'MutationObserver', 'Image', 'localStorage'])
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
  const source = await import('../../src/lib/components/canvas/cad-trace-source');
  const plans = await import('../../src/lib/components/canvas/cad-plans');
  const vector = await import('../../src/lib/components/canvas/cad-vector');
  const curves = await import('../../src/lib/components/canvas/cad-curves');
  const cad = await import('../../src/lib/components/canvas/cad-settings');
  const editing = await import('../../src/lib/components/canvas/cad-editing');
  const nodes = await import('../../src/lib/components/canvas/cad-node-selection');
  const dxf = await import('../../src/lib/components/canvas/cad-dxf');
  const pdf = await import('../../src/lib/components/canvas/cad-vector-export');
  const pdfImport = await import('../../src/lib/components/canvas/cad-pdf');
  const { CadBezierShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadBezierShape');
  class AttachmentCard extends tl.BaseBoxShapeUtil<any> {
    static override type = 'document';
    static override props = { w: tl.T.number, h: tl.T.number, title: tl.T.string, kind: tl.T.string, url: tl.T.string,
      mime: tl.T.string, fileId: tl.T.string, fit: tl.T.string, opacity: tl.T.number };
    getDefaultProps() { return { w: 240, h: 300, title: 'Image', kind: 'image', url: '/api/files/centerline-image/download', mime: 'image/png', fileId: '', fit: 'contain', opacity: 100 }; }
    component() { return null; } indicator() { return null; }
  }
  const host = document.createElement('div'); document.body.append(host);
  const shapeUtils = [...tl.defaultShapeUtils, CadBezierShapeUtil, AttachmentCard];
  const editor = new tl.Editor({ store: tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }), shapeUtils,
    bindingUtils: tl.defaultBindingUtils, tools: [...tl.defaultTools, ...tl.defaultShapeTools], getContainer: () => host, initialState: 'select' });
  editor.updateViewportScreenBounds(new tl.Box(0, 0, 800, 600));
  editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS } } });
  const line = (a: number[], b: number[]) => ({ closed: false, nodes: [a, b].map(([x, y]) => curves.nodeAt({ x, y })) });
  const rectangle = (x: number, y: number, w: number, h: number) => ({ closed: true,
    nodes: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([x, y]) => curves.nodeAt({ x, y })) });
  const documentFixture = (): VectorDocument => {
    const curved = line([12, 32], [72, 32]); curved.nodes[0].outX = 18; curved.nodes[0].outY = -18;
    curved.nodes[1].inX = -18; curved.nodes[1].inY = 18;
    return { width: 128, height: 64, warnings: ['trace-approximation'], paths: [
      { contours: [curved, line([72, 32], [105, 8]), line([72, 32], [105, 56])], fillRule: 'nonzero',
        paint: { ...vector.VECTOR_DEFAULT_PAINT, fill: 'none', stroke: '#000000', strokeOpacity: .8, dash: [] } },
      { contours: [curves.arcContour(116, 32, 7, 7, 0, 2 * Math.PI)], fillRule: 'nonzero',
        paint: { ...vector.VECTOR_DEFAULT_PAINT, fill: 'none', stroke: '#303030', strokeOpacity: .6, dash: [] } },
    ] };
  };
  const filePlan = (doc = documentFixture(), widthMm = .25, settings = cad.DEFAULT_CAD_SETTINGS): CadPlan => source.styleCenterlineTracePlan(
    source.prepareRasterTraceFilePlan(editor, settings, doc, doc.width * cad.cadMmPerPixel(settings), 'Centerline',
      { originalWidth: doc.width, originalHeight: doc.height }), settings, widthMm);
  const imageFixture = () => {
    const parent = tl.createShapeId('centerline-parent'), bitmap = tl.createShapeId('centerline-source');
    editor.createShapes([{ id: parent, type: 'group', x: 130, y: 70, rotation: .4, opacity: .5 },
      { id: bitmap, type: 'image', parentId: parent, x: 25, y: 15, rotation: -.2, opacity: .6,
        props: { w: 256, h: 96, flipX: true, flipY: true } }]);
    editor.select(bitmap); editor.mark('centerline-image-fixture');
    return { parent, bitmap };
  };
  const snapshot = () => structuredClone(editor.store.getStoreSnapshot('document'));
  const children = (group: any) => editor.getSortedChildIdsForParent(group.id).map(id => editor.getShape(id));
  try { await run({ editor, tl, source, plans, vector, curves, cad, editing, nodes, dxf, pdf, pdfImport, shapeUtils,
    line, rectangle, documentFixture, filePlan, imageFixture, snapshot, children }); }
  finally {
    editor.dispose(); host.remove(); channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
}

async function readPdf(text: string, interpret: any) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  const task = pdfjs.getDocument({ data: new TextEncoder().encode(text), isEvalSupported: false, verbosity: 0 });
  try {
    const document = await task.promise, page = await document.getPage(1), list = await page.getOperatorList();
    return { document: interpret(list, pdfjs.OPS, page.getViewport({ scale: 1 })), list, ops: pdfjs.OPS };
  } finally { await task.destroy(); }
}

describe('physical centerline output styling', () => {
  it('sets an explicit mm width after placement and copies metadata without changing geometry, alpha, clips or revision', async () => harness(h => {
    const { editor, source, vector, cad, documentFixture, rectangle, snapshot } = h;
    const doc = documentFixture(); doc.paths[0].paint.clips = [{ contours: [rectangle(0, 0, 128, 64)], fillRule: 'evenodd' }];
    const plan = vector.prepareVectorImport(editor, cad.DEFAULT_CAD_SETTINGS, doc, 200, { x: 10, y: 20 }, 'Centerline');
    plan.shapes[0].meta.extra = { values: ['retained'] };
    const original = structuredClone(plan), before = snapshot();
    for (const scale of [.001, 1, 50, 10000]) {
      const settings = { ...cad.DEFAULT_CAD_SETTINGS, scale, unit: 'in' }, result = source.styleCenterlineTracePlan(plan, settings, .25);
      assert.equal(result.revision, plan.revision); assert.equal(result.contours, plan.contours); assert.equal(result.shapes[0].props, plan.shapes[0].props);
      result.shapes.forEach((shape: any, index: number) => {
        near(shape.meta.omsVectorPaint.strokeWidth * cad.cadMmPerPixel(settings), .25);
        assert.equal(shape.meta.omsVectorPaint.lineCap, 'round'); assert.equal(shape.meta.omsVectorPaint.lineJoin, 'round');
        assert.equal(shape.meta.omsVectorPaint.strokeOpacity, plan.shapes[index].meta.omsVectorPaint.strokeOpacity);
        assert.deepEqual(shape.meta.omsVectorPaint.clips, plan.shapes[index].meta.omsVectorPaint.clips);
      });
      result.shapes[0].meta.extra.values.push('edited copy'); result.shapes[0].meta.omsVectorPaint.clips[0].contours[0].nodes[0].x++;
      assert.deepEqual(plan, original);
    }
    assert.deepEqual(snapshot(), before);
  }));

  it('rejects invalid physical widths, oversized canvas widths and non-stroke artwork without mutation', async () => harness(h => {
    const { source, cad, filePlan, snapshot } = h;
    const plan = filePlan(), original = structuredClone(plan), before = snapshot();
    for (const width of [0, -.1, .0009, 1000.01, NaN, Infinity]) assert.throws(() => source.styleCenterlineTracePlan(plan, cad.DEFAULT_CAD_SETTINGS, width), /geometry/);
    assert.throws(() => source.styleCenterlineTracePlan(plan, { ...cad.DEFAULT_CAD_SETTINGS, scale: .001 }, 1000), /limit/);
    assert.throws(() => source.styleCenterlineTracePlan(plan, { ...cad.DEFAULT_CAD_SETTINGS, scale: 0 }, .25), /geometry/);
    for (const width of [.001, 1000]) near(source.styleCenterlineTracePlan(plan, cad.DEFAULT_CAD_SETTINGS, width).shapes[0].meta.omsVectorPaint.strokeWidth * cad.cadMmPerPixel(cad.DEFAULT_CAD_SETTINGS), width);
    for (const paint of [{ fill: '#000000' }, { stroke: 'none' }, { strokeOpacity: NaN },
      { raster: { width: 1, height: 1, png: 'data:image/png;base64,iVBORw0KGgoAAAAA', rgb: 'AAAA', matrix: [1, 0, 0, 1, 0, 0] } },
      { gradient: { type: 'linear', start: [0, 0], end: [1, 0], r0: 0, r1: 1, matrix: [1, 0, 0, 1, 0, 0], stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }] } }]) {
      const invalid = structuredClone(plan); Object.assign(invalid.shapes[0].meta.omsVectorPaint, paint);
      assert.throws(() => source.styleCenterlineTracePlan(invalid, cad.DEFAULT_CAD_SETTINGS, .25), /geometry/);
    }
    const invalidGeometry = structuredClone(plan); invalidGeometry.shapes[0].props.contours = [];
    assert.throws(() => source.styleCenterlineTracePlan(invalidGeometry, cad.DEFAULT_CAD_SETTINGS, .25), /geometry/);
    assert.throws(() => source.styleCenterlineTracePlan({ ...plan, shapes: [] }, cad.DEFAULT_CAD_SETTINGS, .25), /geometry/);
    assert.deepEqual(plan, original); assert.deepEqual(snapshot(), before);
  }));

  for (const attachment of [false, true]) it(`restores original thin-image aspect while keeping physical stroke width for ${attachment ? 'an attached image' : 'a file'}`, async () => harness(h => {
    const { editor, tl, source, plans, cad, vector, line, snapshot } = h;
    const settings = { ...cad.DEFAULT_CAD_SETTINGS, scale: 4 }, widthMm = 100, canvasWidth = widthMm / cad.cadMmPerPixel(settings);
    const doc: VectorDocument = { width: 2048, height: 7, warnings: [], paths: [{ contours: [line([0, 0], [2048, 7])], fillRule: 'nonzero',
      paint: { ...vector.VECTOR_DEFAULT_PAINT, strokeOpacity: .8, dash: [] } }] };
    const originalSize = { originalWidth: 3010, originalHeight: 11 };
    let card: any;
    if (attachment) {
      const id = tl.createShapeId('centerline-card'); editor.createShape({ id, type: 'document', x: 20, y: 30, opacity: .2, props: { fit: 'cover', opacity: 30 } });
      editor.select(id); card = editor.getShape(id);
    }
    const before = snapshot(), placed = attachment
      ? source.prepareAttachedRasterTracePlan(editor, settings, doc, widthMm, originalSize)
      : source.prepareRasterTraceFilePlan(editor, settings, doc, widthMm, 'Centerline', originalSize);
    const plan = source.styleCenterlineTracePlan(placed, settings, .8), nodes = plan.contours[0].nodes;
    near(nodes[1].x - nodes[0].x, canvasWidth); near(nodes[1].y - nodes[0].y, canvasWidth * 11 / 3010);
    near(plan.shapes[0].meta.omsVectorPaint.strokeWidth * cad.cadMmPerPixel(settings), .8);
    near(plan.shapes[0].meta.omsVectorPaint.strokeOpacity, .8); assert.equal(plan.shapes[0].opacity, 1);
    if (attachment) { near(nodes[0].x, card.x + card.props.w + 24); near(nodes[0].y, card.y); assert.deepEqual(plan.removeIds, []); }
    assert.equal(plans.applyCadPlan(editor, plan), true); assert.equal(editor.getOnlySelectedShape().type, 'cad-bezier');
    if (attachment) assert.deepEqual(editor.getShape(card.id), card);
    editor.undo(); assert.deepEqual(snapshot(), before);
  }));
});

describe('native centerline placement, persistence and editing', () => {
  for (const replace of [false, true]) it(`keeps compound branches, loops, nested alpha and flipped image geometry with replacement ${replace}`, async () => harness(h => {
    const { editor, tl, source, plans, cad, documentFixture, imageFixture, snapshot, children, shapeUtils } = h;
    const fixture = imageFixture(), bitmap = editor.getShape(fixture.bitmap), parent = editor.getShape(fixture.parent), transform = editor.getShapePageTransform(bitmap);
    editor.updateInstanceState({ opacityForNextShape: .2 });
    const doc = documentFixture(), before = snapshot(), plan = { ...source.styleCenterlineTracePlan(
      source.prepareSelectedRasterTracePlan(editor, cad.DEFAULT_CAD_SETTINGS, doc, replace), cad.DEFAULT_CAD_SETTINGS, .25), groupResult: true, groupName: 'Trace' };
    assert.deepEqual(snapshot(), before); assert.equal(plans.applyCadPlan(editor, plan), true);
    const group = editor.getOnlySelectedShape(); assert.equal(group.type, 'group'); assert.equal(group.parentId, parent.id); assert.equal(group.opacity, 1);
    const output = children(group); assert.equal(output.length, 2); assert.equal(output[0].props.contours.length, 3);
    assert.ok(output[0].props.contours.every((c: any) => !c.closed)); assert.equal(output[1].props.contours[0].closed, true);
    output.forEach((shape: any, pi: number) => {
      assert.equal(shape.opacity, 1); assert.match(shape.meta.omsObjectName, /#(?:000000|303030)/); assert.doesNotMatch(shape.meta.omsObjectName, /none/);
      near(shape.meta.omsVectorPaint.strokeWidth * cad.cadMmPerPixel(cad.DEFAULT_CAD_SETTINGS), .25);
      near(shape.meta.omsVectorPaint.strokeOpacity * parent.opacity, doc.paths[pi].paint.strokeOpacity * bitmap.opacity * parent.opacity);
      const actualTransform = editor.getShapePageTransform(shape);
      shape.props.contours.forEach((contour: any, ci: number) => contour.nodes.forEach((node: any, ni: number) => {
        const original = doc.paths[pi].contours[ci].nodes[ni];
        for (const key of ['anchor', 'in', 'out']) {
          const dx = key === 'anchor' ? 0 : original[`${key}X`], dy = key === 'anchor' ? 0 : original[`${key}Y`];
          const expected = transform.applyToPoint({ x: (128 - original.x - dx) * 2, y: (64 - original.y - dy) * 1.5 });
          const actual = actualTransform.applyToPoint({ x: node.x + (key === 'anchor' ? 0 : node[`${key}X`]), y: node.y + (key === 'anchor' ? 0 : node[`${key}Y`]) });
          near(actual.x, expected.x); near(actual.y, expected.y);
        }
      }));
    });
    assert.equal(!!editor.getShape(fixture.bitmap), !replace); assert.deepEqual(editor.getShape(fixture.parent), parent);
    const after = snapshot(); editor.undo(); assert.deepEqual(snapshot(), before); editor.redo(); assert.deepEqual(snapshot(), after);
    const restored = tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }); restored.loadStoreSnapshot(JSON.parse(JSON.stringify(after)));
    for (const shape of [group, ...output]) assert.deepEqual(restored.get(shape.id), editor.store.get(shape.id));
  }));

  it('folds raster-fill opacity into stroke alpha and preserves reflected/sheared raster placement and clips', async () => harness(h => {
    const { editor, tl, source, plans, vector, curves, cad, documentFixture, rectangle, snapshot, children, dxf } = h;
    const parent = tl.createShapeId('raster-parent'), bitmap = tl.createShapeId('raster-source'), matrix = [-180, 50, 40, 90, 220, 15];
    const boundary = { closed: true, nodes: [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => curves.nodeAt({ x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] })) };
    const clip = { contours: [rectangle(0, 0, 300, 180)], fillRule: 'evenodd' };
    editor.createShapes([{ id: parent, type: 'group', x: 90, y: 50, rotation: .3, opacity: .5 },
      { id: bitmap, type: 'cad-bezier', parentId: parent, x: 15, y: 25, rotation: -.2, opacity: .6, props: { contours: [boundary] },
        meta: { omsVectorPaint: { ...vector.VECTOR_DEFAULT_PAINT, stroke: 'none', fillOpacity: .4, clips: [clip],
          raster: { width: 128, height: 64, png: 'data:image/png;base64,iVBORw0KGgoAAAAA', rgb: 'AAAA', matrix } } } }]);
    editor.select(bitmap); editor.mark('raster-centerline-fixture');
    const before = snapshot(), transform = editor.getShapePageTransform(bitmap), doc = documentFixture();
    const plan = { ...source.styleCenterlineTracePlan(source.prepareSelectedRasterTracePlan(editor, cad.DEFAULT_CAD_SETTINGS, doc, true), cad.DEFAULT_CAD_SETTINGS, 1.2), groupResult: true };
    assert.equal(plans.applyCadPlan(editor, plan), true);
    children(editor.getOnlySelectedShape()).forEach((shape: any, pi: number) => {
      const paint = shape.meta.omsVectorPaint, actualTransform = editor.getShapePageTransform(shape);
      near(paint.strokeOpacity, doc.paths[pi].paint.strokeOpacity * .6 * .4);
      near(paint.strokeOpacity * editor.getShape(parent).opacity, doc.paths[pi].paint.strokeOpacity * .6 * .4 * .5);
      near(paint.strokeWidth * cad.cadMmPerPixel(cad.DEFAULT_CAD_SETTINGS), 1.2);
      assert.equal(paint.clips.length, 1);
      const expectedClip = transform.applyToPoint(clip.contours[0].nodes[0]), actualClip = actualTransform.applyToPoint(paint.clips[0].contours[0].nodes[0]);
      near(actualClip.x, expectedClip.x); near(actualClip.y, expectedClip.y);
      const node = shape.props.contours[0].nodes[0], original = doc.paths[pi].contours[0].nodes[0];
      for (const key of ['anchor', 'in', 'out']) {
        const x = (original.x + (key === 'anchor' ? 0 : original[`${key}X`])) / doc.width;
        const y = (original.y + (key === 'anchor' ? 0 : original[`${key}Y`])) / doc.height;
        const expected = transform.applyToPoint({ x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] });
        const actual = actualTransform.applyToPoint({ x: node.x + (key === 'anchor' ? 0 : node[`${key}X`]), y: node.y + (key === 'anchor' ? 0 : node[`${key}Y`]) });
        near(actual.x, expected.x); near(actual.y, expected.y);
      }
    });
    assert.ok(dxf.buildCadDxf(editor, 'selected', cad.DEFAULT_CAD_SETTINGS).omitted.every((item: any) => item.reason === 'clipped'));
    editor.undo(); assert.deepEqual(snapshot(), before);
  }));

  for (const vertical of [false, true]) it(`accepts a ${vertical ? 'vertical' : 'horizontal'} centerline with zero geometric ${vertical ? 'width' : 'height'}`, async () => harness(h => {
    const { editor, plans, cad, documentFixture, line, filePlan, snapshot, dxf } = h;
    const doc = documentFixture(); doc.paths.splice(1); doc.paths[0].contours = [vertical ? line([32, 8], [32, 56]) : line([8, 32], [120, 32])];
    const before = snapshot(), plan = filePlan(doc); near(vertical ? plan.widthMm : plan.heightMm, 0);
    assert.equal(plans.applyCadPlan(editor, plan), true);
    const shape = editor.getOnlySelectedShape(), bounds = editor.getShapeGeometry(shape).bounds; near(vertical ? bounds.w : bounds.h, 0);
    assert.equal(shape.props.contours[0].closed, false); assert.equal(shape.props.contours[0].nodes.length, 2);
    const point = editor.getShapePageBounds(shape).center; assert.equal(editor.getShapeAtPoint(point)?.id, shape.id);
    const output = dxf.buildCadDxf(editor, 'selected', cad.DEFAULT_CAD_SETTINGS); assert.equal(output.openContours, 1); assert.deepEqual(output.omitted, []);
    assert.equal(new DxfParser().parseSync(output.text)!.entities[0].type, 'LINE');
    editor.undo(); assert.deepEqual(snapshot(), before);
  }));

  it('exposes native cubic handles and splits an open branch without changing its sibling contours or paint', async () => harness(h => {
    const { editor, plans, filePlan, nodes, editing, curves, snapshot } = h;
    const plan = filePlan(); plan.shapes.splice(1); plan.contours = plan.shapes[0].props.contours;
    assert.equal(plans.applyCadPlan(editor, plan), true); const shape = editor.getOnlySelectedShape();
    nodes.setCadNodeEditing(editor, true); const handles = editor.getShapeUtil(shape).getHandles(shape);
    assert.ok(handles.some((handle: any) => handle.id === '0:0:out')); assert.ok(handles.some((handle: any) => handle.id === '0:1:in'));
    assert.ok(!handles.some((handle: any) => handle.id === '0:0:in' || handle.id === '0:1:out'));
    const before = snapshot(), original = shape.props.contours[0], midpoint = curves.cubicAt(curves.cubicPoints(original.nodes[0], original.nodes[1]), .5);
    assert.equal(editing.splitCadCurveSegment(editor, 0, 0, .5), true);
    const edited = editor.getShape(shape.id); assert.equal(edited.props.contours[0].closed, false); assert.equal(edited.props.contours[0].nodes.length, 3);
    near(edited.props.contours[0].nodes[1].x, midpoint.x); near(edited.props.contours[0].nodes[1].y, midpoint.y);
    assert.deepEqual(edited.props.contours.slice(1), shape.props.contours.slice(1)); assert.deepEqual(edited.meta, shape.meta);
    editor.undo(); assert.deepEqual(snapshot(), before);
  }));
});

describe('centerline PDF and DXF interchange', () => {
  it('carries an actual traced loop with a connected tail through selected-image replacement, PDF, DXF and native Undo/Redo', async () => harness(async h => {
    const { traceRaster, DEFAULT_TRACE_OPTIONS } = await import('../../src/lib/components/canvas/cad-trace');
    const { editor, source, plans, cad, imageFixture, snapshot, pdf, pdfImport, dxf } = h;
    const data = new Uint8ClampedArray(128 * 128 * 4).fill(255);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const px = x + .5, py = y + .5, tailX = Math.max(96, Math.min(116, px));
      if (Math.abs(Math.hypot(px - 64, py - 64) - 32) <= 2.5 || Math.hypot(px - tailX, py - 64) <= 2.5)
        data.set([0, 0, 0, 255], (y * 128 + x) * 4);
    }
    const doc = traceRaster({ width: 128, height: 128, data }, { ...DEFAULT_TRACE_OPTIONS, method: 'centerline' });
    assert.equal(doc.paths.length, 1); assert.equal(doc.paths[0].paint.fill, 'none'); assert.equal(doc.paths[0].paint.stroke, '#000000');
    const loop = doc.paths[0].contours.find((contour: any) => contour.closed)!, tail = doc.paths[0].contours.find((contour: any) => !contour.closed)!;
    assert.ok(loop && tail); assert.equal(doc.paths[0].contours.length, 2);
    assert.ok([tail.nodes[0], tail.nodes.at(-1)!].some(endpoint => loop.nodes.some(node => Math.hypot(node.x - endpoint.x, node.y - endpoint.y) < 1e-7)));
    assert.ok(loop.nodes.some((node, index, all) => {
      const next = all[(index + 1) % all.length], dx = next.x - node.x, dy = next.y - node.y;
      return Math.abs(dx * node.outY - dy * node.outX) + Math.abs(dx * next.inY - dy * next.inX) > 1e-6;
    }), 'the raster loop must contain genuine curved spans');
    const fixture = imageFixture(), before = snapshot();
    const plan = { ...source.styleCenterlineTracePlan(source.prepareSelectedRasterTracePlan(editor, cad.DEFAULT_CAD_SETTINGS, doc, true), cad.DEFAULT_CAD_SETTINGS, .25), groupResult: true };
    assert.equal(plans.applyCadPlan(editor, plan), true);
    const shape = editor.getOnlySelectedShape(); assert.equal(shape.type, 'cad-bezier'); assert.equal(shape.parentId, fixture.parent);
    assert.equal(editor.getShape(fixture.bitmap), undefined); assert.deepEqual(shape.props.contours, plan.shapes[0].props.contours);
    near(shape.meta.omsVectorPaint.strokeWidth * cad.cadMmPerPixel(cad.DEFAULT_CAD_SETTINGS), .25);
    const exported = pdf.prepareVectorExport(editor, cad.DEFAULT_CAD_SETTINGS, 'selected', 'pdf'); assert.deepEqual(exported.omitted, []);
    const parsed = await readPdf(exported.text, pdfImport.pdfOperatorsToVectors);
    assert.equal(parsed.document.paths.length, 1); assert.equal(parsed.document.paths[0].contours.filter((contour: any) => contour.closed).length, 1);
    assert.equal(parsed.document.paths[0].contours.filter((contour: any) => !contour.closed).length, 1);
    near(parsed.document.paths[0].paint.strokeWidth, .25 * 72 / 25.4, 1e-6); near(parsed.document.paths[0].paint.strokeOpacity, .6 * .5);
    const cadOutput = dxf.buildCadDxf(editor, 'selected', cad.DEFAULT_CAD_SETTINGS), entities = new DxfParser().parseSync(cadOutput.text)!.entities as any[];
    assert.deepEqual(cadOutput.omitted, []); assert.equal(cadOutput.closedContours, 1); assert.equal(cadOutput.openContours, 1);
    assert.ok(entities.some(entity => entity.type === 'SPLINE' && entity.degreeOfSplineCurve === 3 && entity.closed));
    assert.ok(entities.some(entity => entity.layer === 'OMS_OPEN' && !entity.closed));
    const after = snapshot(); editor.undo(); assert.deepEqual(snapshot(), before); editor.redo(); assert.deepEqual(snapshot(), after);
  }));

  it('round-trips open compound cubics, loops, physical width, round caps/joins and inherited stroke alpha through PDF.js', async () => harness(async h => {
    const { editor, source, plans, cad, documentFixture, imageFixture, pdf, pdfImport } = h;
    imageFixture(); const doc = documentFixture(), widthMm = .25;
    const plan = { ...source.styleCenterlineTracePlan(source.prepareSelectedRasterTracePlan(editor, cad.DEFAULT_CAD_SETTINGS, doc, true), cad.DEFAULT_CAD_SETTINGS, widthMm), groupResult: true };
    assert.equal(plans.applyCadPlan(editor, plan), true);
    const exported = pdf.prepareVectorExport(editor, cad.DEFAULT_CAD_SETTINGS, 'selected', 'pdf'); assert.deepEqual(exported.omitted, []);
    const parsed = await readPdf(exported.text, pdfImport.pdfOperatorsToVectors); assert.deepEqual(parsed.document.warnings, []);
    assert.equal(parsed.document.paths.length, 2);
    parsed.document.paths.forEach((path: any, pi: number) => {
      near(path.paint.strokeWidth, widthMm * 72 / 25.4, 1e-6); assert.equal(path.paint.fill, 'none');
      assert.equal(path.paint.lineCap, 'round'); assert.equal(path.paint.lineJoin, 'round');
      near(path.paint.strokeOpacity, doc.paths[pi].paint.strokeOpacity * .6 * .5);
      assert.deepEqual(path.contours.map((c: any) => c.closed), exported.paths[pi].contours.map((c: any) => c.closed));
      assert.equal(path.contours.length, exported.paths[pi].contours.length);
      path.contours.forEach((contour: any, ci: number) => contour.nodes.forEach((node: any, ni: number) => {
        const expected = exported.paths[pi].contours[ci].nodes[ni];
        for (const handle of ['inX', 'inY', 'outX', 'outY']) near(node[handle], expected[handle], 1e-5);
      }));
    });
    assert.ok(parsed.list.fnArray.includes(parsed.ops.stroke));
    assert.ok(parsed.list.fnArray.some((op: number, index: number) => op === parsed.ops.setLineCap && parsed.list.argsArray[index][0] === 1));
    assert.ok(parsed.list.fnArray.some((op: number, index: number) => op === parsed.ops.setLineJoin && parsed.list.argsArray[index][0] === 1));
  }));

  it('exports an open degree-three SPLINE, branch LINEs and a closed loop on the correct DXF layers', async () => harness(h => {
    const { editor, plans, filePlan, cad, curves, dxf, children } = h;
    const plan = { ...filePlan(), groupResult: true }; assert.equal(plans.applyCadPlan(editor, plan), true);
    const shapes = children(editor.getOnlySelectedShape()), exported = dxf.buildCadDxf(editor, 'selected', cad.DEFAULT_CAD_SETTINGS);
    assert.deepEqual(exported.omitted, []); assert.equal(exported.openContours, 3); assert.equal(exported.closedContours, 1);
    const parsed = new DxfParser().parseSync(exported.text)!, entities = parsed.entities as any[];
    assert.equal(entities.length, 4); assert.deepEqual(entities.map(entity => entity.type), ['SPLINE', 'LINE', 'LINE', 'SPLINE']);
    assert.deepEqual(entities.map(entity => entity.layer), ['OMS_OPEN', 'OMS_OPEN', 'OMS_OPEN', 'OMS_CLOSED']);
    assert.equal(entities[0].degreeOfSplineCurve, 3); assert.equal(!!entities[0].closed, false); assert.equal(entities[0].planar, true);
    assert.equal(entities[3].degreeOfSplineCurve, 3); assert.equal(entities[3].closed, true);
    const shape = shapes[0], contour = shape.props.contours[0], transform = editor.getShapePageTransform(shape);
    const expected = [contour.nodes[0], ...[...curves.contourSegments(contour)].flatMap((segment: any) => segment.slice(1))];
    assert.equal(entities[0].controlPoints.length, expected.length);
    expected.forEach((point: any, index: number) => {
      const page = transform.applyToPoint(point), factor = cad.cadMmPerPixel(cad.DEFAULT_CAD_SETTINGS);
      near(entities[0].controlPoints[index].x, page.x * factor); near(entities[0].controlPoints[index].y, -page.y * factor);
    });
  }));
});
