import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

/** Actual native Editor/store/history; no browser, visual or hardware claim. */
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
  const editing = await import('../../src/lib/components/canvas/cad-editing');
  const { CadPathShapeUtil, CadEllipseShapeUtil, CadArcShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadShapes');
  const { CadBezierShapeUtil } = await import('../../src/lib/components/canvas/shapes/CadBezierShape');
  const host = document.createElement('div'); document.body.append(host);
  const shapeUtils = [...tl.defaultShapeUtils, CadBezierShapeUtil, CadPathShapeUtil, CadEllipseShapeUtil, CadArcShapeUtil];
  const editor = new tl.Editor({ store: tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils }), shapeUtils,
    bindingUtils: tl.defaultBindingUtils, tools: [...tl.defaultTools, ...tl.defaultShapeTools], getContainer: () => host, initialState: 'select' });
  editor.updateViewportScreenBounds(new tl.Box(0, 0, 800, 600));
  editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: cad.DEFAULT_CAD_SETTINGS } });
  const contour = (points: number[][], closed = false) => ({ closed, nodes: points.map(([x, y]) => curves.nodeAt({ x, y })) });
  const rectangle = (x: number, y: number, w: number, h: number) => contour([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true);
  const paint = { ...vector.VECTOR_DEFAULT_PAINT, fill: '#cc2200', stroke: '#112233', fillOpacity: .3, strokeOpacity: .8,
    strokeWidth: 7, lineCap: 'round', lineJoin: 'bevel', dash: [3, 5], dashOffset: 1 };
  const create = (type = 'cad-ellipse', props = {}, placement = {}, meta = { omsVectorPaint: structuredClone(paint), retained: 'metadata' }) => {
    const id = tl.createShapeId(); editor.createShape({ id, type, x: 100, y: 100, opacity: .4, ...placement, props, meta });
    return editor.getShape(id);
  };
  const snapshot = () => structuredClone(editor.store.getStoreSnapshot('document'));
  try { await run({ editor, tl, curves, cad, editing, shapeUtils, contour, rectangle, create, paint, snapshot }); }
  finally {
    editor.dispose(); host.remove(); channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
}


describe('native geometry conversion without changing artwork context', () => {
  it('preserves the source ID, nested singleton groups, alpha, local paint, controls and exact Undo/Redo', async () => harness(h => {
    const { editor, tl, cad, editing, curves, shapeUtils, paint, snapshot } = h;
    const outer=tl.createShapeId(),inner=tl.createShapeId(),sourceId=tl.createShapeId();
    editor.createShapes([
      {id:outer,type:'group',x:70,y:40,rotation:.3,opacity:.5,meta:{outer:'keep'}},
      {id:inner,type:'group',parentId:outer,x:20,y:35,rotation:-.2,opacity:.7,meta:{inner:'keep'}},
      {id:sourceId,type:'cad-ellipse',parentId:inner,x:30,y:15,rotation:.4,opacity:.4,
        props:{w:100,h:60,color:'red'},meta:{omsVectorPaint:paint,omsObjectName:'Original ellipse',retained:{value:2}}},
    ]);
    editor.select(sourceId);editor.updateInstanceState({opacityForNextShape:.2});editor.mark('conversion-fixture');
    const source=editor.getShape(sourceId),before=snapshot();
    const step=Math.min(Math.PI/2,Math.pow((.005/cad.cadMmPerPixel(cad.DEFAULT_CAD_SETTINGS)/100)*10000,1/6));
    const world=curves.mapContours([curves.arcContour(50,30,50,30,Math.PI,-Math.PI*2,step)],
      (point:any)=>editor.getShapePageTransform(source).applyToPoint(point));
    assert.equal(editing.getCadCurveConversionIssue(editor),null);
    assert.equal(editing.convertSelectionToCurves(editor,cad.DEFAULT_CAD_SETTINGS),true);
    const curve=editor.getShape(sourceId);assert.equal(curve.type,'cad-bezier');
    near(curve.props.contours[0].nodes[0].x,0);near(curve.props.contours[0].nodes[0].y,30);
    assert.ok(curve.props.contours[0].nodes[0].outY>0,'left-hand dash seam traverses down, matching native ellipse SVG');
    for(const key of ['id','parentId','index','x','y','rotation','opacity','isLocked','meta'])assert.deepEqual(curve[key],source[key]);
    assert.deepEqual(editor.getShape(outer),before.store[outer]);assert.deepEqual(editor.getShape(inner),before.store[inner]);
    const afterWorld=editing.shapeCadContours(editor,curve);
    world.forEach((c:any,ci:number)=>c.nodes.forEach((p:any,ni:number)=>{
      for(const key of ['x','y','inX','inY','outX','outY'])near(afterWorld[ci].nodes[ni][key],p[key]);
    }));
    near(curve.opacity*editor.getShape(inner).opacity*editor.getShape(outer).opacity*curve.meta.omsVectorPaint.fillOpacity,.042);
    assert.deepEqual(editor.getSelectedShapeIds(),[sourceId]);
    const after=snapshot();editor.undo();assert.deepEqual(snapshot(),before);editor.redo();assert.deepEqual(snapshot(),after);
    const restored=tl.createTLStore({shapeUtils,bindingUtils:tl.defaultBindingUtils});
    const serialized=JSON.parse(JSON.stringify(after));
    restored.loadStoreSnapshot(serialized);assert.deepEqual(restored.getStoreSnapshot('document'),serialized);
  }));

  it('converts mixed selections across rotated parents without combining objects or rewriting existing curves', async () => harness(h => {
    const {editor,tl,cad,editing,create,contour,snapshot}=h;
    const path=create('cad-path',{points:[{x:10,y:20},{x:80,y:45},{x:70,y:90}],closed:false}, {x:80,y:30,rotation:.2});
    const retained=create('cad-bezier',{contours:[contour([[0,0],[40,90]])]},{x:220,y:40,opacity:.25});
    const first=tl.createShapeId();editor.groupShapes([path.id,retained.id],{groupId:first});
    editor.updateShape({id:first,type:'group',rotation:.35,opacity:.6});
    const ellipse=create('cad-ellipse',{w:80,h:40},{x:400,y:180,rotation:-.7});
    const sibling=create('cad-path',{points:[{x:0,y:0},{x:30,y:40}],closed:false},{x:700,y:300});
    const second=tl.createShapeId();editor.groupShapes([ellipse.id,sibling.id],{groupId:second});
    editor.select(first,ellipse.id);editor.mark('conversion-mixed');
    const before=snapshot(),selected=[...editor.getSelectedShapeIds()];
    assert.equal(editing.convertSelectionToCurves(editor,cad.DEFAULT_CAD_SETTINGS),true);
    assert.equal(editor.getShape(path.id).type,'cad-bezier');assert.equal(editor.getShape(ellipse.id).type,'cad-bezier');
    for(const id of [path.id,ellipse.id])for(const key of ['parentId','index','x','y','rotation','opacity'])
      assert.equal(editor.getShape(id)[key],before.store[id][key]);
    for(const id of [first,second,retained.id,sibling.id])assert.deepEqual(editor.getShape(id),before.store[id]);
    assert.deepEqual(editor.getSelectedShapeIds(),selected);assert.equal(Object.keys(snapshot().store).length,Object.keys(before.store).length);
    const after=snapshot();editor.undo();assert.deepEqual(snapshot(),before);editor.redo();assert.deepEqual(snapshot(),after);
  }));

  it('leaves already-converted compound artwork and selected group roots unchanged, including redo history', async () => harness(h => {
    const {editor,tl,cad,editing,create,rectangle,snapshot}=h;
    const a=create('cad-bezier',{contours:[rectangle(0,0,100,80),rectangle(20,20,30,20)],fillRule:'evenodd'});
    const b=create('cad-bezier',{contours:[rectangle(0,0,40,30)]},{x:300});
    const group=tl.createShapeId();editor.groupShapes([a.id,b.id],{groupId:group});editor.select(group);editor.mark('conversion-noop');
    const before=snapshot();
    assert.equal(editing.convertSelectionToCurves(editor,cad.DEFAULT_CAD_SETTINGS),true);
    assert.deepEqual(snapshot(),before);assert.deepEqual(editor.getSelectedShapeIds(),[group]);
    editor.mark('extra-shape');const extra=create();editor.undo();assert.equal(editor.getShape(extra.id),undefined);assert.equal(editor.getCanRedo(),true);
    editor.select(group);const atUndo=snapshot();assert.equal(editing.convertSelectionToCurves(editor,cad.DEFAULT_CAD_SETTINGS),true);
    assert.deepEqual(snapshot(),atUndo);assert.equal(editor.getCanRedo(),true);editor.redo();assert.ok(editor.getShape(extra.id));
  }));

  it('captures active-theme native solid paint and physical native stroke width, including all flat fill modes', async () => harness(h => {
    const {editor,tl,cad,editing,create,snapshot}=h;
    editor.user.updateUserPreferences({colorScheme:'dark'});assert.equal(editor.user.getIsDarkMode(),true);
    const theme=tl.getDefaultColorTheme({isDarkMode:true});
    for(const fill of ['none','solid','semi','fill']){
      const source=create('geo',{geo:'rectangle',w:100,h:80,dash:'solid',fill,size:'l',scale:1.7,color:'red'}, {x:100},{});
      editor.select(source.id);const before=snapshot();assert.equal(editing.convertSelectionToCurves(editor,cad.DEFAULT_CAD_SETTINGS),true);
      const paint=editor.getShape(source.id).meta.omsVectorPaint;
      assert.equal(paint.stroke,theme.red.solid);near(paint.strokeWidth,8.5);
      assert.equal(paint.fill,fill==='none'?'none':fill==='solid'?theme.red.semi:fill==='semi'?theme.solid:theme.red.fill);
      assert.equal(paint.lineCap,'round');assert.equal(paint.lineJoin,'round');assert.deepEqual(paint.dash,[]);
      editor.undo();assert.deepEqual(snapshot(),before);
    }
  }));

  it('captures active-theme legacy CAD paint and preserves native straight-line points and widths', async () => harness(h => {
    const {editor,tl,cad,editing,create,snapshot}=h;
    editor.user.updateUserPreferences({colorScheme:'dark'});
    for(const type of ['cad-ellipse','line']){
      const props=type==='line'?{color:'red',dash:'solid',size:'m',scale:2,
        points:{a1:{id:'a1',index:'a1',x:12,y:21},a2:{id:'a2',index:'a2',x:78,y:52},a3:{id:'a3',index:'a3',x:99,y:10}}}:{color:'red'};
      const source=create(type,props,{},{});editor.select(source.id);editor.mark(`legacy-${type}`);
      const before=snapshot();assert.equal(editing.convertSelectionToCurves(editor,cad.DEFAULT_CAD_SETTINGS),true);
      const output=editor.getShape(source.id),theme=tl.getDefaultColorTheme({isDarkMode:true});
      assert.equal(output.meta.omsVectorPaint.stroke,theme.red.solid);assert.equal(output.meta.omsVectorPaint.fill,'none');
      if(type==='line'){
        assert.equal(output.meta.omsVectorPaint.strokeWidth,7);
        assert.deepEqual(output.props.contours[0].nodes.map((p:any)=>[p.x,p.y]),[[12,21],[78,52],[99,10]]);
      }
      editor.undo();assert.deepEqual(snapshot(),before);
    }
  }));

  it('retains unfilled analytic arcs and paths even when dormant source fill metadata exists', async () => harness(h => {
    const {editor,cad,editing,create,paint}=h;
    for(const [type,props] of [['cad-arc',{radius:40,startAngle:20,endAngle:170}],['cad-path',{points:[{x:0,y:0},{x:80,y:40}],closed:false}]] as const){
      const source=create(type,props);editor.select(source.id);
      assert.equal(editing.convertSelectionToCurves(editor,cad.DEFAULT_CAD_SETTINGS),true);
      const curve=editor.getShape(source.id);assert.ok(curve.props.contours.every((c:any)=>!c.closed));
      assert.equal(curve.meta.omsVectorPaint.fill,'none');assert.equal(curve.meta.omsVectorPaint.stroke,paint.stroke);
      assert.equal(curve.meta.omsVectorPaint.strokeWidth,paint.strokeWidth);assert.deepEqual(curve.meta.omsVectorPaint.dash,paint.dash);
    }
  }));

  it('refuses rough/dashed/pattern native paint and embedded labels with a specific remedy, without changing the source', async () => harness(h => {
    const {editor,cad,editing,create,snapshot}=h;
    for(const [patch,issue] of [[{dash:'draw'},'conversion-native-style'],[{dash:'dashed'},'conversion-native-style'],
      [{dash:'dotted'},'conversion-native-style'],[{fill:'pattern'},'conversion-native-style'],[{text:'Keep my label'},'conversion-native-label']] as const){
      const source=create('geo',{geo:'rectangle',dash:'solid',fill:'none',...patch},{},{});editor.select(source.id);const before=snapshot();
      assert.equal(editing.getCadCurveConversionIssue(editor),issue);
      assert.equal(editing.convertSelectionToCurves(editor,cad.DEFAULT_CAD_SETTINGS),false);assert.deepEqual(snapshot(),before);
    }
  }));

  it('preserves sources when protected, bound, clipped or unsupported geometry is selected', async () => harness(h => {
    const {editor,cad,editing,create,rectangle,paint,snapshot}=h;
    const source=create();editor.select(source.id);
    editor.updateInstanceState({isReadonly:true});let before=snapshot();assert.equal(editing.getCadCurveConversionIssue(editor),'readonly');
    assert.equal(editing.convertSelectionToCurves(editor,cad.DEFAULT_CAD_SETTINGS),false);assert.deepEqual(snapshot(),before);editor.updateInstanceState({isReadonly:false});
    editor.updateShape({id:source.id,type:source.type,isLocked:true});before=snapshot();assert.equal(editing.getCadCurveConversionIssue(editor),'locked');
    assert.equal(editing.convertSelectionToCurves(editor,cad.DEFAULT_CAD_SETTINGS),false);assert.deepEqual(snapshot(),before);editor.updateShape({id:source.id,type:source.type,isLocked:false});
    const original=editor.getBindingsInvolvingShape;editor.getBindingsInvolvingShape=()=>[{id:'binding:test'}] as any;
    before=snapshot();assert.equal(editing.getCadCurveConversionIssue(editor),'bound');assert.equal(editing.convertSelectionToCurves(editor,cad.DEFAULT_CAD_SETTINGS),false);assert.deepEqual(snapshot(),before);editor.getBindingsInvolvingShape=original;
    const clipped=create('cad-ellipse',{}, {},{omsVectorPaint:{...paint,clips:[{contours:[rectangle(0,0,20,30)],fillRule:'evenodd'}]},retained:'metadata'});
    editor.select(clipped.id);before=snapshot();assert.equal(editing.getCadCurveConversionIssue(editor),'unsupported');assert.equal(editing.convertSelectionToCurves(editor,cad.DEFAULT_CAD_SETTINGS),false);assert.deepEqual(snapshot(),before);
    const unsupported=create('geo',{geo:'cloud',dash:'solid'}, {},{});editor.select(unsupported.id);before=snapshot();assert.equal(editing.convertSelectionToCurves(editor,cad.DEFAULT_CAD_SETTINGS),false);assert.deepEqual(snapshot(),before);
  }));

  it('rolls back every replacement and group when native creation is refused partway through', async () => harness(h => {
    const {editor,tl,cad,editing,create,snapshot}=h;
    const a=create(),b=create('cad-path',{points:[{x:0,y:0},{x:50,y:40}],closed:false},{x:300});
    const group=tl.createShapeId();editor.groupShapes([a.id,b.id],{groupId:group});editor.select(group);editor.mark('conversion-rollback');
    const before=snapshot(),original=editor.createShape;let calls=0;
    editor.createShape=function(shape:any){if(++calls===2)return this;return original.call(this,shape);};
    try{assert.equal(editing.convertSelectionToCurves(editor,cad.DEFAULT_CAD_SETTINGS),false);}finally{editor.createShape=original;}
    assert.deepEqual(snapshot(),before);assert.deepEqual(editor.getSelectedShapeIds(),[group]);
  }));
});
