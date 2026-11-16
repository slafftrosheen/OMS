import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {getSelectedCadNode,getSelectedCadNodes,setSelectedCadNodes,selectCadNode,inspectCadNodeEvent,setCadNodeEditing} from '../../src/lib/components/canvas/cad-node-selection';
import {prepareNodeArrange,applyNodeArrange} from '../../src/lib/components/canvas/cad-node-arrange';
import {CadBezierShapeUtil} from '../../src/lib/components/canvas/shapes/CadBezierShape';
import {updateCadCurveNode,reverseCadContour,splitCadCurveSegment,setCadSegmentKind} from '../../src/lib/components/canvas/cad-editing';
import {DEFAULT_CAD_SETTINGS,canvasPointToCad} from '../../src/lib/components/canvas/cad-settings';
const n=(x:number,y:number)=>({x,y,inX:-2,inY:3,outX:5,outY:-4,mode:'corner'});
function editor(rotation=0){
 let shape:any={id:'shape:test',type:'cad-bezier',x:100,y:200,rotation,parentId:'shape:group',props:{contours:[{closed:false,nodes:[n(0,0),n(10,30),n(40,10),n(100,60)]}],fillRule:'evenodd',color:'black'},meta:{omsObjectName:'Cut',omsVectorPaint:{fill:'#abcdef'}}};
 let selected=true,readonly=false,locked=false,snapshot:any,fail=false,mask:any=null;
 const e:any={inputs:{shiftKey:false},marks:[],tool:'select',
  getOnlySelectedShape:()=>selected?shape:null,getSelectedShapeIds:()=>selected?[shape.id]:[],
  getShape:(id:string)=>id===shape.id?shape:undefined,getShapeAndDescendantIds:(ids:string[])=>new Set(ids),
  getCurrentToolId:()=>e.tool,getInstanceState:()=>({isReadonly:readonly}),isShapeOrAncestorLocked:()=>locked,
  getShapeMask:()=>mask,getBindingsInvolvingShape:()=>[],getCurrentPage:()=>({id:'page:test'}),
  getCurrentPageShapesSorted:()=>[shape],complete:()=>{},setCurrentTool:(t:string)=>{e.tool=t;},
  getShapePageTransform:()=>({applyToPoint:(p:any)=>({x:shape.x+Math.cos(rotation)*p.x-Math.sin(rotation)*p.y,y:shape.y+Math.sin(rotation)*p.x+Math.cos(rotation)*p.y})}),
  getPointInShapeSpace:(_s:any,p:any)=>({x:Math.cos(rotation)*(p.x-shape.x)+Math.sin(rotation)*(p.y-shape.y),y:-Math.sin(rotation)*(p.x-shape.x)+Math.cos(rotation)*(p.y-shape.y)}),
  mark:(m:string)=>{e.marks.push(m);if(!m.endsWith('-complete'))snapshot=structuredClone(shape);},run:(f:()=>void)=>f(),bailToMark:()=>{shape=snapshot;},
  updateShapes:(changes:any[])=>{for(const c of changes){shape={...shape,...c,props:{...shape.props,...c.props}};if(fail)throw Error('fail');}},
  flags:(flags:any)=>{if('readonly'in flags)readonly=flags.readonly;if('locked'in flags)locked=flags.locked;if('selected'in flags)selected=flags.selected;if('fail'in flags)fail=flags.fail;if('mask'in flags)mask=flags.mask;},
  mutate:(f:(s:any)=>void)=>f(shape),store:{getStoreSnapshot:()=>({shape})}
 };
 return e;
}
const pick=(e:any,...indices:number[])=>setSelectedCadNodes(e,indices.map(nodeIndex=>({contourIndex:0,nodeIndex})));
const page=(e:any,i:number)=>e.getShapePageTransform().applyToPoint(e.getOnlySelectedShape().props.contours[0].nodes[i]);
describe('node sets and arrangement',()=>{
 it('Shift anchor clicks toggle selection without editing artwork',()=>{
  const e=editor(),before=JSON.stringify(e.getOnlySelectedShape());
  const event=(id:string,shiftKey:boolean)=>({type:'pointer',name:'pointer_down',button:0,target:'handle',shape:e.getOnlySelectedShape(),handle:{id},shiftKey});
  inspectCadNodeEvent(e,event('0:2:node',true) as any);
  assert.deepEqual(getSelectedCadNodes(e).map(n=>n.nodeIndex),[0,2]);
  inspectCadNodeEvent(e,event('0:0:node',true) as any);
  assert.deepEqual(getSelectedCadNodes(e).map(n=>n.nodeIndex),[2]);assert.equal(JSON.stringify(e.getOnlySelectedShape()),before);assert.equal(e.marks.length,0);
 });
 it('control-handle clicks inspect only the owning anchor',()=>{
  const e=editor();pick(e,0,1,2);inspectCadNodeEvent(e,{type:'pointer',name:'pointer_down',button:0,target:'handle',shape:e.getOnlySelectedShape(),handle:{id:'0:2:in'},shiftKey:true} as any);
  assert.deepEqual(getSelectedCadNodes(e).map(n=>n.nodeIndex),[2]);
 });
 it('rejects invalid references and deduplicates valid nodes',()=>{
  const e=editor();assert.equal(pick(e,-1),false);assert.equal(pick(e,8),false);assert.equal(pick(e,1,1,3),true);assert.equal(getSelectedCadNodes(e).length,2);
 });
 it('clearing the batch leaves the legacy inspector on a valid anchor',()=>{
  const e=editor();setSelectedCadNodes(e,[]);assert.equal(getSelectedCadNodes(e).length,0);assert.equal(getSelectedCadNode(e)?.nodeIndex,0);assert.throws(()=>prepareNodeArrange(e,{kind:'move',x:1,y:0}));
 });
 it('geometry changes clear batch indices, including same-size reorder',()=>{
  const e=editor();pick(e,1,3);e.mutate((s:any)=>s.props.contours[0].nodes.reverse());assert.equal(getSelectedCadNodes(e).length,0);
  assert.equal(getSelectedCadNode(e)?.nodeIndex,0);
 });
 it('node moves in rotated parents carry relative handles and preserve metadata',()=>{
  const e=editor(Math.PI/3);pick(e,1,3);const before=structuredClone(e.getOnlySelectedShape()),p1=page(e,1),p3=page(e,3);
  const plan=prepareNodeArrange(e,{kind:'move',x:17,y:-8});assert.equal(plan.moved,2);assert.equal(applyNodeArrange(e,plan),true);
  for(const [index,p]of [[1,p1],[3,p3]] as const){assert.ok(Math.abs(page(e,index).x-p.x-17)<1e-9);assert.ok(Math.abs(page(e,index).y-p.y+8)<1e-9);const a=e.getOnlySelectedShape().props.contours[0].nodes[index],b=before.props.contours[0].nodes[index];assert.equal(a.inX,b.inX);assert.equal(a.outY,b.outY);}
  assert.deepEqual(e.getOnlySelectedShape().meta,before.meta);assert.deepEqual(e.getOnlySelectedShape().props.contours[0].nodes[0],before.props.contours[0].nodes[0]);assert.equal(e.marks.length,2);assert.equal(getSelectedCadNodes(e).length,2);
 });
 it('aligns page axes rather than rotated local coordinates',()=>{
  const e=editor(Math.PI/4);pick(e,0,2,3);const target=Math.max(page(e,0).x,page(e,2).x,page(e,3).x);
  assert.equal(applyNodeArrange(e,prepareNodeArrange(e,{kind:'align',axis:'x',reference:'max'})),true);
  for(const i of [0,2,3])assert.ok(Math.abs(page(e,i).x-target)<1e-9);
 });
 it('distributes spatially while preserving extreme coordinates',()=>{
  const e=editor();pick(e,3,0,1,2);const min=page(e,0).x,max=page(e,3).x;
  assert.equal(applyNodeArrange(e,prepareNodeArrange(e,{kind:'distribute',axis:'x'})),true);
  for(let i=0;i<4;i++)assert.ok(Math.abs(page(e,i).x-(min+(max-min)*i/3))<1e-9);
 });
 it('selection changes invalidate a reviewed operation',()=>{
  const e=editor();pick(e,1,2);const plan=prepareNodeArrange(e,{kind:'move',x:5,y:0});pick(e,2,3);assert.equal(applyNodeArrange(e,plan),false);assert.equal(e.marks.length,0);
 });
 it('document edits invalidate a reviewed operation',()=>{
  const e=editor();pick(e,1,2);const plan=prepareNodeArrange(e,{kind:'move',x:5,y:0});e.mutate((s:any)=>{s.meta.note='changed';});assert.equal(applyNodeArrange(e,plan),false);
 });
 it('read-only and locks are rechecked at Apply',()=>{
  for(const flag of ['readonly','locked']){const e=editor();pick(e,1,2);const plan=prepareNodeArrange(e,{kind:'move',x:5,y:0});e.flags({[flag]:true});assert.equal(applyNodeArrange(e,plan),false);assert.equal(e.marks.length,0);}
 });
 it('masked paths and invalid operations are refused',()=>{
  const e=editor();pick(e,0,1);e.flags({mask:[]});assert.throws(()=>prepareNodeArrange(e,{kind:'move',x:5,y:0}));e.flags({mask:null});
  assert.throws(()=>prepareNodeArrange(e,{kind:'move',x:NaN,y:0}));assert.throws(()=>prepareNodeArrange(e,{kind:'distribute',axis:'x'}));
  assert.throws(()=>prepareNodeArrange(e,{kind:'move',x:1e6,y:0}));
 });
 it('failed writes roll back the whole edit and keep selection',()=>{
  const e=editor();pick(e,1,2);const before=structuredClone(e.getOnlySelectedShape()),plan=prepareNodeArrange(e,{kind:'move',x:5,y:0});e.flags({fail:true});assert.equal(applyNodeArrange(e,plan),false);assert.deepEqual(e.getOnlySelectedShape(),before);assert.equal(getSelectedCadNodes(e).length,2);
 });
 it('undo geometry mismatch invalidates the new batch rather than reusing indices',()=>{
  const e=editor();pick(e,1,2);const before=structuredClone(e.getOnlySelectedShape().props.contours);assert.equal(applyNodeArrange(e,prepareNodeArrange(e,{kind:'move',x:5,y:0})),true);e.mutate((s:any)=>s.props.contours=before);assert.equal(getSelectedCadNodes(e).length,0);
 });
 it('repeated actual native anchor drags retain the nonzero active index',()=>{
  const e=editor();setCadNodeEditing(e,true);selectCadNode(e,0,2);const util=new CadBezierShapeUtil(e),initial=e.getOnlySelectedShape();
  for(const x of [45,55]){const change=util.onHandleDrag(initial,{handle:{id:'0:2:node',x,y:15}} as any);e.updateShapes([change]);assert.equal(getSelectedCadNode(e)?.nodeIndex,2);assert.equal(getSelectedCadNodes(e).length,1);assert.equal(e.getOnlySelectedShape().props.contours[0].nodes[2].x,x);}
 });
 it('actual control-handle drag retains the anchor and mode',()=>{
  const e=editor();selectCadNode(e,0,3);const util=new CadBezierShapeUtil(e),s=e.getOnlySelectedShape();
  e.updateShapes([util.onHandleDrag(s,{handle:{id:'0:3:in',x:90,y:65}} as any)]);
  assert.equal(getSelectedCadNode(e)?.nodeIndex,3);assert.equal(e.getOnlySelectedShape().props.contours[0].nodes[3].inX,-10);
 });
 it('numeric node and segment edits retain indices but reversal invalidates them',()=>{
  const e=editor();selectCadNode(e,0,2);const node=e.getOnlySelectedShape().props.contours[0].nodes[2],matrix=e.getShapePageTransform(),settings=DEFAULT_CAD_SETTINGS;
  const p=canvasPointToCad(matrix.applyToPoint(node),settings),incoming=canvasPointToCad(matrix.applyToPoint({x:node.x+node.inX,y:node.y+node.inY}),settings),out=canvasPointToCad(matrix.applyToPoint({x:node.x+node.outX,y:node.y+node.outY}),settings);
  assert.equal(updateCadCurveNode(e,settings,0,2,{...node,...p,inX:incoming.x-p.x,inY:incoming.y-p.y,outX:out.x-p.x,outY:out.y-p.y}),true);
  assert.equal(getSelectedCadNode(e)?.nodeIndex,2);assert.equal(setCadSegmentKind(e,0,2,'line'),true);assert.equal(getSelectedCadNode(e)?.nodeIndex,2);
  assert.equal(reverseCadContour(e,0),true);assert.equal(getSelectedCadNodes(e).length,0);
 });
 it('topology changes invalidate existing selections',()=>{
  const e=editor();pick(e,1,3);assert.equal(splitCadCurveSegment(e,0,0,0.5),true);assert.equal(getSelectedCadNodes(e).length,0);
 });
});
