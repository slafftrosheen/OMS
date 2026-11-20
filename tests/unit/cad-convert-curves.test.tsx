import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { JSDOM } = createRequire(`${process.cwd()}/package.json`)('jsdom');
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

/** Actual native Editor/store/history; no browser, visual or hardware claim. */
async function harness(run: (h: any) => void | Promise<void>) {
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


describe('native CAD replacements preserve source context', () => {
  it('replaces text with filled glyphs under its original frame and group, with Undo/Redo and reload', async () => harness(async h => {
    const { editor, tl, cad, shapeUtils, create, snapshot } = h;
    const { prepareCadText } = await import('../../src/lib/components/canvas/cad-text');
    const { applyCadPlan } = await import('../../src/lib/components/canvas/cad-plans');
    const frame = create('frame', { w: 150, h: 180 }, { x: 200, y: 100, rotation: .2 }, {});
    const group = create('group', {}, { parentId: frame.id, x: 15, y: 25, rotation: -.3, opacity: .5 }, {});
    const source = create('text', { text: 'BŪVE', font: 'sans', size: 'm', scale: 2, color: 'red' },
      { parentId: group.id, x: 18, y: 26, rotation: .4, opacity: .4 }, { omsObjectName: 'Sign copy' });
    editor.select(source.id);
    editor.mark('outline-fixture');
    const font = readFileSync('static/tldraw/2.4.6/fonts/IBMPlexSans-Medium.woff2');
    const originalFetch = globalThis.fetch;
    const measure = editor.textMeasure.measureTextSpans;
    editor.textMeasure.measureTextSpans = () => [{ text: 'BŪVE', box: { x: 0, y: 0, w: 80, h: 24 } }];
    globalThis.fetch = async () => new Response(new Uint8Array(font));
    const before = snapshot();
    try {
      const options = { sourceId: source.id, text: '', font: 'sans', height: 20, x: 0, y: 0, keepSource: true };
      const kept = await prepareCadText(editor, cad.DEFAULT_CAD_SETTINGS, options);
      assert.equal(applyCadPlan(editor, kept), true);
      const copy = editor.getOnlySelectedShape();
      assert.equal(copy.parentId, group.id);
      assert.deepEqual(editor.getShape(source.id), source);
      assert.ok(copy.index > source.index);
      editor.undo();
      assert.deepEqual(snapshot(), before);
      editor.select(source.id);
      const replaced = await prepareCadText(editor, cad.DEFAULT_CAD_SETTINGS, { ...options, keepSource: false });
      editor.updateInstanceState({ opacityForNextShape: .1 });
      assert.equal(applyCadPlan(editor, replaced), true);
      const result = editor.getOnlySelectedShape();
      assert.equal(editor.getShape(source.id), undefined);
      for (const key of ['parentId', 'x', 'y', 'rotation', 'opacity']) assert.equal(result[key], source[key]);
      assert.equal(result.meta.omsObjectName, 'Sign copy');
      assert.equal(result.meta.omsVectorPaint.fill, tl.getDefaultColorTheme({ isDarkMode: editor.user.getIsDarkMode() }).red.solid);
      assert.equal(result.meta.omsVectorPaint.stroke, 'none');
      assert.equal(result.props.fillRule, 'nonzero');
      assert.ok(result.props.contours.length > 4);
      assert.deepEqual(editor.getShapeMask(result.id), editor.getShapeMask(group.id));
      const after = snapshot();
      editor.undo(); assert.deepEqual(snapshot(), before);
      editor.redo(); assert.deepEqual(snapshot(), after);
      const restored = tl.createTLStore({ shapeUtils, bindingUtils: tl.defaultBindingUtils });
      restored.loadStoreSnapshot(JSON.parse(JSON.stringify(after)));
      assert.deepEqual(restored.getStoreSnapshot('document'), after);
    } finally {
      globalThis.fetch = originalFetch;
      editor.textMeasure.measureTextSpans = measure;
    }
  }));

  it('keeps a collapsed group for Combine and restores exact local clip and gradient data on Break Apart', async () => harness(async h => {
    const { editor, cad, create, rectangle, paint, snapshot } = h;
    const { prepareCadCompound } = await import('../../src/lib/components/canvas/cad-compound');
    const { applyCadPlan } = await import('../../src/lib/components/canvas/cad-plans');
    const settings = cad.DEFAULT_CAD_SETTINGS;
    const group = create('group', {}, { x: 220, y: 130, rotation: -.2, opacity: .5 }, {});
    const gradient = { type: 'linear', matrix: [1, 0, 0, 1, 17, 22], start: [0, 0], end: [80, 0],
      r0: 0, r1: 0, stops: [{ offset: 0, color: '#bb3300' }, { offset: 1, color: '#ffe000' }] };
    const a = create('cad-bezier', { contours: [rectangle(0, 0, 30, 40)] },
      { parentId: group.id, x: 15, y: 18, opacity: .2 });
    const b = create('cad-bezier', { contours: [rectangle(0, 0, 80, 60)] },
      { parentId: group.id, x: 55, y: 35, rotation: .25, opacity: .6 },
      { omsVectorPaint: { ...paint, gradient }, omsObjectName: 'Primary art' });
    editor.select(a.id, b.id);
    editor.mark('combine-fixture');
    const before = snapshot();
    const plan = prepareCadCompound(editor, settings, 'combine');
    assert.ok(plan.warnings.includes('reference-appearance'));
    assert.equal(applyCadPlan(editor, plan), true);
    const combined = editor.getOnlySelectedShape();
    assert.deepEqual(editor.getShape(group.id), group);
    assert.equal(combined.parentId, group.id);
    assert.equal(combined.opacity, .6);
    assert.deepEqual(combined.meta.omsVectorPaint.gradient, gradient);
    const merged = snapshot();
    editor.undo(); assert.deepEqual(snapshot(), before);
    editor.redo(); assert.deepEqual(snapshot(), merged);
    const clipped = { ...combined.meta.omsVectorPaint, clips: [{ contours: [rectangle(0, 0, 50, 50)], fillRule: 'evenodd' }] };
    editor.updateShape({ id: combined.id, type: combined.type, meta: { ...combined.meta, omsVectorPaint: clipped } });
    const upper = create('cad-bezier', { contours: [rectangle(100, 100, 20, 20)] }, { parentId: group.id }, {});
    const otherCompound = create('cad-bezier', { contours: [rectangle(0, 0, 30, 30), rectangle(70, 5, 12, 25)] },
      { parentId: editor.getCurrentPageId() });
    editor.select(combined.id, otherCompound.id);
    editor.mark('break-fixture');
    const beforeBreak = snapshot();
    assert.equal(applyCadPlan(editor, prepareCadCompound(editor, settings, 'breakApart')), true);
    const parts = editor.getSelectedShapes().filter((shape: any) => shape.parentId === group.id);
    assert.equal(parts.length, 2);
    assert.equal(editor.getSelectedShapes().length, 4);
    const expected = combined.props.contours;
    parts.forEach((part: any, index: number) => {
      assert.ok(part.index > combined.index && part.index < upper.index);
      assert.deepEqual(part.props.contours, [expected[index]]);
      assert.deepEqual(part.meta.omsVectorPaint, clipped);
      assert.equal(part.opacity, .6);
    });
    const afterBreak = snapshot();
    editor.undo(); assert.deepEqual(snapshot(), beforeBreak);
    editor.redo(); assert.deepEqual(snapshot(), afterBreak);
  }));

  it('keeps Join and Trim at their reference stacking positions and refuses mixed clipping', async () => harness(async h => {
    const { editor, cad, create, contour, rectangle, paint, snapshot } = h;
    const { prepareCadJoin } = await import('../../src/lib/components/canvas/cad-join');
    const { prepareCadShaping } = await import('../../src/lib/components/canvas/cad-shaping');
    const { applyCadPlan } = await import('../../src/lib/components/canvas/cad-plans');
    const settings = cad.DEFAULT_CAD_SETTINGS;
    const group = create('group', {}, { x: 180, y: 125, rotation: .5, opacity: .6 }, {});
    const a = create('cad-bezier', { contours: [contour([[0, 0], [60, 10]])] },
      { x: 2, y: 3, parentId: group.id, opacity: .3 });
    const b = create('cad-bezier', { contours: [contour([[70, 15], [130, 35]])] },
      { x: 2, y: 3, parentId: group.id, opacity: .7 });
    const top = create('cad-bezier', { contours: [rectangle(350, 350, 50, 60)] }, { parentId: group.id });
    editor.select(a.id, b.id);
    const join = prepareCadJoin(editor, settings, { mode: 'bridge', pairing: 'nearest', toleranceMm: .01 });
    assert.ok(join.warnings.includes('reference-appearance'));
    assert.equal(applyCadPlan(editor, join), true);
    const result = editor.getOnlySelectedShape();
    assert.equal(result.parentId, group.id);
    assert.equal(result.opacity, a.opacity);
    assert.ok(result.index > a.index && result.index < b.index);
    const target = create('cad-bezier', { contours: [rectangle(0, 0, 100, 100)] },
      { x: 10, y: 25, parentId: group.id, opacity: .25 });
    const cutter = create('cad-bezier', { contours: [rectangle(50, 0, 100, 100)] },
      { x: 10, y: 25, parentId: group.id, opacity: .9 },
      { omsVectorPaint: { ...paint, fill: '#002299' } });
    editor.select(target.id, cutter.id);
    editor.mark('trim-fixture');
    const before = snapshot();
    const options = { operation: 'trim' as const, targetId: target.id, keepSources: false, toleranceMm: .01, offset: 1, join: 'miter' as const };
    const trim = prepareCadShaping(editor, settings, options);
    assert.equal(applyCadPlan(editor, trim), true);
    const trimmed = editor.getOnlySelectedShape();
    assert.equal(trimmed.parentId, group.id);
    assert.equal(trimmed.opacity, .25);
    assert.deepEqual(trimmed.meta.omsVectorPaint, paint);
    assert.ok(trimmed.index > target.index && trimmed.index < cutter.index);
    assert.deepEqual(editor.getShape(top.id), top);
    const after = snapshot();
    editor.undo(); assert.deepEqual(snapshot(), before);
    editor.redo(); assert.deepEqual(snapshot(), after);
    editor.undo();
    editor.updateShape({ id: cutter.id, type: cutter.type, meta: { omsVectorPaint: { ...paint,
      clips: [{ contours: [rectangle(60, 0, 15, 15)], fillRule: 'evenodd' }] } } });
    const clipped = snapshot();
    assert.throws(() => prepareCadShaping(editor, settings, options), /mixed-clips/);
    assert.deepEqual(snapshot(), clipped);
  }));
});


describe('native Bézier node handles', () => {
  it('keeps handles for large paths after zoom and translates Shift-selected nodes in one native drag', async () => harness(async h => {
    const { editor, create, contour, snapshot } = h;
    const { getSelectedCadNodes, installCadNodeSelection, setCadNodeEditing } = await import('../../src/lib/components/canvas/cad-node-selection');
    const source = create('cad-bezier', { contours: [contour(Array.from({ length: 300 }, (_, i) => [i * 32, 80]))] },
      { x: 20, y: 30 }, {});
    editor.select(source.id);
    editor.mark('native-node-fixture');
    setCadNodeEditing(editor, true);
    const initial = editor.getShapeHandles(source);
    assert.ok(initial.length > 1 && initial.length <= 160);
    editor.setCamera({ x: -2800, y: 0, z: 2 });
    const handles = editor.getShapeHandles(source);
    assert.ok(handles.some((handle: any) => handle.id === '0:91:node'));
    assert.ok(!handles.some((handle: any) => handle.id === '0:4:node'));
    const a = handles.find((handle: any) => handle.id === '0:91:node'), b = handles.find((handle: any) => handle.id === '0:93:node');
    assert.ok(a && b);
    const off = installCadNodeSelection(editor);
    const before = snapshot();
    const dispatch = (name: string, handle: any, shiftKey = false, dx = 0, dy = 0) => {
      const shape = editor.getShape(source.id);
      const point = editor.pageToScreen(editor.getShapePageTransform(shape).applyToPoint(handle));
      editor.dispatch({ type: 'pointer', name, target: 'handle', handle, shape, pointerId: 1, button: 0,
        point: { x: point.x + dx, y: point.y + dy, z: 0 }, isPen: false, shiftKey, ctrlKey: false, altKey: false, accelKey: false });
    };
    try {
      dispatch('pointer_down', a); dispatch('pointer_up', a);
      dispatch('pointer_down', b, true); dispatch('pointer_up', b, true);
      assert.deepEqual(getSelectedCadNodes(editor).map(node => node.nodeIndex), [91, 93]);
      dispatch('pointer_down', a);
      // The native editor debounces modifier releases for 150 ms before dragging.
      await new Promise<void>(resolve => setTimeout(resolve, 200));
      dispatch('pointer_move', a, false, 24, 16);
      dispatch('pointer_up', a, false, 24, 16);
      const nodes = editor.getShape(source.id).props.contours[0].nodes;
      near(nodes[91].x, 91 * 32 + 12);
      near(nodes[91].y, 88);
      near(nodes[93].x, 93 * 32 + 12);
      near(nodes[93].y, 88);
      assert.deepEqual(nodes[92], source.props.contours[0].nodes[92]);
      assert.deepEqual(getSelectedCadNodes(editor).map(node => node.nodeIndex), [93, 91]);
      const after = snapshot();
      editor.undo(); assert.deepEqual(snapshot(), before);
      editor.redo(); assert.deepEqual(snapshot(), after);
    } finally { off(); }
  }));
});


describe('native node marquee', () => {
  async function withMarquee(h: any, run: (tools: any) => void) {
    const { editor, create, contour } = h;
    const { Box } = h.tl;
    const { getSelectedCadNodes, setCadNodeEditing } = await import('../../src/lib/components/canvas/cad-node-selection');
    const { cadNodeMarquee, installCadNodeMarquee } = await import('../../src/lib/components/canvas/cad-node-marquee');
    const shape = create('cad-bezier', { contours: [contour(Array.from({ length: 300 }, (_, i) => [i * 2, 0]))] },
      { x: 90, y: 165, rotation: .35 }, {});
    editor.select(shape.id);
    editor.updateViewportScreenBounds(new Box(0, 0, 800, 600));
    editor.mark('node-marquee-fixture');
    setCadNodeEditing(editor, true);
    const canvas = document.createElement('div');
    canvas.className = 'tl-canvas';
    canvas.dataset.testid = 'canvas';
    const background = document.createElement('div');
    background.className = 'tl-background';
    canvas.appendChild(background);
    editor.getContainer().appendChild(canvas);
    const stop = installCadNodeMarquee(editor);
    const x = (index: number) => editor.pageToScreen(editor.getShapePageTransform(shape).applyToPoint({ x: index * 2, y: 0 })).x;
    const pointer = (name: string, coordX: number, y: number, shiftKey = false, target: EventTarget = background) => {
      const event = new window.MouseEvent(name, { bubbles: true, cancelable: true, button: 0, clientX: coordX, clientY: y, shiftKey });
      Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true }, pointerType: { value: 'mouse' } });
      target.dispatchEvent(event);
      return event;
    };
    try {
      run({ editor, shape, x, canvas, pointer, setCadNodeEditing, preview: () => cadNodeMarquee(editor).get(),
        selected: () => getSelectedCadNodes(editor).map(node => node.nodeIndex) });
    } finally { stop(); canvas.remove(); }
  }

  it('selects unsampled anchors of a rotated dense curve, adds in reverse with Shift and leaves history alone', async () => harness(async h => {
    await withMarquee(h, ({ editor, shape, x, pointer, preview, selected }: any) => {
      const before = h.snapshot();
      const handles = editor.getShapeHandles(shape).length;
      assert.ok(handles < shape.props.contours[0].nodes.length);
      assert.equal(pointer('pointerdown', x(10) - .5, 120).defaultPrevented, true);
      pointer('pointermove', x(70) + .5, 260);
      assert.ok(preview().w > 100);
      assert.deepEqual(selected(), [0], 'selection is committed only on pointer release');
      pointer('pointerup', x(70) + .5, 260, false, document.body);
      assert.equal(preview(), null);
      assert.deepEqual(selected(), Array.from({ length: 61 }, (_, i) => i + 10));
      pointer('pointerdown', x(92) + .5, 260, true);
      pointer('pointerup', x(90) - .5, 120, true);
      assert.deepEqual(selected().slice(-3), [90, 91, 92]);
      assert.equal(selected().length, 64);
      pointer('pointerdown', 650, 120);
      pointer('pointerup', 650, 120);
      assert.deepEqual(selected(), []);
      assert.equal(editor.getOnlySelectedShape()?.id, shape.id);
      assert.deepEqual(h.snapshot(), before);
    });
  }));

  it('renders the marquee with page-space SVG bounds and removes it on cancellation', async () => harness(async h => {
    const { editor, create, contour } = h;
    const React = await import('react'), { createRoot } = await import('react-dom/client');
    const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
    const { CadNodeSelectionOverlay } = await import('../../src/lib/components/canvas/CadNodeSelectionOverlay');
    const { cadNodeMarquee } = await import('../../src/lib/components/canvas/cad-node-marquee');
    const { setCadNodeEditing } = await import('../../src/lib/components/canvas/cad-node-selection');
    const shape = create('cad-bezier', { contours: [contour([[0, 0], [150, 150]])] }, {}, {});
    editor.select(shape.id);
    setCadNodeEditing(editor, true);
    const host = editor.getContainer(), root = createRoot(host);
    const query = () => host.querySelector('[data-testid="cad-node-marquee"]');
    try {
      await React.act(async () => root.render(<EditorContext.Provider value={editor}>
        <CadNodeSelectionOverlay />
      </EditorContext.Provider>));
      await React.act(async () => cadNodeMarquee(editor).set({ x: 40, y: 50, w: 120, h: 90 }));
      const rect = query();
      assert.equal(rect?.getAttribute('x'), '40');
      assert.equal(rect?.getAttribute('y'), '50');
      assert.equal(rect?.getAttribute('width'), '120');
      assert.equal(rect?.getAttribute('height'), '90');
      await React.act(async () => cadNodeMarquee(editor).set(null));
      assert.equal(query(), null);
    } finally { await React.act(async () => root.unmount()); }
  }));

  it('cancels on Escape, camera changes and lost capture and leaves native handle events alone', async () => harness(async h => {
    await withMarquee(h, ({ editor, x, canvas, pointer, preview, selected, setCadNodeEditing }: any) => {
      const start = () => {
        pointer('pointerdown', x(10) - .5, 120);
        pointer('pointermove', x(70) + .5, 260);
        assert.ok(preview());
      };
      start();
      const escape = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      canvas.dispatchEvent(escape);
      canvas.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'Escape', bubbles: true, cancelable: true }));
      assert.equal(escape.defaultPrevented, true);
      assert.equal(preview(), null);
      assert.deepEqual(selected(), [0]);
      start();
      editor.setCamera({ x: -15, y: 0, z: 1 });
      pointer('pointerup', x(70), 260);
      assert.equal(preview(), null);
      assert.deepEqual(selected(), [0]);
      start();
      pointer('lostpointercapture', 0, 0);
      assert.equal(preview(), null);
      const handle = document.createElement('div');
      handle.className = 'tl-handle';
      canvas.appendChild(handle);
      assert.equal(pointer('pointerdown', 100, 160, false, handle).defaultPrevented, false);
      setCadNodeEditing(editor, false);
      assert.equal(pointer('pointerdown', 100, 160).defaultPrevented, false);
      assert.deepEqual(selected(), [0]);
    });
  }));
});


describe('native bounded node reduction', () => {
  it('uses physical scale, remaps selected anchors and changes one record with native Undo/Redo', async () => harness(async h => {
    const { editor, create, contour, cad, paint, snapshot } = h;
    const { prepareNodeReduction, applyNodeReduction } = await import('../../src/lib/components/canvas/cad-node-reduction');
    const { getSelectedCadNodes, setSelectedCadNodes } = await import('../../src/lib/components/canvas/cad-node-selection');
    const group = create('group', {}, { x: 180, y: 125, rotation: .5, opacity: .45 }, {});
    const source = create('cad-bezier', { contours: [contour([[0, 0], [100, .2], [200, 0], [240, 0]])] },
      { parentId: group.id, x: 15, y: 25, rotation: -.35, opacity: .4 }, { omsObjectName: 'Badge shape', omsVectorPaint: paint });
    editor.select(source.id);
    editor.updatePage({ id: editor.getCurrentPageId(), meta: { omsCad: { ...cad.DEFAULT_CAD_SETTINGS, unit: 'in', scale: 3 } } });
    editor.mark('node-reduction-fixture');
    const options = { tolerance: .2, selectedOnly: true };
    setSelectedCadNodes(editor, [3, 1, 0].map(nodeIndex => ({ contourIndex: 0, nodeIndex })));
    const before = snapshot(), plan = prepareNodeReduction(editor, options);
    assert.equal(plan.unit, 'mm');
    assert.equal(plan.before, 4);
    assert.equal(plan.removed, 1);
    assert.ok(plan.error >= .2 * cad.cadMmPerPixel({ ...cad.DEFAULT_CAD_SETTINGS, scale: 3 }) && plan.error <= .2);
    assert.deepEqual(snapshot(), before);
    assert.equal(applyNodeReduction(editor, plan), true);
    const applied = editor.getShape(source.id);
    assert.deepEqual(applied, { ...source, props: { ...source.props, contours: plan.local } });
    assert.deepEqual(getSelectedCadNodes(editor), [2, 0].map(nodeIndex => ({ shapeId: source.id, contourIndex: 0, nodeIndex })));
    assert.deepEqual(editor.getShape(group.id), group);
    const after = snapshot();
    editor.undo(); assert.deepEqual(snapshot(), before);
    editor.redo(); assert.deepEqual(snapshot(), after);
  }));

  it('shows a before/after preview and applies it through the node docker', async () => harness(async h => {
    const { editor, create, contour, cad, tl } = h;
    const React = await import('react'), { createRoot } = await import('react-dom/client');
    const { EditorContext } = await import('../../node_modules/@tldraw/editor/dist-esm/lib/hooks/useEditor.mjs');
    const { CadNodeReducePanel } = await import('../../src/lib/components/canvas/CadNodeReducePanel');
    const { cadRevision } = await import('../../src/lib/components/canvas/cad-plans');
    const { locale } = await import('svelte-i18n');
    locale.set('en');
    const source = create('cad-bezier', { contours: [contour([[0, 0], [20, 0], [40, 0]])] }, {}, {});
    editor.select(source.id);
    const host = editor.getContainer(), root = createRoot(host);
    function Panel() {
      const revision = tl.useValue('reduction test revision', () => cadRevision(editor), [editor]);
      return <CadNodeReducePanel settings={cad.DEFAULT_CAD_SETTINGS} revision={revision} disabled={false} focusSequence={1} />;
    }
    try {
      await React.act(async () => root.render(<EditorContext.Provider value={editor}><Panel /></EditorContext.Provider>));
      const details = host.querySelector('details') as HTMLDetailsElement;
      assert.equal(details.open, true);
      assert.equal(document.activeElement, details.querySelector('summary'));
      const form = details.querySelector('form')!;
      await React.act(async () => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
      const report = details.querySelector('[data-testid="drawing-node-reduction-review"]')!;
      assert.ok(report);
      assert.match(report.textContent!, /3 → 2/);
      assert.match(report.textContent!, /≤ 0 mm/);
      assert.equal(report.querySelectorAll('svg path').length, 2);
      assert.equal(editor.getShape(source.id).props.contours[0].nodes.length, 3);
      await React.act(async () => report.querySelector('button')!.click());
      assert.equal(editor.getShape(source.id).props.contours[0].nodes.length, 2);
      assert.equal(details.querySelector('[data-testid="drawing-node-reduction-review"]'), null);
    } finally { await React.act(async () => root.unmount()); }
  }));

  it('blocks stale selections, forged geometry, clipped sources and read-only changes', async () => harness(async h => {
    const { editor, create, contour, paint, snapshot } = h;
    const { prepareNodeReduction, applyNodeReduction } = await import('../../src/lib/components/canvas/cad-node-reduction');
    const { setSelectedCadNodes } = await import('../../src/lib/components/canvas/cad-node-selection');
    const source = create('cad-bezier', { contours: [contour([[0, 0], [20, 0], [40, 0]])] }, {}, {});
    editor.select(source.id);
    editor.updatePage({ id: editor.getCurrentPageId(), meta: {} });
    editor.mark('node-reduction-stale');
    const options = { tolerance: .3, selectedOnly: false };
    const before = snapshot(), plan = prepareNodeReduction(editor, options);
    assert.equal(plan.unit, 'px');
    assert.equal(plan.removed, 1);
    assert.equal(applyNodeReduction(editor, { ...plan, local: source.props.contours }), false);
    setSelectedCadNodes(editor, [{ contourIndex: 0, nodeIndex: 1 }]);
    assert.equal(applyNodeReduction(editor, plan), false);
    const valid = prepareNodeReduction(editor, options);
    editor.updateInstanceState({ isReadonly: true });
    assert.equal(applyNodeReduction(editor, valid), false);
    assert.deepEqual(snapshot(), before);
    editor.updateInstanceState({ isReadonly: false });
    editor.updateShape({ id: source.id, type: source.type, meta: { omsVectorPaint: { ...paint,
      clips: [{ contours: [contour([[0, 0], [40, 0], [20, 20]], true)], fillRule: 'evenodd' }] } } });
    assert.throws(() => prepareNodeReduction(editor, options), /unsupported/);
  }));
});
