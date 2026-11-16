import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {expandOutlineContours,prepareOutlineToObject,applyOutlineToObject} from '../../src/lib/components/canvas/drawing-outline-object';
import {DEFAULT_CAD_SETTINGS} from '../../src/lib/components/canvas/cad-settings';
import {VECTOR_DEFAULT_PAINT} from '../../src/lib/components/canvas/cad-paint';
import {nodeAt,curveBounds,arcContour,type CadContour} from '../../src/lib/components/canvas/cad-curves';
const contour=(points:number[][],closed=false):CadContour=>({closed,nodes:points.map(([x,y])=>nodeAt({x,y}))});
const stroke=(patch:any={})=>({...VECTOR_DEFAULT_PAINT,stroke:'#123456',strokeWidth:2,...patch});
const area=(contours:CadContour[])=>Math.abs(contours.reduce((sum,c)=>sum+c.nodes.reduce((a,p,i)=>{const q=c.nodes[(i+1)%c.nodes.length];return a+p.x*q.y-q.x*p.y;},0)/2,0));
const near=(a:number,b:number,epsilon=.001)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);
function winding(contours:CadContour[],x:number,y:number){let n=0;for(const c of contours)for(let i=0;i<c.nodes.length;i++){const a=c.nodes[i],b=c.nodes[(i+1)%c.nodes.length],cross=(b.x-a.x)*(y-a.y)-(x-a.x)*(b.y-a.y);if(a.y<=y&&b.y>y&&cross>0)n++;if(a.y>y&&b.y<=y&&cross<0)n--;}return n;}
const shape=(id='shape:a',type='cad-path',parentId='page:one',index='a1'):any=>({id,type,parentId,index,x:30,y:40,rotation:.3,opacity:1,isLocked:false,
 props:type==='group'?{}:type==='cad-ellipse'?{w:100,h:50,color:'black'}:type==='cad-arc'?{radius:50,startAngle:0,endAngle:90,color:'black'}:type==='cad-bezier'?{contours:[contour([[0,0],[100,0],[100,50]],true)],fillRule:'evenodd',color:'black'}:{points:[{x:0,y:0},{x:100,y:0}],closed:false,color:'black'},
 meta:{custom:'preserved',omsVectorPaint:stroke()}});
function fixture(items=[shape()]){
 const shapes=new Map(items.map(s=>[s.id,structuredClone(s)])),state={isReadonly:false,refuse:'',budget:'',nativeCleanup:false,selection:items.filter(s=>s.parentId==='page:one').map(s=>s.id),onComplete:()=>{}};
 const page={id:'page:one',meta:{omsCad:{...DEFAULT_CAD_SETTINGS}}},marks:any[]=[];
 let atomicDepth=0,creates=0;const invalidParents=new Set<string>();
 const cleanup=()=>{
  if(!state.nativeCleanup){invalidParents.clear();return;}
  for(const parentId of invalidParents){
   invalidParents.delete(parentId);const group=shapes.get(parentId);if(group?.type!=='group')continue;
   const children=[...shapes.values()].filter(s=>s.parentId===parentId);
   if(children.length>1)continue;
   if(children.length){const child=children[0],c=Math.cos(group.rotation),n=Math.sin(group.rotation),x=group.x+c*child.x-n*child.y,y=group.y+n*child.x+c*child.y;shapes.set(child.id,{...child,x,y,rotation:group.rotation+child.rotation,parentId:group.parentId,index:group.index});}
   shapes.delete(parentId);invalidParents.add(group.parentId);
  }
 };
 const atomic=(change:()=>void)=>{atomicDepth++;try{return change();}finally{if(--atomicDepth===0)cleanup();}};
 const transform=(s:any,p:any):any=>{const c=Math.cos(s.rotation),n=Math.sin(s.rotation),q={x:s.x+c*p.x-n*p.y,y:s.y+n*p.x+c*p.y},parent=shapes.get(s.parentId);return parent?transform(parent,q):q;};
 const inverse=(s:any,p:any):any=>{const parent=shapes.get(s.parentId),q=parent?inverse(parent,p):p,c=Math.cos(s.rotation),n=Math.sin(s.rotation),x=q.x-s.x,y=q.y-s.y;return {x:c*x+n*y,y:-n*x+c*y};};
 const editor:any={
  options:{maxShapesPerPage:2000},getShape:(id:string)=>shapes.get(id),getSelectedShapeIds:()=>state.selection,getInstanceState:()=>state,
  getCurrentPage:()=>page,getCurrentPageShapesSorted:()=>[...shapes.values()].sort((a,b)=>a.index<b.index?-1:1),
  getCurrentPageShapeIds:()=>new Set(shapes.keys()),getCurrentPageId:()=>page.id,
  getSortedChildIdsForParent:(id:string)=>[...shapes.values()].filter(s=>s.parentId===id).sort((a,b)=>a.index<b.index?-1:1).map(s=>s.id),
  getShapeAndDescendantIds:(ids:string[])=>{const found=new Set(ids);for(const id of found)for(const s of shapes.values())if(s.parentId===id)found.add(s.id);return found;},
  isShapeOrAncestorLocked:(s:any):boolean=>!!s&&(s.isLocked||editor.isShapeOrAncestorLocked(shapes.get(s.parentId))),
  getBindingsInvolvingShape:(id:string)=>shapes.get(id)?.bound?[{}]:[],getShapeMask:(id:string)=>shapes.get(id)?.mask,
  getShapePageTransform:(s:any)=>({applyToPoint:(p:any)=>transform(s,p)}),getPointInShapeSpace:(s:any,p:any)=>inverse(s,p),
  complete:()=>state.onComplete(),setCurrentTool(){},mark:(id:string)=>marks.push({id,snapshot:structuredClone([...shapes]),selected:[...state.selection]}),run:(f:()=>void)=>f(),
  bailToMark:(id:string)=>{const i=marks.findIndex(m=>m.id===id);shapes.clear();for(const [k,v]of marks[i].snapshot)shapes.set(k,v);state.selection=marks[i].selected;marks.splice(i);},
  updateShapes:(updates:any[])=>{for(const u of updates){if(state.refuse==='update')continue;const s=shapes.get(u.id);shapes.set(u.id,{...s,...u,meta:{...s.meta,...u.meta}});}},
  createShape:(s:any)=>atomic(()=>{if(state.refuse==='create'||state.refuse==='second-create'&&++creates===2||shapes.size>=editor.options.maxShapesPerPage)return;if(s.parentId!==page.id&&!shapes.has(s.parentId))s={...s,parentId:page.id};shapes.set(s.id,structuredClone(s));invalidParents.add(s.parentId);}),
  deleteShapes:(ids:string[])=>atomic(()=>{if(state.refuse==='delete')return;for(const id of ids){invalidParents.add(shapes.get(id)?.parentId);shapes.delete(id);}}),
  setSelectedShapes:(ids:string[])=>{state.selection=[...ids];},
  store:{atomic,getStoreSnapshot:()=>({shapes:[...shapes.values()],padding:state.budget})}
 };
 return {editor,shapes,state,page,marks,one:()=>shapes.get(items[0].id)};
}
const options={toleranceMm:.01,keepOriginal:false};

describe('Convert CAD outline to object',()=>{
 it('constructs exact butt and square caps and sagitta-bounded round caps',()=>{
  const c=[contour([[0,0],[10,0]])];
  const butt=expandOutlineContours(c,stroke(),1,.01),square=expandOutlineContours(c,stroke({lineCap:'square'}),1,.01),round=expandOutlineContours(c,stroke({lineCap:'round'}),1,.01);
  assert.deepEqual(curveBounds(butt),{x:0,y:-1,w:10,h:2});near(area(butt),20);
  assert.deepEqual(curveBounds(square),{x:-1,y:-1,w:12,h:2});near(area(square),24);
  near(area(round),20+Math.PI,.02);
  for(const c of round)for(const p of c.nodes)assert.ok(p.x>=-1.0001&&p.x<=11.0001&&Math.abs(p.y)<=1.0001);
 });
 it('uses true SVG bevel and falls back to bevel when a miter exceeds its limit',()=>{
  const c=[contour([[0,0],[10,0],[10,10]])];
  const miter=expandOutlineContours(c,stroke({miterLimit:2}),1,.01),bevel=expandOutlineContours(c,stroke({lineJoin:'bevel'}),1,.01),limited=expandOutlineContours(c,stroke({miterLimit:1}),1,.01),round=expandOutlineContours(c,stroke({lineJoin:'round'}),1,.01);
  near(area(miter),40);near(area(bevel),39.5);near(area(limited),39.5);near(area(round),39+Math.PI/4,.01);
  assert.notEqual(winding(miter,10.9,-.9),0);assert.equal(winding(bevel,10.9,-.9),0);assert.equal(winding(limited,10.9,-.9),0);
 });
 it('preserves a closed ring hole independent of source winding',()=>{
  for(const points of [[[0,0],[10,0],[10,10],[0,10]],[[0,10],[10,10],[10,0],[0,0]]]){
   const result=expandOutlineContours([contour(points,true)],stroke(),1,.01);
   assert.equal(result.length,2);near(area(result),80);assert.equal(winding(result,5,5),0);assert.notEqual(winding(result,0,5),0);
   assert.ok(result.every(c=>c.closed&&c.nodes.every(n=>!n.inX&&!n.inY&&!n.outX&&!n.outY)));
  }
 });
 it('unions crossings and overlapping subpaths without even-odd cancellation',()=>{
  const a=contour([[0,0],[10,10]]),b=contour([[0,10],[10,0]]),result=expandOutlineContours([a,b],stroke(),1,.01);
  assert.equal(result.length,1);assert.notEqual(winding(result,5,5),0);
  near(area(expandOutlineContours([a,a],stroke(),1,.01)),20*Math.SQRT2,.01);
  const crossing=expandOutlineContours([contour([[0,0],[10,10],[0,10],[10,0]])],stroke({lineJoin:'round'}),1,.01);
  assert.notEqual(winding(crossing,5,5),0);assert.equal(winding(crossing,5,1),0);
 });
 it('honours physical tolerance at different scales and flattens cubic curvature',()=>{
  const curve=contour([[0,0],[100,0]]);curve.nodes[0].outX=20;curve.nodes[0].outY=100;curve.nodes[1].inX=-20;curve.nodes[1].inY=100;
  const fine=expandOutlineContours([curve],stroke({lineJoin:'round'}),1,.01),coarse=expandOutlineContours([curve],stroke({lineJoin:'round'}),1,.5);
  assert.ok(fine.reduce((n,c)=>n+c.nodes.length,0)>coarse.reduce((n,c)=>n+c.nodes.length,0));
  for(const factor of [.1,1,10]){const result=expandOutlineContours([contour([[0,0],[10,0]])],stroke({strokeWidth:2/factor}),factor,.01);near(curveBounds(result).h*factor,2);}
 });
 it('rejects dashed, invisible, degenerate, invalid and excessive geometry explicitly',()=>{
  const c=[contour([[0,0],[10,0]])];
  for(const patch of [{dash:[2,1]},{stroke:'none'},{strokeWidth:0},{strokeOpacity:0}])assert.throws(()=>expandOutlineContours(c,stroke(patch),1,.01));
  assert.throws(()=>expandOutlineContours([contour([[0,0],[0,0]])],stroke(),1,.01),/geometry/);
  assert.throws(()=>expandOutlineContours(c,stroke(),1,0),/invalid/);
  assert.throws(()=>expandOutlineContours(c,stroke({strokeWidth:1e6,lineCap:'round'}),1,.001),/limit/);
 });
 it('does not create artificial miter spikes at subdivisions of a very wide curved stroke',()=>{
  const circle=arcContour(0,0,1,1,0,Math.PI*2,Math.PI/2);
  for(const lineJoin of ['miter','bevel']){
   const result=expandOutlineContours([circle],stroke({strokeWidth:2000,lineJoin,miterLimit:1000}),1,.05);
   for(const c of result)for(const p of c.nodes)assert.ok(Math.hypot(p.x,p.y)<=1001.0005,'synthetic corner exceeded the cubic circle envelope');
   assert.equal(result.length,1);assert.notEqual(winding(result,0,0),0);
  }
 });
 it('replace removes bare centerlines, retains custom metadata and uses a single undo',()=>{
  const f=fixture(),before=structuredClone([...f.shapes]),plan=prepareOutlineToObject(f.editor,DEFAULT_CAD_SETTINGS,options);
  assert.equal(plan.items[0].retainSource,false);assert.equal(applyOutlineToObject(f.editor,plan),true);assert.equal(f.shapes.size,1);assert.equal(f.one(),undefined);
  const output=f.shapes.get(f.state.selection[0])!;assert.equal(output.type,'cad-bezier');assert.equal(output.meta.custom,'preserved');assert.equal(output.meta.omsVectorPaint.fill,'#123456');assert.equal(output.meta.omsVectorPaint.stroke,'none');
  assert.equal(f.marks.length,2);f.editor.bailToMark(f.marks[0].id);assert.deepEqual([...f.shapes],before);
 });
 it('keeps filled geometry and all gradient/material metadata while replacing only its outline',()=>{
  const source=shape('shape:a','cad-ellipse');source.meta.omsVectorPaint.fill='#abcdef';source.meta.omsVectorPaint.fillOpacity=.4;
  source.meta.omsVectorPaint.gradient={type:'linear',matrix:[1,0,0,1,0,0],start:[0,0],end:[100,0],r0:0,r1:1,stops:[{offset:0,color:'#ff0000'},{offset:1,color:'#0000ff'}]};
  source.meta.omsMaterialTexture={angle:20};
  const f=fixture([source]),before=structuredClone(f.one()),plan=prepareOutlineToObject(f.editor,DEFAULT_CAD_SETTINGS,options);
  assert.equal(plan.items[0].retainSource,true);assert.equal(applyOutlineToObject(f.editor,plan),true);
  assert.deepEqual(f.one(),{...before,meta:{...before.meta,omsVectorPaint:{...before.meta.omsVectorPaint,stroke:'none'}}});
  const output=f.shapes.get(f.state.selection[0])!;assert.equal(output.meta.omsVectorPaint.gradient,undefined);assert.equal(output.meta.omsMaterialTexture,undefined);
 });
 it('keep mode does not modify the source and nested groups retain local transforms and stacking',()=>{
  const g=shape('shape:g','group'),a=shape('shape:a','cad-arc','shape:g','a1'),b=shape('shape:b','cad-path','shape:g','a2');
  const f=fixture([g,a,b]);f.state.selection=['shape:a'];const before=structuredClone(f.one()),original=structuredClone(f.shapes.get('shape:a'));
  const plan=prepareOutlineToObject(f.editor,DEFAULT_CAD_SETTINGS,{...options,keepOriginal:true});
  assert.equal(applyOutlineToObject(f.editor,plan),true);assert.deepEqual(f.one(),before);assert.deepEqual(f.shapes.get('shape:a'),original);
  const output=f.shapes.get(f.state.selection[0])!;assert.equal(output.parentId,'shape:g');assert.equal(output.x,a.x);assert.equal(output.y,a.y);assert.equal(output.rotation,a.rotation);assert.ok(output.index>a.index&&output.index<b.index);
 });
 it('preserves real material bitmap assets but refuses raster pages and vector clips',()=>{
  const raster={usage:'material',width:2,height:1,rgb:'eJz7z8AAAAMBAQA=',png:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAD91JpzAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',matrix:[100,0,0,50,0,0]};
  const source=shape('shape:a','cad-ellipse');source.meta.omsVectorPaint.raster=raster;
  const f=fixture([source]),before=structuredClone(f.one().meta),plan=prepareOutlineToObject(f.editor,DEFAULT_CAD_SETTINGS,options);
  assert.equal(plan.items[0].retainSource,true);assert.equal(applyOutlineToObject(f.editor,plan),true);
  assert.deepEqual(f.one().meta.omsVectorPaint.raster,before.omsVectorPaint.raster);assert.equal(f.shapes.get(f.state.selection[0])!.meta.omsVectorPaint.raster,undefined);
  const page=fixture([source]);delete page.one().meta.omsVectorPaint.raster.usage;
  assert.throws(()=>prepareOutlineToObject(page.editor,DEFAULT_CAD_SETTINGS,options),/unsupported/);
  const clip=fixture();clip.one().meta.omsVectorPaint.clips=[{contours:[contour([[0,0],[10,0],[0,10]],true)],fillRule:'evenodd'}];
  assert.throws(()=>prepareOutlineToObject(clip.editor,DEFAULT_CAD_SETTINGS,options),/unsupported/);
 });
 it('defers native empty/singleton group cleanup until all replacements exist and rolls back partial creation',()=>{
  for(const refuse of ['', 'second-create']){
   const f=fixture([shape('shape:g','group'),shape('shape:a','cad-path','shape:g','a1'),shape('shape:b','cad-path','shape:g','a2')]);
   f.state.nativeCleanup=true;f.state.refuse=refuse;f.editor.options.maxShapesPerPage=3;
   const before=structuredClone([...f.shapes]),plan=prepareOutlineToObject(f.editor,DEFAULT_CAD_SETTINGS,options);
   assert.equal(applyOutlineToObject(f.editor,plan),!refuse);
   if(refuse){assert.deepEqual([...f.shapes],before);assert.equal(f.marks.length,0);continue;}
   assert.ok(f.shapes.has('shape:g'));assert.equal(f.shapes.size,3);assert.equal(f.state.selection.length,2);
   for(const id of f.state.selection)assert.equal(f.shapes.get(id)!.parentId,'shape:g');
   assert.deepEqual(f.shapes.get('shape:g'),before[0][1]);
  }
 });
 it('flags source, stroke and ancestor transparency, and preserves source opacity',()=>{
  for(const mode of ['shape','stroke','group']){
   const g=shape('shape:g','group'),s=shape('shape:a','cad-path','shape:g');
   if(mode==='shape')s.opacity=.4;if(mode==='stroke')s.meta.omsVectorPaint.strokeOpacity=.4;if(mode==='group')g.opacity=.4;
   const f=fixture([g,s]),plan=prepareOutlineToObject(f.editor,DEFAULT_CAD_SETTINGS,options);assert.equal(plan.transparency,true);
   assert.equal(applyOutlineToObject(f.editor,plan),true);assert.equal(f.shapes.get(f.state.selection[0])!.opacity,s.opacity);
  }
 });
 it('refuses masks, dash patterns, bindings, read-only/locked/protected/mixed selections atomically',()=>{
  for(const mode of ['mask','dash','bound','readonly','locked','protected','mixed','frame']){
   const f=fixture();
   if(mode==='mask')f.one().mask=[];if(mode==='dash')f.one().meta.omsVectorPaint.dash=[1,2];if(mode==='bound')f.one().bound=true;
   if(mode==='readonly')f.state.isReadonly=true;if(mode==='locked')f.one().isLocked=true;
   if(mode==='protected'||mode==='mixed'){const extra=shape('shape:b',mode==='protected'?'order-details':'text');f.shapes.set(extra.id,extra);f.state.selection.push(extra.id);}
   if(mode==='frame'){const frame=shape('shape:f','frame');f.shapes.set(frame.id,frame);f.one().parentId=frame.id;}
   const input=JSON.stringify([...f.shapes]);assert.throws(()=>prepareOutlineToObject(f.editor,DEFAULT_CAD_SETTINGS,options));assert.equal(JSON.stringify([...f.shapes]),input);assert.equal(f.marks.length,0);
  }
  const f=fixture([shape('shape:g','group'),shape('shape:a','cad-path','shape:g')]);f.state.selection=['shape:a'];f.shapes.get('shape:g')!.bound=true;
  assert.throws(()=>prepareOutlineToObject(f.editor,DEFAULT_CAD_SETTINGS,options),/bound/);
 });
 it('rejects stale settings/selection/drawing or permissions changed by tool completion',()=>{
  for(const mode of ['settings','selection','drawing','complete']){
   const f=fixture(),plan=prepareOutlineToObject(f.editor,DEFAULT_CAD_SETTINGS,options);
   if(mode==='settings')f.page.meta.omsCad.unit='cm';if(mode==='selection')f.state.selection=[];if(mode==='drawing')f.one().x++;
   if(mode==='complete')f.state.onComplete=()=>{f.one().isLocked=true;};
   assert.equal(applyOutlineToObject(f.editor,plan),false);assert.equal(f.marks.length,0);
  }
 });
 it('rolls back partial create/update/delete refusal and checks final capacity after replacements',()=>{
  for(const mode of ['create','update','delete']){
   const source=shape();if(mode==='update')source.meta.omsVectorPaint.fill='#ffffff';
   const f=fixture([source]),before=structuredClone([...f.shapes]),plan=prepareOutlineToObject(f.editor,DEFAULT_CAD_SETTINGS,options);f.state.refuse=mode;
   assert.equal(applyOutlineToObject(f.editor,plan),false);assert.deepEqual([...f.shapes],before);assert.equal(f.marks.length,0);
  }
  const f=fixture();f.editor.options.maxShapesPerPage=1;
  const plan=prepareOutlineToObject(f.editor,DEFAULT_CAD_SETTINGS,options);assert.equal(applyOutlineToObject(f.editor,plan),true);assert.equal(f.shapes.size,1);
  const full=fixture();full.editor.options.maxShapesPerPage=1;
  assert.throws(()=>prepareOutlineToObject(full.editor,DEFAULT_CAD_SETTINGS,{...options,keepOriginal:true}),/limit/);
  const large=fixture();large.state.budget='x'.repeat(1_900_000);assert.throws(()=>prepareOutlineToObject(large.editor,DEFAULT_CAD_SETTINGS,options),/limit/);
 });
});
