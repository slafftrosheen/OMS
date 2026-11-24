import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const rotated = (point: {x:number;y:number}, center: {x:number;y:number}, degrees: number) => {
  const angle = -degrees * Math.PI / 180, x = point.x - center.x, y = point.y - center.y;
  return { x: center.x + x * Math.cos(angle) - y * Math.sin(angle), y: center.y + x * Math.sin(angle) + y * Math.cos(angle) };
};
const nearPoint = (actual: {x:number;y:number}, expected: {x:number;y:number}) => { near(actual.x, expected.x); near(actual.y, expected.y); };

/** Real Editor records, native grouping/duplication, history and CAD tools with
 * React forms. jsdom does not verify CSS layout or browser focus appearance. */
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
    'SVGElement', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'DOMRect', 'DOMParser', 'MutationObserver', 'Image', 'localStorage'])
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
  const tl = await import('@tldraw/tldraw'), cad = await import('../../src/lib/components/canvas/cad-settings');
  const radial = await import('../../src/lib/components/canvas/drawing-radial');
  const pivot = await import('../../src/lib/components/canvas/drawing-rotation-pivot');
  const skew = await import('../../src/lib/components/canvas/drawing-pick-skew');
  const { cadRevision } = await import('../../src/lib/components/canvas/cad-plans');
  const { getCadSelectionPageBounds } = await import('../../src/lib/components/canvas/cad-bounds');
  const { DrawingTransformPanel } = await import('../../src/lib/components/canvas/DrawingTransformPanel');
  const { RadialArrange } = await import('../../src/lib/components/canvas/RadialArrange');
  const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
  const { CadPathShapeUtil, CadEllipseShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadShapes');
  const { CadBezierShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadBezierShape');
  const { CadPolylineTool } = await import('../../src/lib/components/canvas/CadPolylineTool');
  const { CadCircleTool } = await import('../../src/lib/components/canvas/CadTwoPointTool');
  const { hasCanvasDraft } = await import('../../src/lib/components/canvas/canvas-document');
  const { locale, t } = await import('svelte-i18n'); locale.set('en'); const stopText = t.subscribe(() => {});
  const host = document.createElement('div'); document.body.append(host);
  const shapeUtils = [...tl.defaultShapeUtils, CadPathShapeUtil, CadBezierShapeUtil, CadEllipseShapeUtil];
  const editor = new tl.Editor({ store: tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }), shapeUtils,
    bindingUtils: tl.defaultBindingUtils, tools: [...tl.defaultTools, ...tl.defaultShapeTools, CadPolylineTool, CadCircleTool], getContainer: () => host, initialState: 'select' });
  editor.updateViewportScreenBounds(new tl.Box(0, 0, 1600, 1200)); editor.updateInstanceState({ isFocused: true });
  editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: {...cad.DEFAULT_CAD_SETTINGS} } });
  const stopSkew = skew.installDrawingSkewMode(editor), stopPivot = pivot.installDrawingRotationPivot(editor);
  const root = createRoot(host), tick = async (ms = 25) => { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); };
  const snapshot = () => structuredClone(editor.store.getStoreSnapshot('document'));
  const add = (x = 100, y = 80, patch = {}) => {
    const id = tl.createShapeId(); editor.createShape({ id, type: 'cad-path', x, y,
      props: { points: [{x:0,y:0},{x:80,y:0},{x:80,y:40},{x:0,y:40}], closed: true }, ...patch }); return id;
  };
  let settings = cad.DEFAULT_CAD_SETTINGS;
  const render = async (next = settings, second = false) => {
    settings = next;
    await act(async () => root.render(<EditorContext.Provider value={editor}>
      <DrawingTransformPanel settings={settings}/>{second && <div data-testid="circular-docker"><RadialArrange settings={settings} expanded/></div>}
    </EditorContext.Provider>)); await tick();
  };
  const get = (testId: string, scope: Element = host) => {
    const element = scope.querySelector(`[data-testid="${testId}"]`) as HTMLElement; assert.ok(element, testId); return element;
  };
  const panel = () => get('drawing-radial', get('drawing-transform'));
  const select = async (element: HTMLSelectElement, value: string) => {
    await act(async () => { element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })); }); await tick();
  };
  const input = async (element: HTMLInputElement, value: string) => {
    await act(async () => { Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true })); }); await tick();
  };
  const click = async (testId: string, scope: Element = panel()) => { await act(async () => get(testId, scope).click()); await tick(); };
  const preview = async () => { await act(async () => panel().querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await tick(); };
  const begin = async (second = false) => { await render(settings, second); await select(get('drawing-transform-mode') as HTMLSelectElement, 'rotation'); };
  const setPivot = async (point: {x:number;y:number}) => { await act(async () => {
    assert.equal(skew.setDrawingSkewMode(editor, true), true); assert.equal(pivot.setDrawingRotationPivot(editor, point), true);
  }); await tick(); };
  const pointer = async (name: 'pointer_down'|'pointer_up', point: {x:number;y:number}) => {
    await act(async () => editor.dispatch({ type: 'pointer', name, point: { ...editor.pageToScreen(point), z: .5 }, target: 'canvas',
      button: 0, pointerId: 1, isPen: false, shiftKey: false, ctrlKey: false, altKey: false })); await tick(40);
  };
  const points = (id: string) => { const shape = editor.getShape(id as any)!, transform = editor.getShapePageTransform(shape); return (shape.props as any).points.map((point: any) => transform.applyToPoint(point)); };
  try { await run({ editor, tl, cad, radial, pivot, skew, cadRevision, getCadSelectionPageBounds, add, snapshot, render, begin, get, panel, select, input, click, preview, setPivot, pointer, points, act, tick, locale, hasCanvasDraft, host }); }
  finally {
    await act(async () => root.unmount()); stopPivot(); stopSkew(); editor.dispose(); host.remove(); stopText();
    channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
}

describe('numeric rotation and copies in Transformations', () => {
  it('uses the moved Pick pivot, rejects an unchanged-document stale pivot, and rotates with one Undo', async () => harness(async h => {
    const { editor, add, setPivot, begin, get, panel, input, preview, click, points, snapshot, pivot, cadRevision, act, tick } = h;
    const id = add(); editor.select(id); await setPivot({x:-40,y:25}); editor.mark('rotation-start');
    const before = snapshot(), initial = points(id); await begin();
    assert.equal((get('drawing-radial-center', panel()) as HTMLSelectElement).value, 'pick');
    await input(get('drawing-radial-angle', panel()), '90'); await preview();
    assert.deepEqual(snapshot(), before); const revision = cadRevision(editor);
    await setPivot({x:-60,y:45}); assert.equal(cadRevision(editor), revision);
    assert.equal((get('drawing-radial-apply', panel()) as HTMLButtonElement).disabled, true);
    assert.match(panel().textContent!, /rotation centre or settings changed/);
    await preview(); await click('drawing-radial-apply');
    points(id).forEach((point: any, index: number) => nearPoint(point, rotated(initial[index], {x:-60,y:45}, 90)));
    assert.deepEqual(pivot.readDrawingRotationPivot(editor), {point:{x:-60,y:45},custom:true});
    await act(async () => editor.undo()); await tick(); assert.deepEqual(snapshot(), before);
    assert.deepEqual(pivot.readDrawingRotationPivot(editor), {point:{x:-60,y:45},custom:true});
    await act(async () => editor.select(add(500, 200))); await tick();
    assert.equal(pivot.readDrawingRotationPivot(editor).custom, false);
    await preview(); await click('drawing-radial-discard'); assert.equal(panel().querySelector('.drawing-cad-report'), null);
  }));

  it('rotates grouped vector copies around a selection reference point without changing originals or style', async () => harness(async h => {
    const { editor, tl, add, begin, get, panel, select, input, preview, click, points, snapshot, getCadSelectionPageBounds, act, tick } = h;
    const group = tl.createShapeId(); editor.createShape({id:group,type:'group',x:200,y:100,rotation:.37});
    const paint = {fill:'#225588',fillOpacity:.65,stroke:'#884411',strokeWidth:2};
    const a = add(0, 0, {parentId:group,meta:{omsObjectName:'Cut face',omsVectorPaint:paint}}), b = add(100, 45, {parentId:group});
    editor.setSelectedShapes([group,a]); editor.mark('rotation-copy-start');
    const before = snapshot(), originalPoints = points(a), bounds = getCadSelectionPageBounds(editor), center = {x:bounds.maxX,y:bounds.maxY};
    await begin(); await select(get('drawing-radial-center',panel()),'selection');
    await act(async () => (panel().querySelector('[aria-label="Bottom right"]') as HTMLButtonElement).click()); await tick();
    await select(get('drawing-radial-action',panel()),'copy'); await select(get('drawing-radial-spacing',panel()),'step');
    await input(get('drawing-radial-copies',panel()),'2'); await input(get('drawing-radial-angle',panel()),'90');
    await preview(); assert.deepEqual(snapshot(),before); await click('drawing-radial-apply');
    assert.equal(editor.getCurrentPageShapes().length,9); assert.equal(editor.getSelectedShapeIds().length,3);
    assert.deepEqual(editor.getShape(a),before.store[a]); assert.deepEqual(editor.getShape(b),before.store[b]);
    const copies = editor.getCurrentPageShapes().filter((shape:any)=>shape.id!==a&&shape.meta.omsObjectName==='Cut face');
    assert.equal(copies.length,2);
    for(const [index,copy] of copies.entries()) {
      assert.equal(editor.getShape(copy.parentId).type,'group'); assert.deepEqual(copy.props,editor.getShape(a).props); assert.deepEqual(copy.meta,editor.getShape(a).meta);
      points(copy.id).forEach((point:any,pointIndex:number)=>nearPoint(point,rotated(originalPoints[pointIndex],center,90*(index+1))));
    }
    await act(async()=>editor.undo()); await tick(); assert.deepEqual(snapshot(),before);
  }));

  it('shares drafts with the circular docker and preserves a custom physical centre across units, scale and origin', async () => harness(async h => {
    const { editor, tl, cad, add, begin, get, panel, select, input, render, preview, click, snapshot, points, act, tick, host } = h;
    const parent=tl.createShapeId();editor.createShape({id:parent,type:'group',x:300,y:200,rotation:.6});
    const id=add(30,20,{parentId:parent});add(180,80,{parentId:parent});editor.select(id);editor.mark('physical-centre-start');
    await begin(true); await select(get('drawing-radial-center',panel()),'custom');
    await input(get('drawing-radial-x',panel()),'25.4'); await input(get('drawing-radial-y',panel()),'12.7');
    await input(get('drawing-radial-angle',panel()),'-90');
    const other=get('drawing-radial',get('circular-docker'));assert.equal((get('drawing-radial-x',other) as HTMLInputElement).value,'25.4');
    const center=cad.cadPointToCanvas({x:25.4,y:12.7},cad.DEFAULT_CAD_SETTINGS);
    await preview(); const next={...cad.DEFAULT_CAD_SETTINGS,unit:'in',scale:2,originX:40,originY:-25}; await render(next,true);
    const displayed={x:Number((get('drawing-radial-x',panel()) as HTMLInputElement).value),y:Number((get('drawing-radial-y',panel()) as HTMLInputElement).value)};
    nearPoint(cad.cadPointToCanvas(displayed,next),center);assert.equal((get('drawing-radial-apply',panel()) as HTMLButtonElement).disabled,true);
    assert.equal(host.querySelectorAll('form form').length,0);
    const initial=points(id),before=snapshot();await preview();await click('drawing-radial-apply');
    points(id).forEach((point:any,index:number)=>nearPoint(point,rotated(initial[index],center,-90)));
    await act(async()=>editor.undo());await tick();assert.deepEqual(snapshot(),before);
    await select(get('drawing-transform-mode'),'position');await select(get('drawing-transform-mode'),'rotation');
    near(Number((get('drawing-radial-x',panel()) as HTMLInputElement).value),displayed.x);
  }));

  for(const tool of ['cad-circle','cad-polyline'])it(`rejects rotation during an unfinished native ${tool} and leaves Escape history intact`,async()=>harness(async h=>{
    const {editor,add,begin,panel,get,preview,radial,hasCanvasDraft,pointer,act,tick,snapshot}=h;
    const id=add();editor.select(id);editor.mark('draft-rotation-start');await begin();await preview();
    const options={center:{x:0,y:0},angle:90,copies:0,rotateCopies:true},plan=radial.prepareRadialPlan(editor,options),before=snapshot();
    await act(async()=>editor.setCurrentTool(tool));await pointer('pointer_down',{x:400,y:400});await pointer('pointer_up',{x:400,y:400});
    assert.equal(hasCanvasDraft(editor),true);await act(async()=>editor.select(id));await tick();
    const pending=snapshot();assert.throws(()=>radial.prepareRadialPlan(editor,options),/radialBusy/);assert.equal(radial.applyRadialPlan(editor,plan),false);
    assert.equal(hasCanvasDraft(editor),true);assert.deepEqual(snapshot(),pending);assert.equal((panel().querySelector('fieldset') as HTMLFieldSetElement).disabled,true);
    assert.match(panel().textContent!,/Finish or cancel/);
    await act(async()=>editor.cancel());await tick();assert.equal(hasCanvasDraft(editor),false);assert.deepEqual(snapshot(),before);
    await act(async()=>{editor.setCurrentTool('select');editor.select(id);});await tick();
    assert.equal((panel().querySelector('fieldset') as HTMLFieldSetElement).disabled,false);
    await act(async()=>assert.equal(radial.applyRadialPlan(editor,radial.prepareRadialPlan(editor,options)),true));await tick();
    await act(async()=>editor.undo());await tick();assert.deepEqual(snapshot(),before);
  }));

  it('links invalid input errors, protects locked/read-only selections, and translates every new control',async()=>harness(async h=>{
    const {editor,add,begin,panel,get,input,select,act,tick,locale,preview,snapshot,radial}=h;
    const id=add();editor.select(id);await begin();
    const angle=get('drawing-radial-angle',panel());await input(angle,'0');
    assert.equal((get('drawing-radial-preview',panel()) as HTMLButtonElement).disabled,true);assert.equal(angle.getAttribute('aria-invalid'),'true');
    assert.equal(document.getElementById(angle.getAttribute('aria-describedby')!)?.getAttribute('role'),'alert');
    await input(angle,'90');await select(get('drawing-radial-action',panel()),'copy');await input(get('drawing-radial-copies',panel()),'201');
    assert.equal((get('drawing-radial-preview',panel()) as HTMLButtonElement).disabled,true);
    await input(get('drawing-radial-copies',panel()),'2');await select(get('drawing-radial-spacing',panel()),'step');await input(get('drawing-radial-angle',panel()),'180');
    assert.equal((get('drawing-radial-preview',panel()) as HTMLButtonElement).disabled,true);
    await input(get('drawing-radial-angle',panel()),'90');await preview();const before=snapshot(),plan=radial.prepareRadialPlan(editor,{center:{x:0,y:0},angle:90,copies:1,rotateCopies:true});
    await act(async()=>editor.updateInstanceState({isReadonly:true}));await tick();assert.equal((get('drawing-radial-apply',panel()) as HTMLButtonElement).disabled,true);
    assert.equal(radial.applyRadialPlan(editor,plan),false);assert.deepEqual(snapshot(),before);
    await act(async()=>{editor.updateInstanceState({isReadonly:false});editor.updateShape({id,type:'cad-path',isLocked:true});});await tick();
    assert.equal((panel().querySelector('fieldset') as HTMLFieldSetElement).disabled,true);assert.throws(()=>radial.prepareRadialPlan(editor,plan.options),/radialProtected/);
    await act(async()=>locale.set('ru'));await tick();assert.match(get('drawing-transform-mode').textContent!,/Поворот \/ копии/);assert.match(get('drawing-radial-center',panel()).textContent!,/Центр поворота инструмента выбора/);
    await act(async()=>locale.set('lv'));await tick();assert.match(get('drawing-transform-mode').textContent!,/Pagriešana \/ kopijas/);assert.match(get('drawing-radial-center',panel()).textContent!,/Atlases rīka pagriešanas centrs/);
  }));

  it('rejects native capacity overflow and rolls back a partial copy without losing groups or selection',async()=>harness(async h=>{
    const {editor,add,radial,snapshot,setPivot,pivot}=h;const a=add(),b=add(250,140);editor.select(a,b);await setPivot({x:-30,y:60});editor.mark('radial-refusal-start');
    const options={center:{x:0,y:0},angle:45,copies:2,rotateCopies:true},before=snapshot(),selected=[...editor.getSelectedShapeIds()];
    const limit=editor.options.maxShapesPerPage;editor.options.maxShapesPerPage=3;assert.throws(()=>radial.prepareRadialPlan(editor,options),/radialLimit/);assert.deepEqual(snapshot(),before);editor.options.maxShapesPerPage=limit;
    const plan=radial.prepareRadialPlan(editor,options),native=editor.duplicateShapes;
    editor.duplicateShapes=function(ids:any[]){native.call(this,ids);this.deleteShapes([this.getSelectedShapeIds()[0]]);return this;};
    try{assert.equal(radial.applyRadialPlan(editor,plan),false);assert.deepEqual(snapshot(),before);assert.deepEqual(editor.getSelectedShapeIds(),selected);assert.deepEqual(pivot.readDrawingRotationPivot(editor),{point:{x:-30,y:60},custom:true});}
    finally{editor.duplicateShapes=native;}
  }));
});
