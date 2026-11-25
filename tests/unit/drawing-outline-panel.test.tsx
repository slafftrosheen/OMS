import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (a: number, b: number) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);

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
  const { CadPathShapeUtil, CadEllipseShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadShapes');
  const { CadBezierShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadBezierShape');
  const boxes = await import('../../src/lib/components/canvas/CadBoxTool');
  const { OutlinePenPanel } = await import('../../src/lib/components/canvas/OutlinePenPanel');
  const { VectorArtwork } = await import('../../src/lib/components/canvas/VectorArtwork');
  const { nodeAt } = await import('../../src/lib/components/canvas/cad-curves');
  const { cadRevision } = await import('../../src/lib/components/canvas/cad-plans');
  const cad = await import('../../src/lib/components/canvas/cad-settings');
  const defaults = await import('../../src/lib/components/canvas/drawing-outline-defaults');
  const drafts = await import('../../src/lib/components/canvas/canvas-document');
  const { locale, t } = await import('svelte-i18n'); locale.set('en'); const stopText = t.subscribe(() => {});
  const host = document.createElement('div'); document.body.append(host);
  const shapeUtils = [...tl.defaultShapeUtils, CadPathShapeUtil, CadEllipseShapeUtil, CadBezierShapeUtil];
  const editor = new tl.Editor({ store: tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }), shapeUtils,
    bindingUtils: tl.defaultBindingUtils, tools: [...tl.defaultTools, ...tl.defaultShapeTools, boxes.CadRectangleTool, boxes.CadEllipseTool,
      boxes.CadPentagonTool, boxes.CadStarTool, boxes.CadTriangleTool, boxes.CadDiamondTool], getContainer: () => host, initialState: 'select' });
  editor.updateViewportScreenBounds(new tl.Box(0, 0, 1600, 1200)); editor.updateInstanceState({ isFocused: true });
  editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: {...cad.DEFAULT_CAD_SETTINGS} } });
  const root = createRoot(host), tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }); };
  function Panel() {
    const state = tl.useValue('outline test revision', () => ({ revision: cadRevision(editor), settings: cad.readCadSettings(editor) }), [editor]);
    return <EditorContext.Provider value={editor}><OutlinePenPanel settings={state.settings} revision={state.revision} disabled={false} /></EditorContext.Provider>;
  }
  const render = async () => { await act(async () => root.render(<Panel />)); await tick(); };
  const query = (label: string) => { const node=host.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;assert.ok(node,label);return node; };
  const select = async (label: string, value: string) => { await act(async () => { const node=query(label);node.value=value;node.dispatchEvent(new Event('change',{bubbles:true})); }); await tick(); };
  const input = async (label: string, value: string) => { await act(async () => { const node=query(label);Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value')!.set!.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true})); }); await tick(); };
  const click = async (text: string) => { const button=[...host.querySelectorAll('button')].find(node=>node.textContent===text);assert.ok(button,text);await act(async()=>button.click());await tick(); };
  const pointer = async (name: string, x: number, y: number, extra = {}) => { await act(async () => editor.dispatch({ type:'pointer',name,target:'canvas',point:{...editor.pageToScreen({x,y}),z:.5},button:0,pointerId:1,isPen:false,shiftKey:false,ctrlKey:false,altKey:false,...extra } as any));await tick(); };
  const change = async (fn:()=>void) => { await act(async()=>fn());await tick(); };
  const snapshot=()=>structuredClone(editor.store.getStoreSnapshot('document'));
  try { await run({ editor,host,tl,cad,defaults,drafts,locale,boxes,render,query,select,input,click,pointer,change,snapshot,root,React,act,tick,VectorArtwork,nodeAt,EditorContext }); }
  finally {
    await act(async()=>root.unmount());editor.dispose();host.remove();stopText();channels.forEach(channel=>{channel.port1.close();channel.port2.close();});dom.window.close();
    for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
  }
}

describe('real editor outline controls and calibrated drag primitives', () => {
  it('creates centered Shift rectangles with a visible default hairline, excludes drafts and undoes in one step', async () => harness(async h => {
    const {editor,change,pointer,drafts,snapshot}=h;
    await change(()=>{editor.setCurrentTool('cad-rectangle');editor.mark('before-box');});
    const before=snapshot();
    await pointer('pointer_down',100,100);await pointer('pointer_move',160,140,{shiftKey:true,altKey:true});
    const draft=editor.getCurrentPageShapes()[0];assert.ok(draft);assert.equal(drafts.hasCanvasDraft(editor),true);
    assert.equal(drafts.captureCanvasDocument(editor).document.store[draft.id],undefined);
    assert.equal(draft.type,'cad-path');near(draft.x,40);near(draft.y,40);assert.deepEqual(draft.props.points,[{x:0,y:0},{x:120,y:0},{x:120,y:120},{x:0,y:120}]);
    assert.equal(draft.meta.omsVectorPaint.hairline,true);assert.ok(draft.meta.omsVectorPaint.strokeWidth>0);
    await pointer('pointer_up',160,140,{shiftKey:true,altKey:true});assert.equal(drafts.hasCanvasDraft(editor),false);assert.equal(editor.getCurrentToolId(),'select');
    const after=snapshot();await change(()=>editor.undo());assert.deepEqual(snapshot(),before);await change(()=>editor.redo());assert.deepEqual(snapshot(),after);
  }));

  it('creates all closed toolbar presets with editable points and inherited style', async () => harness(async h => {
    const {editor,defaults,cad,change,pointer}=h;
    assert.equal(defaults.applyOutlineDefaultsPlan(editor,defaults.prepareOutlineDefaultsPlan(editor,{strokeWidth:.35,lineJoin:'round',dash:[3,2]},cad.DEFAULT_CAD_SETTINGS)),true);
    for(const [tool,count] of [['cad-ellipse',0],['cad-pentagon',5],['cad-star',10],['cad-triangle',3],['cad-diamond',4]]){
      await change(()=>editor.setCurrentTool(tool));await pointer('pointer_down',200,150);await pointer('pointer_move',110,90);await pointer('pointer_up',110,90);
      const shape=editor.getOnlySelectedShape();assert.ok(shape);near(shape.x,110);near(shape.y,90);
      if(count){assert.equal(shape.type,'cad-path');assert.equal(shape.props.points.length,count);assert.equal(shape.props.closed,true);near(Math.max(...shape.props.points.map((p:any)=>p.x)),90);near(Math.max(...shape.props.points.map((p:any)=>p.y)),60);}
      else{assert.equal(shape.type,'cad-ellipse');near(shape.props.w,90);near(shape.props.h,60);}
      assert.equal(shape.meta.omsVectorPaint.hairline,false);assert.equal(shape.meta.omsVectorPaint.lineJoin,'round');near(shape.meta.omsVectorPaint.strokeWidth,cad.unitLengthToCanvas(.35,cad.DEFAULT_CAD_SETTINGS));
    }
  }));

  it('rolls back canceled, readonly and invalid-size drags and prevents defaults during a live gesture', async () => harness(async h => {
    const {editor,defaults,cad,change,pointer,drafts}=h;
    const plan=defaults.prepareOutlineDefaultsPlan(editor,{lineCap:'round'},cad.DEFAULT_CAD_SETTINGS);
    await change(()=>editor.setCurrentTool('cad-ellipse'));await pointer('pointer_down',20,20);await pointer('pointer_move',100,80);
    assert.equal(defaults.applyOutlineDefaultsPlan(editor,plan),false);
    await change(()=>editor.cancel());assert.equal(editor.getCurrentPageShapes().length,0);assert.equal(drafts.hasCanvasDraft(editor),false);
    await pointer('pointer_up',100,80);
    await change(()=>editor.setCurrentTool('cad-rectangle'));await pointer('pointer_down',20,20);await pointer('pointer_move',100,80);
    await change(()=>editor.updateInstanceState({isReadonly:true}));await pointer('pointer_up',100,80);
    assert.equal(editor.getCurrentPageShapes().length,0);assert.equal(drafts.hasCanvasDraft(editor),false);
    await change(()=>{editor.updateInstanceState({isReadonly:false});editor.setCurrentTool('cad-rectangle');});await pointer('pointer_down',20,20);await pointer('pointer_up',20,20);
    assert.equal(editor.getCurrentPageShapes().length,0);assert.equal(drafts.hasCanvasDraft(editor),false);
  }));

  it('edits selected outlines in points, caps, joins and dashes and persists page defaults without restyling selection', async () => harness(async h => {
    const {editor,defaults,cad,change,render,query,select,input,click}=h;
    await change(()=>{editor.createShape({id:'shape:subject',type:'cad-path',meta:defaults.newCadOutlineMeta(editor)});editor.select('shape:subject');});await render();
    assert.equal(query('Width type').value,'hairline');assert.equal(query('Width').matches(':disabled'),true);
    await select('Width unit','pt');await select('Width type','custom');await input('Width','1');await click('Apply width');
    near(editor.getShape('shape:subject').meta.omsVectorPaint.strokeWidth,96/72);assert.equal(editor.getShape('shape:subject').meta.omsVectorPaint.hairline,false);
    await select('Line ends','square');await select('Stroke corners','bevel');await select('Dash pattern','dashdot');await input('Dash offset','-1');await click('Review outline');await click('Apply outline');
    const selected=structuredClone(editor.getShape('shape:subject'));assert.equal(selected.meta.omsVectorPaint.lineCap,'square');assert.equal(selected.meta.omsVectorPaint.lineJoin,'bevel');assert.ok(selected.meta.omsVectorPaint.dash.length);near(selected.meta.omsVectorPaint.dashOffset,cad.unitLengthToCanvas(-1,cad.DEFAULT_CAD_SETTINGS));
    await select('Apply to','defaults');await select('Width type','custom');await select('Width unit','mm');await input('Width','0.5');await click('Review outline');await click('Save new-object outline');
    assert.deepEqual(editor.getShape('shape:subject'),selected);near(defaults.newCadOutlinePaint(editor).strokeWidth,cad.unitLengthToCanvas(.5,cad.DEFAULT_CAD_SETTINGS));
    await change(()=>editor.updateInstanceState({isReadonly:true}));assert.equal(query('Width').matches(':disabled'),true);assert.equal(query('Apply to').matches(':disabled'),true);
  }));

  it('keeps the screen hairline style out of previews and exported SVG', async () => harness(async h => {
    const {editor,defaults,root,React,act,tick,VectorArtwork,nodeAt,host,change}=h;
    const paint=defaults.newCadOutlinePaint(editor),contours=[{closed:false,nodes:[nodeAt({x:0,y:0}),nodeAt({x:100,y:10})]}];
    await act(async()=>root.render(<svg><VectorArtwork id="live" contours={contours} fillRule="evenodd" paint={paint} live/><VectorArtwork id="export" contours={contours} fillRule="evenodd" paint={paint}/></svg>));await tick();
    const [live, preview] = host.querySelectorAll('[data-oms-hairline="true"]');
    assert.match(live.getAttribute('style'), /--tl-scale/);
    assert.equal(preview.hasAttribute('style'), false);
    near(Number(preview.getAttribute('stroke-width')), paint.strokeWidth);
    await change(()=>editor.createShape({id:'shape:export',type:'cad-path',props:{points:[{x:0,y:0},{x:100,y:10}]},meta:defaults.newCadOutlineMeta(editor)}));
    let exported:any;await act(async()=>{exported=await editor.getSvgString(['shape:export'],{bounds:new h.tl.Box(-1,-1,102,12),padding:0,scale:1,background:false});});assert.ok(exported);
    const dom=new DOMParser().parseFromString(exported.svg,'image/svg+xml'),path=dom.querySelector('[data-oms-hairline="true"]');assert.ok(path);near(Number(path.getAttribute('stroke-width')),paint.strokeWidth);
    const {readVectorSvg}=await import('../../src/lib/components/canvas/cad-svg-import');
    const restored=readVectorSvg(exported.svg).document;assert.equal(restored.paths.length,1);assert.equal(restored.paths[0].paint.hairline,true);assert.ok(restored.paths[0].paint.strokeWidth>0);
  }));
});
