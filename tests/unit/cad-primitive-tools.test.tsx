import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

async function harness(run: (h: any) => Promise<void>) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window, channels: MessageChannel[] = [], NativeChannel = globalThis.MessageChannel;
  win.fetch = globalThis.fetch.bind(globalThis);
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  const values: Record<string, unknown> = { matchMedia: win.matchMedia, IS_REACT_ACT_ENVIRONMENT: true,
    getComputedStyle: win.getComputedStyle.bind(win), requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    MessageChannel: class extends NativeChannel { constructor() { super(); channels.push(this); } },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  for (const key of ['window', 'document', 'navigator', 'self', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
    'SVGElement', 'SVGSVGElement', 'XMLSerializer', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'DOMRect', 'DOMParser', 'MutationObserver', 'Image', 'localStorage'])
    values[key] = key === 'window' || key === 'self' ? win : win[key];
  const clearNodeTimeout = globalThis.clearTimeout, clearNodeInterval = globalThis.clearInterval;
  values.clearTimeout = (id: any) => typeof id === 'number' ? win.clearTimeout(id) : clearNodeTimeout(id);
  values.clearInterval = (id: any) => typeof id === 'number' ? win.clearInterval(id) : clearNodeInterval(id);
  win.Element.prototype.setPointerCapture = function () {}; win.Element.prototype.hasPointerCapture = function () { return false; };
  win.Element.prototype.releasePointerCapture = function () {}; win.Element.prototype.scrollIntoView = function () {};
  win.HTMLImageElement.prototype.decode = async () => {};
  const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client');
  const tl = await import('@tldraw/tldraw');
  const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
  const { CadPathShapeUtil, CadEllipseShapeUtil, CadArcShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadShapes');
  const { CadBezierShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadBezierShape');
  const boxes = await import('../../src/lib/components/canvas/CadBoxTool');
  const { CadBezierTool } = await import('../../src/lib/components/canvas/CadBezierTool');
  const { CadPolylineTool, CadLineTool } = await import('../../src/lib/components/canvas/CadPolylineTool');
  const { CadArcThreePointTool, CadCircleThreePointTool } = await import('../../src/lib/components/canvas/CadThreePointTool');
  const { nodeAt } = await import('../../src/lib/components/canvas/cad-curves');
  const cad = await import('../../src/lib/components/canvas/cad-settings');
  const defaults = await import('../../src/lib/components/canvas/drawing-outline-defaults');
  const drafts = await import('../../src/lib/components/canvas/canvas-document');
  const { locale, t } = await import('svelte-i18n'); locale.set('en'); const stopText = t.subscribe(() => {});
  const host = document.createElement('div'); document.body.append(host);
  const shapeUtils = [...tl.defaultShapeUtils, CadPathShapeUtil, CadEllipseShapeUtil, CadArcShapeUtil, CadBezierShapeUtil];
  const editor = new tl.Editor({ store: tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }), shapeUtils,
    bindingUtils: tl.defaultBindingUtils, tools: [...tl.defaultTools, ...tl.defaultShapeTools, boxes.CadRectangleTool, boxes.CadEllipseTool,
      boxes.CadPentagonTool, boxes.CadStarTool, boxes.CadTriangleTool, boxes.CadDiamondTool, CadBezierTool, CadPolylineTool, CadLineTool, CadArcThreePointTool, CadCircleThreePointTool], getContainer: () => host, initialState: 'select' });
  editor.updateViewportScreenBounds(new tl.Box(0, 0, 1600, 1200)); editor.updateInstanceState({ isFocused: true });
  editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: {...cad.DEFAULT_CAD_SETTINGS} } });
  const root = createRoot(host), tick = async () => { await act(async () => { await new Promise<void>(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve()))); }); };
  const pointer = async (name: string, x: number, y: number, extra = {}) => { await act(async () => editor.dispatch({ type:'pointer',name,target:'canvas',point:{...editor.pageToScreen({x,y}),z:.5},button:0,pointerId:1,isPen:false,shiftKey:false,ctrlKey:false,altKey:false,...extra } as any));await tick(); };
  const change = async (fn:()=>void) => { await act(async()=>fn());await tick(); };
  const snapshot=()=>structuredClone(editor.store.getStoreSnapshot('document'));
  try { await run({ editor,host,tl,cad,defaults,drafts,locale,boxes,pointer,change,snapshot,root,React,act,tick,nodeAt,EditorContext }); }
  finally {
    await act(async()=>root.unmount());editor.dispose();host.remove();stopText();channels.forEach(channel=>{channel.port1.close();channel.port2.close();});dom.window.close();
    for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
  }
}

describe('native CAD construction gesture boundaries', () => {
  it('uses the exact Bezier release point even without a final pointer move and keeps one undo step', async () => harness(async h => {
    const { editor, change, pointer, snapshot } = h;
    await change(() => { editor.setCurrentTool('cad-bezier'); editor.mark('before-curve'); });
    const before = snapshot();
    await pointer('pointer_down', 100, 100);
    await pointer('pointer_move', 120, 110);
    await pointer('pointer_up', 140, 120);
    let node = editor.getCurrentPageShapes()[0].props.contours[0].nodes[0];
    near(node.outX, 40); near(node.outY, 20); near(node.inX, -40); near(node.inY, -20);
    await pointer('pointer_down', 200, 100);
    await pointer('pointer_up', 230, 150);
    await change(() => editor.complete());
    const shape = editor.getOnlySelectedShape();
    assert.equal(shape.type, 'cad-bezier');
    node = shape.props.contours[0].nodes[1];
    near(node.outX, 30); near(node.outY, 50);
    const after = snapshot();
    await change(() => editor.undo()); assert.deepEqual(snapshot(), before);
    await change(() => editor.redo()); assert.deepEqual(snapshot(), after);
  }));

  it('does not turn an ordinary Bezier click into a smooth node', async () => harness(async ({ editor, change, pointer }) => {
    await change(() => editor.setCurrentTool('cad-bezier'));
    await pointer('pointer_down', 100, 100); await pointer('pointer_up', 100, 100);
    await pointer('pointer_down', 200, 100); await pointer('pointer_up', 200, 100);
    await change(() => editor.complete());
    assert.ok(editor.getOnlySelectedShape().props.contours[0].nodes.every((node: any) =>
      node.mode === 'corner' && !node.inX && !node.inY && !node.outX && !node.outY));
  }));

  it('keeps snapped stationary clicks as corners and uses the release point for a genuine snapped drag', async () => harness(async ({ editor, change, pointer }) => {
    await change(() => {
      editor.user.updateUserPreferences({ isSnapMode: true });
      editor.createShape({ id: 'shape:snap-target', type: 'cad-path', x: 100, y: 100,
        props: { points: [{ x: 0, y: 0 }, { x: 0, y: 100 }], closed: false } });
      editor.setCurrentTool('cad-bezier');
    });
    await pointer('pointer_down', 106, 102);
    await pointer('pointer_move', 106, 102);
    await pointer('pointer_up', 106, 102);
    const curve = () => editor.getCurrentPageShapes().find((shape: any) => shape.type === 'cad-bezier');
    const corner = curve().props.contours[0].nodes[0];
    near(corner.x, 100); near(corner.y, 100); assert.equal(corner.mode, 'corner');
    assert.deepEqual([corner.inX, corner.inY, corner.outX, corner.outY], [0, 0, 0, 0]);
    await pointer('pointer_down', 106, 202);
    await pointer('pointer_up', 140, 230);
    const smooth = curve().props.contours[0].nodes[1];
    near(smooth.x, 100); near(smooth.y, 200); assert.equal(smooth.mode, 'symmetric');
    near(smooth.outX, 40); near(smooth.outY, 30);
    await change(() => editor.complete());
  }));

  it('retains the final Shift angle and cancels a Bezier drag if the document becomes read-only', async () => harness(async ({ editor, change, pointer, snapshot }) => {
    await change(() => editor.setCurrentTool('cad-bezier'));
    const before = snapshot();
    await pointer('pointer_down', 100, 100);
    await pointer('pointer_up', 140, 120, { shiftKey: true });
    const node = editor.getCurrentPageShapes()[0].props.contours[0].nodes[0];
    near(node.outX, node.outY); near(Math.hypot(node.outX, node.outY), Math.hypot(40, 20));
    await pointer('pointer_down', 200, 100);
    await change(() => editor.updateInstanceState({ isReadonly: true }));
    await pointer('pointer_up', 230, 150);
    assert.deepEqual(snapshot(), before); assert.equal(editor.getCurrentToolId(), 'select');
  }));

  it('invalidates node indices on native geometry replacement and preserves selection after refused arrangement', async () => harness(async ({ editor, change, nodeAt, snapshot }) => {
    const selection = await import('../../src/lib/components/canvas/cad-node-selection');
    const { prepareNodeArrange, applyNodeArrange } = await import('../../src/lib/components/canvas/cad-node-arrange');
    await change(() => {
      editor.createShape({ id: 'shape:nodes', type: 'cad-bezier', props: { contours: [{ closed: false,
        nodes: [nodeAt({ x: 0, y: 0 }), nodeAt({ x: 40, y: 60 }), nodeAt({ x: 100, y: 20 })] }] } });
      editor.select('shape:nodes');
    });
    selection.selectCadNode(editor, 0, 2);
    const initial = editor.getShape('shape:nodes');
    await change(() => editor.updateShape({ id: initial.id, type: initial.type,
      props: { contours: [{ ...initial.props.contours[0], nodes: [...initial.props.contours[0].nodes].reverse() }] } }));
    assert.deepEqual(selection.getSelectedCadNodes(editor), []);
    assert.equal(selection.getSelectedCadNode(editor)?.nodeIndex, 0);
    const nodes = [{ contourIndex: 0, nodeIndex: 1 }, { contourIndex: 0, nodeIndex: 2 }];
    assert.equal(selection.setSelectedCadNodes(editor, nodes), true);
    const before = snapshot(), plan = prepareNodeArrange(editor, { kind: 'move', x: 20, y: 10 });
    const stop = editor.sideEffects.registerBeforeChangeHandler('shape', (prev: any, next: any) =>
      next.id === 'shape:nodes' ? prev : next);
    try { await change(() => assert.equal(applyNodeArrange(editor, plan), false)); } finally { stop(); }
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(selection.getSelectedCadNodes(editor).map(({ contourIndex, nodeIndex }) => ({ contourIndex, nodeIndex })), nodes);
    const updateShapes = editor.updateShapes;
    editor.updateShapes = function (...args: any[]) { updateShapes.apply(this, args); throw Error('write interrupted after native update'); };
    try { await change(() => assert.equal(applyNodeArrange(editor, plan), false)); } finally { editor.updateShapes = updateShapes; }
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(selection.getSelectedCadNodes(editor).map(({ contourIndex, nodeIndex }) => ({ contourIndex, nodeIndex })), nodes);
    await change(() => assert.equal(applyNodeArrange(editor, prepareNodeArrange(editor, { kind: 'move', x: 20, y: 10 })), true));
    await change(() => editor.undo());
    assert.deepEqual(snapshot(), before); assert.deepEqual(selection.getSelectedCadNodes(editor), []);
  }));
});
