import {describe,it} from 'vitest';
import type {TLShapeId} from '@tldraw/tldraw';
import assert from 'node:assert/strict';
import DxfParser from 'dxf-parser';
import {fixture} from '../helpers/cad-editor';
import {arrangementRoots,arrangeGapFromDisplay,MAX_ARRANGE_GAP,prepareArrangePlan,applyArrangePlan,type ArrangeOptions} from '../../src/lib/components/canvas/drawing-arrange';
import {getCadShapePageBounds} from '../../src/lib/components/canvas/cad-bounds';
import {nodeAt} from '../../src/lib/components/canvas/cad-curves';
import {DEFAULT_CAD_SETTINGS,unitLengthToCanvas,canvasLengthToUnit} from '../../src/lib/components/canvas/cad-settings';
import {buildCadDxf} from '../../src/lib/components/canvas/cad-dxf';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const code=(value:string)=>(error:any)=>error.code===value;
function setup(){
 const f=fixture();
 for(const [id,x,y,w,h] of [['a',10,20,20,10],['b',100,70,40,30],['c',200,140,10,20]] as const)
  f.editor.createShape({id:`shape:${id}`,type:'cad-ellipse',x,y,props:{w,h}});
 f.editor.setSelectedShapes(['shape:c','shape:a','shape:b']);return f;
}
const bounds=(f:ReturnType<typeof fixture>,id:string)=>getCadShapePageBounds(f.editor,f.editor.getShape(`shape:${id}`))!;
const apply=(f:ReturnType<typeof fixture>,options:ArrangeOptions)=>{const plan=prepareArrangePlan(f.editor,options);assert.equal(applyArrangePlan(f.editor,plan),true);return plan;};

describe('precise alignment to selection and reference objects',()=>{
 for(const axis of ['x','y'] as const)for(const alignment of ['start','center','end'] as const)it(`aligns ${axis} ${alignment} to a fixed named object`,()=>{
  const f=setup(),before=structuredClone(f.editor.getShape('shape:b')),key=bounds(f,'b'),size=axis==='x'?'w':'h',factor=alignment==='start'?0:alignment==='center'?.5:1;
  const target=key[axis]+key[size]*factor;
  apply(f,{kind:'align',axis,alignment,reference:'shape:b' as TLShapeId});
  assert.deepEqual(f.editor.getShape('shape:b'),before);
  for(const id of ['a','b','c'])near(bounds(f,id)[axis]+bounds(f,id)[size]*factor,target);
  // Cross-axis location, geometry, rotation and styling remain unchanged.
  const other=axis==='x'?'y':'x';near(bounds(f,'a')[other],axis==='x'?20:10);
  assert.equal(f.marks.length,2);f.editor.bailToMark(f.marks[0].id);near(bounds(f,'a').x,10);near(bounds(f,'c').y,140);
 });
 it('centres on the complete selection bounds, rather than averaging origins',()=>{
  const f=setup();apply(f,{kind:'align',axis:'x',alignment:'center',reference:'selection'});
  for(const id of ['a','b','c'])near(bounds(f,id).center.x,110);
 });
 it('uses analytic rotated ellipse and cubic bounds instead of rectangular hit envelopes',()=>{
  const f=fixture();f.editor.createShape({id:'shape:ellipse',type:'cad-ellipse',x:100,y:80,rotation:Math.PI/4,props:{w:80,h:20}});
  const a=nodeAt({x:0,y:0}),b=nodeAt({x:100,y:0});a.outY=-80;b.inY=-80;
  f.editor.createShape({id:'shape:curve',type:'cad-bezier',x:0,y:150,props:{contours:[{closed:false,nodes:[a,b]}]}});
  f.editor.setSelectedShapes(['shape:ellipse','shape:curve']);const reference=bounds(f,'ellipse'),before=structuredClone(f.editor.getShape('shape:curve').props);
  apply(f,{kind:'align',axis:'y',alignment:'start',reference:'shape:ellipse' as TLShapeId});
  near(bounds(f,'curve').y,reference.y);assert.deepEqual(f.editor.getShape('shape:curve').props,before);
 });
 it('treats a rotated group as one motif and de-duplicates selected descendants',()=>{
  const f=setup();f.editor.createShape({id:'shape:group',type:'group',x:90,y:100,rotation:.6});
  f.editor.updateShape({id:'shape:a',parentId:'shape:group',rotation:.3,opacity:.4,meta:{omsObjectName:'Letter front'}});
  f.editor.updateShape({id:'shape:b',parentId:'shape:group'});
  const a=bounds(f,'a'),b=bounds(f,'b'),before=structuredClone(f.editor.getShape('shape:a'));
  f.editor.setSelectedShapes(['shape:group','shape:a','shape:c']);assert.deepEqual(arrangementRoots(f.editor),['shape:group','shape:c']);
  apply(f,{kind:'align',axis:'x',alignment:'start',reference:'shape:c' as TLShapeId});
  near(Math.min(bounds(f,'a').x,bounds(f,'b').x),bounds(f,'c').x);
  near(bounds(f,'b').x-bounds(f,'a').x,b.x-a.x);near(bounds(f,'b').y-bounds(f,'a').y,b.y-a.y);
  assert.deepEqual(f.editor.getShape('shape:a'),before);assert.equal(f.shapes.size,4);
 });
 it('moves siblings in rotated parents by page axes without altering curves or parent membership',()=>{
  const f=setup();f.editor.createShape({id:'shape:parent',type:'group',rotation:.7,x:400,y:100});
  f.editor.updateShape({id:'shape:a',parentId:'shape:parent'});f.editor.updateShape({id:'shape:b',parentId:'shape:parent'});
  const before=f.editor.getSelectedShapes().map((s:any)=>structuredClone(s));
  apply(f,{kind:'align',axis:'y',alignment:'end',reference:'selection'});
  const end=bounds(f,'c').maxY;for(const id of ['a','b','c'])near(bounds(f,id).maxY,end);
  for(const old of before){const s=f.editor.getShape(old.id);assert.deepEqual(s.props,old.props);assert.equal(s.parentId,old.parentId);assert.equal(s.rotation,old.rotation);}
 });
});

describe('equal and exact distribution',()=>{
 it('distributes edge gaps with the outside objects fixed and no size changes',()=>{
  const f=setup(),a=structuredClone(f.editor.getShape('shape:a')),c=structuredClone(f.editor.getShape('shape:c'));
  const plan=apply(f,{kind:'distribute',axis:'x',mode:'gaps'});near(plan.gap!,65);
  near(bounds(f,'b').x-bounds(f,'a').maxX,65);near(bounds(f,'c').x-bounds(f,'b').maxX,65);
  assert.deepEqual(f.editor.getShape('shape:a'),a);assert.deepEqual(f.editor.getShape('shape:c'),c);
 });
 it('distributes centres with unequal object sizes and fixed extreme centres',()=>{
  const f=setup();apply(f,{kind:'distribute',axis:'x',mode:'centers'});
  near(bounds(f,'b').center.x,112.5);near(bounds(f,'b').center.x-bounds(f,'a').center.x,bounds(f,'c').center.x-bounds(f,'b').center.x);
  near(bounds(f,'b').w,40);
 });
 it('requires enough room for equal gaps but explicitly permits centre-based overlap',()=>{
  const f=setup();f.editor.updateShape({id:'shape:b',x:20,props:{w:400}});
  assert.throws(()=>prepareArrangePlan(f.editor,{kind:'distribute',axis:'x',mode:'gaps'}),code('arrangeOverlap'));
  assert.equal(f.marks.length,0);apply(f,{kind:'distribute',axis:'x',mode:'centers'});
 });
 for(const axis of ['x','y'] as const)for(const anchor of ['start','end','shape:b'] as const)it(`spaces on ${axis} with ${anchor} fixed`,()=>{
  const f=setup(),fixed=anchor==='start'?'a':anchor==='end'?'c':'b',before=structuredClone(f.editor.getShape(`shape:${fixed}`));
  apply(f,{kind:'space',axis,gap:12.5,anchor:anchor as 'start'|'end'|TLShapeId});const end=axis==='x'?'maxX':'maxY';
  near(bounds(f,'b')[axis]-bounds(f,'a')[end],12.5);near(bounds(f,'c')[axis]-bounds(f,'b')[end],12.5);
  assert.deepEqual(f.editor.getShape(`shape:${fixed}`),before);
 });
 it('orders coincident objects stably and allows touching with zero gap',()=>{
  const f=setup();for(const id of ['a','b','c'])f.editor.updateShape({id:`shape:${id}`,x:10});
  apply(f,{kind:'space',axis:'x',gap:0,anchor:'shape:b' as TLShapeId});
  near(bounds(f,'a').maxX,bounds(f,'b').x);near(bounds(f,'b').maxX,bounds(f,'c').x);near(bounds(f,'b').x,10);
 });
 it('allows zero-width lines in spacing and leaves an already correct layout out of history',()=>{
  const f=fixture();for(const [id,x] of [['a',0],['b',50]] as const)f.editor.createShape({id:`shape:${id}`,type:'cad-path',x,props:{closed:false,points:[{x:0,y:0},{x:0,y:100}]}});
  f.editor.setSelectedShapes(['shape:a','shape:b']);const plan=apply(f,{kind:'space',axis:'x',gap:50,anchor:'start'});
  assert.equal(plan.moved,0);assert.equal(f.marks.length,0);
 });
 it('exports exact physical gaps independently of document scale, units and zoom',()=>{
  const f=fixture(),settings={...DEFAULT_CAD_SETTINGS,unit:'in' as const,scale:10};
  for(const [id,x] of [['a',0],['b',200]] as const)f.editor.createShape({id:`shape:${id}`,type:'cad-ellipse',x,props:{w:20,h:20}});
  f.editor.setSelectedShapes(['shape:a','shape:b']);f.state.zoom=.1;
  apply(f,{kind:'space',axis:'x',gap:unitLengthToCanvas(.5,settings),anchor:'start'});
  const dxf=new DxfParser().parseSync(buildCadDxf(f.editor,'selected',settings).text)!;
  const circles=(dxf.entities as any[]).filter(e=>e.type==='CIRCLE').sort((a,b)=>a.center.x-b.center.x);
  assert.equal(circles.length,2);near(circles[1].center.x-circles[0].center.x-circles[0].radius-circles[1].radius,12.7);
 });
});

describe('arrangement validation and atomic application',()=>{
 it('accepts the displayed spacing maximum across units and rejects values above it',()=>{
  for(const unit of ['mm','cm','m','in'] as const)for(const scale of [.001,.1,1,10,10000]){
   const settings={...DEFAULT_CAD_SETTINGS,unit,scale},max=canvasLengthToUnit(MAX_ARRANGE_GAP,settings);
   near(arrangeGapFromDisplay(Number(String(max)),settings)!,MAX_ARRANGE_GAP);
   assert.equal(arrangeGapFromDisplay(max*1.000001,settings),undefined);
   assert.equal(arrangeGapFromDisplay(-1,settings),undefined);
  }
  assert.equal(arrangeGapFromDisplay(0,null),0);assert.equal(arrangeGapFromDisplay(NaN,null),undefined);
  near(arrangeGapFromDisplay(12.7,DEFAULT_CAD_SETTINGS)!,48);
 });
 it('rejects invalid axis, gaps, target objects and insufficient distinct roots',()=>{
  const f=setup();for(const gap of [-1,Infinity,NaN,100001])assert.throws(()=>prepareArrangePlan(f.editor,{kind:'space',axis:'x',gap,anchor:'start'}),code('arrangeGap'));
  assert.throws(()=>prepareArrangePlan(f.editor,{kind:'align',axis:'z',alignment:'start',reference:'selection'} as any));
  assert.throws(()=>prepareArrangePlan(f.editor,{kind:'align',axis:'x',alignment:'start',reference:'shape:missing' as TLShapeId}),code('arrangeSelection'));
  f.editor.setSelectedShapes(['shape:a','shape:b']);assert.throws(()=>prepareArrangePlan(f.editor,{kind:'distribute',axis:'x',mode:'gaps'}));
  f.editor.setSelectedShapes(['shape:a']);assert.throws(()=>prepareArrangePlan(f.editor,{kind:'space',axis:'x',gap:2,anchor:'start'}));
  assert.equal(f.marks.length,0);
 });
 it('rejects a move if an outer edge or local origin would exceed document limits',()=>{
  const f=setup();f.editor.updateShape({id:'shape:c',x:999990});
  assert.throws(()=>prepareArrangePlan(f.editor,{kind:'align',axis:'x',alignment:'start',reference:'shape:c' as TLShapeId}),code('arrangeBounds'));
  assert.equal(f.marks.length,0);
 });
 for(const state of ['readonly','locked-descendant','protected-descendant','form-ancestor','frame-ancestor','bound','clipped'] as const)it(`blocks ${state} without mutation`,()=>{
  const f=setup();f.editor.createShape({id:'shape:group',type:'group'});f.editor.updateShape({id:'shape:a',parentId:'shape:group'});
  f.editor.setSelectedShapes(['shape:group','shape:b']);
  if(state==='readonly')f.state.isReadonly=true;
  if(state==='locked-descendant')f.editor.updateShape({id:'shape:a',isLocked:true});
  if(state==='protected-descendant')f.editor.updateShape({id:'shape:a',type:'order-details'});
  if(state==='form-ancestor'||state==='frame-ancestor'){f.editor.createShape({id:'shape:parent',type:state==='form-ancestor'?'order-details':'frame'});f.editor.updateShape({id:'shape:group',parentId:'shape:parent'});}
  if(state==='bound')f.state.bindings=[{}];
  if(state==='clipped')f.editor.updateShape({id:'shape:a',meta:{omsVectorPaint:{clips:[{}]}}});
  assert.throws(()=>prepareArrangePlan(f.editor,{kind:'space',axis:'x',gap:2,anchor:'start'}));assert.equal(f.marks.length,0);
 });
 for(const state of ['drawing','selection','readonly','locked','rejected-update','partial-update','capacity'] as const)it(`refuses ${state} after preparation and leaves no partial edit`,()=>{
  const f=setup(),plan=prepareArrangePlan(f.editor,{kind:'space',axis:'x',gap:12,anchor:'start'});
  if(state==='drawing')f.editor.updateShape({id:'shape:b',y:60});
  if(state==='selection')f.editor.setSelectedShapes(['shape:a','shape:b']);
  if(state==='readonly')f.state.isReadonly=true;
  if(state==='locked')f.editor.updateShape({id:'shape:b',isLocked:true});
  if(state==='rejected-update')f.editor.updateShapes=()=>{};
  if(state==='partial-update'){const update=f.editor.updateShapes;f.editor.updateShapes=(patches:any[])=>{update(patches.slice(0,1));};}
  if(state==='capacity')f.editor.store={getStoreSnapshot:()=>'x'.repeat(1_900_001)};
  const before=structuredClone([...f.shapes.values()]);assert.equal(applyArrangePlan(f.editor,plan),false);
  assert.deepEqual([...f.shapes.values()],before);assert.equal(f.marks.length,0);
 });
});
