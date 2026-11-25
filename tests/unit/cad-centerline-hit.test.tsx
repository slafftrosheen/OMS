import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

/** Actual native Editor picking and geometry caches; no browser or rendering claim. */
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
  const curves = await import('../../src/lib/components/canvas/cad-curves');
  const vector = await import('../../src/lib/components/canvas/cad-vector');
  const cad = await import('../../src/lib/components/canvas/cad-settings');
  const outline = await import('../../src/lib/components/canvas/drawing-outline');
  const measurements = await import('../../src/lib/components/canvas/cad-measurements');
  const { CadBezierShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadBezierShape');
  const host = document.createElement('div'); document.body.append(host);
  const shapeUtils = [...tl.defaultShapeUtils, CadBezierShapeUtil];
  const editor = new tl.Editor({ store: tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }), shapeUtils,
    bindingUtils: tl.defaultBindingUtils, tools: [...tl.defaultTools, ...tl.defaultShapeTools], getContainer: () => host, initialState: 'select' });
  editor.updateViewportScreenBounds(new tl.Box(0, 0, 800, 600));
  editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: cad.DEFAULT_CAD_SETTINGS } });
  const contour = (points: number[][], closed = false) => ({ closed, nodes: points.map(([x, y]) => curves.nodeAt({ x, y })) });
  const rectangle = (x: number, y: number, w: number, h: number) => contour([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true);
  const paint = { ...vector.VECTOR_DEFAULT_PAINT, fill: 'none', stroke: '#000000', strokeOpacity: .8, strokeWidth: 40, lineCap: 'round', lineJoin: 'round', dash: [] };
  const create = (contours = [contour([[0, 0], [100, 0]])], appearance = {}, placement = {}) => {
    assert.ok(vector.validVectorPaint({ ...paint, ...appearance }), 'fixture paint must exercise its intended appearance');
    const id = tl.createShapeId(); editor.createShape({ id, type: 'cad-bezier', x: 100, y: 100, opacity: 1, ...placement,
      props: { contours, fillRule: 'evenodd' }, meta: { omsVectorPaint: { ...paint, ...appearance } } });
    return editor.getShape(id);
  };
  const pagePoint = (shape: any, point: number[]) => editor.getShapePageTransform(shape).applyToPoint({ x: point[0], y: point[1] });
  const pick = (shape: any, point: number[], opts = {}) => editor.getShapeAtPoint(pagePoint(shape, point), { filter: (s: any) => s.id === shape.id, ...opts });
  const margin = () => editor.options.hitTestMargin / editor.getZoomLevel();
  const snapshot = () => structuredClone(editor.store.getStoreSnapshot('document'));
  try { await run({ editor, tl, curves, cad, outline, measurements, contour, rectangle, create, paint, pagePoint, pick, margin, snapshot }); }
  finally {
    editor.dispose(); host.remove(); channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
}

describe('round centerline stroke picking', () => {
  for (const vertical of [false, true]) it(`picks the visible body and round caps of a thick ${vertical ? 'vertical' : 'horizontal'} stroke without inflating geometry`, async () => harness(h => {
    const { editor, tl, contour, create, pick, margin, snapshot } = h;
    const shape = create([contour(vertical ? [[0, 0], [0, 100]] : [[0, 0], [100, 0]])]);
    const at = (x: number, y: number) => vertical ? [y, x] : [x, y], before = snapshot(), geometry = editor.getShapeGeometry(shape);
    assert.equal(pick(shape, at(50, 15))?.id, shape.id); assert.equal(pick(shape, at(-15, 0))?.id, shape.id);
    assert.equal(pick(shape, at(115, 0))?.id, shape.id); assert.equal(pick(shape, at(50, 25)), undefined);
    assert.equal(pick(shape, at(50, 25), { margin: margin() })?.id, shape.id);
    assert.equal(pick(shape, at(50, 20 + margin() + 2), { margin: margin() }), undefined);
    assert.equal(pick(shape, at(-20 - margin() - 2, 0), { margin: margin() }), undefined);
    const inside = new tl.Vec(...at(50, 15)); near(geometry.children[0].distanceToPoint(inside), -5);
    assert.equal(geometry.hitTestPoint(inside), true); assert.equal(geometry.distanceToPoint(inside), -5);
    const axis = geometry.nearestPoint(inside); near(axis.x, vertical ? 0 : 50); near(axis.y, vertical ? 50 : 0);
    near(vertical ? geometry.bounds.w : geometry.bounds.h, 0); near(vertical ? geometry.bounds.h : geometry.bounds.w, 100);
    assert.deepEqual(geometry.children[0].vertices.map((p: any) => [p.x, p.y]), vertical ? [[0, 0], [0, 100]] : [[0, 0], [100, 0]]);
    assert.deepEqual(snapshot(), before);
  }));

  it('picks round joins and cubic stroke bodies while leaving unpainted space outside them alone', async () => harness(h => {
    const { create, contour, pick, curves, editor, tl } = h;
    const elbow = create([contour([[0, 0], [100, 0], [100, 100]])]);
    assert.equal(pick(elbow, [115, -10])?.id, elbow.id); assert.equal(pick(elbow, [120, -20]), undefined);
    const arch = contour([[0, 0], [100, 0]]); arch.nodes[0].outY = -80; arch.nodes[1].inY = -80;
    const shape = create([arch], {}, { x: 350, y: 200 }), middle = curves.cubicAt(curves.cubicPoints(arch.nodes[0], arch.nodes[1]), .5);
    assert.equal(pick(shape, [middle.x, middle.y - 15])?.id, shape.id);
    assert.equal(pick(shape, [middle.x, middle.y - 35]), undefined);
    const geometry = editor.getShapeGeometry(shape); near(geometry.bounds.y, -60); near(geometry.bounds.h, 60);
    const nearest = geometry.nearestPoint(new tl.Vec(middle.x, middle.y - 15)); near(nearest.x, middle.x); near(nearest.y, middle.y);
  }));

  it('does not invent an open closing chord or a filled interior for closed centerline loops, even with hitInside', async () => harness(h => {
    const { editor, tl, create, contour, rectangle, pick, pagePoint } = h;
    const open = create([contour([[0, 0], [0, 120], [120, 120], [120, 0]])]);
    for (const point of [[60, 0], [60, 60]]) {
      assert.equal(pick(open, point), undefined); assert.equal(pick(open, point, { hitInside: true }), undefined);
      assert.equal(editor.isPointInShape(open, pagePoint(open, point), { hitInside: true }), false);
      assert.equal(editor.getShapeGeometry(open).hitTestPoint(new tl.Vec(...point), 0, true), false);
      assert.ok(editor.getShapeGeometry(open).distanceToPoint(new tl.Vec(...point), true) > 0);
    }
    const loops = create([rectangle(0, 0, 200, 200), rectangle(60, 60, 80, 80)], { strokeWidth: 20 }, { x: 350, y: 100 });
    assert.equal(pick(loops, [80, 65])?.id, loops.id); assert.equal(pick(loops, [5, 100])?.id, loops.id);
    for (const point of [[100, 100], [35, 100]]) {
      assert.equal(pick(loops, point, { hitInside: true }), undefined);
      assert.equal(editor.isPointInShape(loops, pagePoint(loops, point), { hitInside: true }), false);
    }
  }));

  it('uses page transforms and native zoom-dependent hit margins without changing the physical painted radius', async () => harness(h => {
    const { editor, tl, create, contour, pick, margin } = h;
    const group = tl.createShapeId('hit-parent'); editor.createShape({ id: group, type: 'group', x: 250, y: 180, rotation: .4 });
    const shape = create([contour([[0, 0], [100, 0]])], {}, { parentId: group, x: 30, y: 40, rotation: .7 });
    for (const zoom of [.5, 1, 4]) {
      editor.setCamera({ x: 0, y: 0, z: zoom });
      assert.equal(pick(shape, [50, 15])?.id, shape.id); assert.equal(pick(shape, [-15, 0])?.id, shape.id);
      assert.equal(pick(shape, [50, 20 + margin() / 2], { margin: margin() })?.id, shape.id);
      assert.equal(pick(shape, [50, 20 + margin() + 2], { margin: margin() }), undefined);
    }
    near(editor.getShapeGeometry(shape).bounds.h, 0);
  }));

  it('excludes clipped-away stroke, compound clip holes and nested clip intersections through native child picking', async () => harness(h => {
    const { editor, tl, create, contour, rectangle, pick, margin, paint } = h;
    const clips = [{ contours: [rectangle(20, -12, 160, 24), rectangle(80, -8, 40, 16)], fillRule: 'evenodd' }];
    const shape = create([contour([[0, 0], [200, 0]])], { clips });
    const geometry = editor.getShapeGeometry(shape); assert.equal(pick(shape, [50, 10])?.id, shape.id);
    assert.equal(pick(shape, [100, 10])?.id, shape.id, 'the narrow painted strip above the clip hole remains pickable');
    for (const point of [[50, 15], [100, 0], [10, 0]]) {
      assert.equal(pick(shape, point, { margin: margin(), hitInside: true }), undefined);
      assert.equal(geometry.hitTestPoint(new tl.Vec(...point), margin(), true), false);
      assert.equal(geometry.children[0].distanceToPoint(new tl.Vec(...point), true), Infinity);
    }
    editor.updateShape({ id: shape.id, type: 'cad-bezier', meta: { omsVectorPaint: { ...paint,
      clips: [...clips, { contours: [rectangle(40, -8, 120, 16)], fillRule: 'nonzero' }] } } });
    assert.equal(editor.getShapeGeometry(shape.id), geometry, 'meta-only clips retain the installed native geometry cache');
    assert.equal(pick(shape, [50, 10]), undefined); assert.equal(pick(shape, [50, 5])?.id, shape.id);
    near(geometry.bounds.h, 0);
  }));

  it('picks a visible clipped outline from either side of its painted screen pixel at overview zoom', async () => harness(h => {
    const {editor, create, contour, rectangle, pick, margin} = h;
    const clips = [{contours:[rectangle(0,0,400,160)],fillRule:'nonzero'}];
    const shape = create([contour([[0,0],[400,0]])], {clips, strokeWidth:1});
    editor.setCamera({x:0,y:0,z:.025});
    const z = editor.getZoomLevel();
    assert.equal(pick(shape,[200,-.4/z],{margin:margin()})?.id,shape.id);
    assert.equal(pick(shape,[200,-.7/z],{margin:margin()}),undefined);
    const hidden = create([contour([[0,-2],[400,-2]])], {clips, strokeWidth:1});
    assert.equal(pick(hidden,[200,-2],{margin:margin()}),undefined);
  }));

  it('updates cached picking after real Outline width edits, Undo/Redo and invisible stroke or shape opacity', async () => harness(h => {
    const { editor, create, pick, paint, outline, cad, measurements } = h;
    const shape = create(), geometry = editor.getShapeGeometry(shape), originalProps = structuredClone(shape.props);
    editor.select(shape.id); assert.equal(pick(shape, [50, 15])?.id, shape.id);
    const plan = outline.prepareOutlinePlan(editor, { strokeWidth: 10 * cad.cadMmPerPixel(cad.DEFAULT_CAD_SETTINGS) }, cad.DEFAULT_CAD_SETTINGS);
    assert.equal(outline.applyOutlinePlan(editor, plan), true); assert.equal(editor.getShapeGeometry(shape.id), geometry);
    assert.equal(pick(shape, [50, 15]), undefined); assert.deepEqual(editor.getShape(shape.id).props, originalProps);
    near(measurements.measureCadSelection(editor, cad.DEFAULT_CAD_SETTINGS).length, 100); near(geometry.bounds.h, 0);
    editor.undo(); assert.equal(pick(shape, [50, 15])?.id, shape.id);
    editor.redo(); assert.equal(pick(shape, [50, 15]), undefined);
    for (const invisible of [{ stroke: 'none' }, { strokeWidth: 0 }, { strokeOpacity: 0 }]) {
      editor.updateShape({ id: shape.id, type: 'cad-bezier', meta: { omsVectorPaint: { ...paint, ...invisible } } });
      assert.equal(pick(shape, [50, 0]), undefined); assert.equal(pick(shape, [50, 15]), undefined);
    }
    editor.updateShape({ id: shape.id, type: 'cad-bezier', opacity: 0, meta: { omsVectorPaint: paint } });
    assert.equal(pick(shape, [50, 0]), undefined);
    editor.updateShape({ id: shape.id, type: 'cad-bezier', opacity: .5 });
    assert.equal(pick(shape, [50, 15])?.id, shape.id); assert.equal(editor.getShapeGeometry(shape.id), geometry);
  }));

  it('picks unfilled cap/join and dashed styles across their stroke width without changing geometry', async () => harness(h => {
    const { editor, create, pick, margin } = h;
    for (const paint of [{ lineCap: 'butt' }, { lineCap: 'square' }, { lineJoin: 'miter' }, { lineJoin: 'bevel' }, { dash: [3, 2] }]) {
      const shape = create(undefined, paint);
      assert.equal(pick(shape, [50, 0])?.id, shape.id);
      assert.equal(pick(shape, [50, 15], { margin: margin() })?.id, shape.id);
      assert.equal(pick(shape, [50, 20 + margin() + 2], { margin: margin() }), undefined);
      near(editor.getShapeGeometry(shape).bounds.h, 0);
    }
  }));

  it('keeps solid-fill, gradient and raster styles on their existing centerline hit policy', async () => harness(h => {
    const { create, pick, margin } = h;
    for (const paint of [{ fill: '#ffffff' },
      { gradient: { type: 'linear', matrix: [1, 0, 0, 1, 0, 0], start: [0, 0], end: [100, 0], r0: 0, r1: 0,
        stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }] } },
      { raster: { width: 1, height: 1, png: 'data:image/png;base64,iVBORw0KGgoAAAAA', rgb: 'AAAA', matrix: [100, 0, 0, 100, 0, 0] } }]) {
      const shape = create(undefined, paint);
      assert.equal(pick(shape, [50, 0])?.id, shape.id);
      assert.equal(pick(shape, [50, 15], { margin: margin() }), undefined);
    }
  }));
});
