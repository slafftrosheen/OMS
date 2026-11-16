import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {readOutlineSelection,outlinePatchFromInput,prepareOutlinePlan,applyOutlinePlan} from '../../src/lib/components/canvas/drawing-outline';
import {DEFAULT_CAD_SETTINGS,unitLengthToCanvas} from '../../src/lib/components/canvas/cad-settings';
import {VECTOR_DEFAULT_PAINT} from '../../src/lib/components/canvas/cad-paint';
import {nodeAt} from '../../src/lib/components/canvas/cad-curves';
import {serializeVectorDocument} from '../../src/lib/components/canvas/cad-vector-export';

const polygon=[{x:0,y:0},{x:100,y:0},{x:100,y:50}];
const gradient={type:'linear',matrix:[1,0,0,1,0,0],start:[0,0],end:[100,0],r0:0,r1:1,stops:[{offset:0,color:'#ff0000'},{offset:1,color:'#0000ff'}]};
const raster={usage:'material',width:2,height:1,rgb:'eJz7z8AAAAMBAQA=',png:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAD91JpzAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',matrix:[100,0,0,50,0,0]};
const shape=(id='shape:a',type='cad-ellipse',parentId='page:one'):any=>({id,type,parentId,x:30,y:40,rotation:.3,opacity:.8,isLocked:false,
 props:type==='cad-ellipse'?{w:100,h:50,color:'black'}:type==='cad-path'?{points:polygon,closed:false,color:'black'}:type==='cad-arc'?{radius:50,startAngle:0,endAngle:90,color:'black'}:type==='group'?{}:{contours:[{closed:true,nodes:polygon.map(nodeAt)}],fillRule:'evenodd',color:'black'},
 meta:{custom:'keep',omsMaterialTexture:{angle:42},omsVectorPaint:{...VECTOR_DEFAULT_PAINT,fill:'#ffeedd',fillOpacity:.5,stroke:'#123456',strokeWidth:2,dash:[3,2],...(type==='cad-path'?{raster}:{gradient}),clips:[{contours:[{closed:true,nodes:polygon.map(nodeAt)}],fillRule:'evenodd'}]}}});
function fixture(items=[shape()]){
 const shapes=new Map(items.map(s=>[s.id,structuredClone(s)])),state={isReadonly:false,refuse:false,budget:'',selection:items.filter(s=>s.parentId==='page:one').map(s=>s.id),onComplete:()=>{}};
 const page={id:'page:one',meta:{omsCad:{...DEFAULT_CAD_SETTINGS}}},marks:any[]=[];
 const editor:any={
  getShape:(id:string)=>shapes.get(id),getSelectedShapeIds:()=>state.selection,getInstanceState:()=>state,
  getCurrentPage:()=>page,getCurrentPageShapesSorted:()=>[...shapes.values()],
  getShapeAndDescendantIds:(ids:string[])=>{const found=new Set(ids);for(const id of found)for(const s of shapes.values())if(s.parentId===id)found.add(s.id);return found;},
  isShapeOrAncestorLocked:(s:any):boolean=>!!s&&(s.isLocked||editor.isShapeOrAncestorLocked(shapes.get(s.parentId))),
  complete:()=>state.onComplete(),setCurrentTool(){},mark:(id:string)=>marks.push({id,snapshot:structuredClone([...shapes])}),run:(f:()=>void)=>f(),
  bailToMark:(id:string)=>{const i=marks.findIndex(m=>m.id===id);shapes.clear();for(const [k,v]of marks[i].snapshot)shapes.set(k,v);marks.splice(i);},
  updateShapes:(updates:any[])=>{for(const u of updates){if(state.refuse&&u.id===items.at(-1)!.id)continue;const s=shapes.get(u.id);shapes.set(u.id,{...s,...u,meta:{...s.meta,...u.meta}});}},
  store:{getStoreSnapshot:()=>({shapes:[...shapes.values()],padding:state.budget})}
 };
 return {editor,shapes,state,page,marks,one:()=>shapes.get(items[0].id)};
}
describe('CAD outline pen',()=>{
 it('converts width, dash and signed offset from physical document units at every scale',()=>{
  for(const unit of ['mm','cm','m','in'] as const)for(const scale of [1,10]){
   const settings={...DEFAULT_CAD_SETTINGS,unit,scale},patch=outlinePatchFromInput({strokeWidth:2,dash:[3,1],dashOffset:-.5},settings);
   assert.equal(patch.strokeWidth,unitLengthToCanvas(2,settings));assert.deepEqual(patch.dash,[3,1].map(v=>unitLengthToCanvas(v,settings)));assert.equal(patch.dashOffset,unitLengthToCanvas(-.5,settings));
  }
 });
 it('applies only checked fields across mixed native CAD types without altering assets, clips, fills or geometry',()=>{
  const f=fixture([shape('shape:a','cad-ellipse'),shape('shape:b','cad-path'),shape('shape:c','cad-arc'),shape('shape:d','cad-bezier')]);
  f.shapes.get('shape:b')!.meta.omsVectorPaint.strokeWidth=8;
  const before=structuredClone([...f.shapes.values()]),plan=prepareOutlinePlan(f.editor,{lineCap:'square',strokeOpacity:.7},DEFAULT_CAD_SETTINGS);
  assert.equal(plan.count,4);assert.equal(plan.samples.length,3);assert.equal(applyOutlinePlan(f.editor,plan),true);
  for(const old of before){const actual=f.shapes.get(old.id);assert.deepEqual(actual,{...old,meta:{...old.meta,omsVectorPaint:{...old.meta.omsVectorPaint,lineCap:'square',strokeOpacity:.7}}});}
  assert.equal(f.marks.length,2);f.editor.bailToMark(f.marks[0].id);assert.deepEqual([...f.shapes.values()],before);
 });
 it('expands nested groups once, even when a child is also selected',()=>{
  const f=fixture([shape('shape:g','group'),shape('shape:n','group','shape:g'),shape('shape:c','cad-ellipse','shape:n')]);
  f.state.selection=['shape:g','shape:c'];assert.equal(readOutlineSelection(f.editor).length,1);
  const before=structuredClone(f.shapes.get('shape:g'));assert.equal(applyOutlinePlan(f.editor,prepareOutlinePlan(f.editor,{stroke:'none'},DEFAULT_CAD_SETTINGS)),true);
  assert.deepEqual(f.shapes.get('shape:g'),before);assert.equal(f.shapes.get('shape:c')!.meta.omsVectorPaint.stroke,'none');
 });
 it('retains hidden fill data on open paths when setting no outline',()=>{
  const f=fixture([shape('shape:a','cad-path')]),before=structuredClone(f.one().meta);
  assert.equal(applyOutlinePlan(f.editor,prepareOutlinePlan(f.editor,{stroke:'none'},DEFAULT_CAD_SETTINGS)),true);
  assert.deepEqual(f.one().meta,{...before,omsVectorPaint:{...before.omsVectorPaint,stroke:'none'}});
 });
 it('rejects invalid values, unrecognised fields and nonnumeric lengths before mutation',()=>{
  const inputs:any[]=[{}, {fill:'#ffffff'},{stroke:'red'},{strokeWidth:-1},{strokeWidth:'2'},{strokeOpacity:1.01},{miterLimit:0},{dash:[0,0]},{dash:new Array(33).fill(1)},{dash:[1,NaN]},{dash:[1,'2']},{dashOffset:Infinity},{lineCap:'arrow'},{lineJoin:'none'}];
  const f=fixture(),before=JSON.stringify([...f.shapes]);
  for(const input of inputs)assert.throws(()=>prepareOutlinePlan(f.editor,input,DEFAULT_CAD_SETTINGS));
  assert.equal(JSON.stringify([...f.shapes]),before);assert.equal(f.marks.length,0);
 });
 it('accepts solid strokes, zero width and zero opacity explicitly',()=>{
  const f=fixture(),plan=prepareOutlinePlan(f.editor,{dash:[],strokeWidth:0,strokeOpacity:0},DEFAULT_CAD_SETTINGS);
  assert.equal(applyOutlinePlan(f.editor,plan),true);assert.deepEqual(f.one().meta.omsVectorPaint.dash,[]);assert.equal(f.one().meta.omsVectorPaint.strokeWidth,0);
 });
 it('rejects readonly, locked parents and protected mixed descendants atomically',()=>{
  for(const mode of ['readonly','parent','protected']){
   const f=fixture([shape('shape:g','group'),shape('shape:a','cad-ellipse','shape:g')]);
   if(mode==='readonly')f.state.isReadonly=true;if(mode==='parent')f.shapes.get('shape:g')!.isLocked=true;if(mode==='protected')f.shapes.set('shape:form',shape('shape:form','order-details','shape:g'));
   assert.throws(()=>prepareOutlinePlan(f.editor,{stroke:'#112233'},DEFAULT_CAD_SETTINGS));assert.equal(f.marks.length,0);
  }
 });
 it('rejects mixed native artwork, malformed paint and frame descendants without skipping them',()=>{
  for(const mode of ['native','paint','frame']){
   const f=fixture();if(mode==='native')f.shapes.set('shape:text',shape('shape:text','text'));if(mode==='native')f.state.selection.push('shape:text');
   if(mode==='paint')f.one().meta.omsVectorPaint.stroke='url(bad)';
   if(mode==='frame'){f.shapes.set('shape:frame',shape('shape:frame','frame'));f.one().parentId='shape:frame';}
   assert.throws(()=>prepareOutlinePlan(f.editor,{strokeWidth:1},DEFAULT_CAD_SETTINGS));
  }
 });
 it('stale drawings, changed units and changed selection block preview apply',()=>{
  for(const mode of ['drawing','units','selection']){
   const f=fixture(),plan=prepareOutlinePlan(f.editor,{lineJoin:'bevel'},DEFAULT_CAD_SETTINGS);
   if(mode==='drawing')f.one().x++;if(mode==='units')f.page.meta.omsCad.unit='cm';if(mode==='selection')f.state.selection=[];
   assert.equal(applyOutlinePlan(f.editor,plan),false);assert.equal(f.marks.length,0);
  }
 });
 it('rechecks permission and source changes caused by completing the active tool',()=>{
  const f=fixture(),plan=prepareOutlinePlan(f.editor,{lineCap:'round'},DEFAULT_CAD_SETTINGS);
  f.state.onComplete=()=>{f.one().isLocked=true;};
  assert.equal(applyOutlinePlan(f.editor,plan),false);assert.equal(f.marks.length,0);
 });
 it('rolls back all shapes when the native editor refuses one update',()=>{
  const f=fixture([shape(),shape('shape:b')]),before=structuredClone([...f.shapes]),plan=prepareOutlinePlan(f.editor,{lineCap:'round'},DEFAULT_CAD_SETTINGS);
  f.state.refuse=true;assert.equal(applyOutlinePlan(f.editor,plan),false);assert.deepEqual([...f.shapes],before);assert.equal(f.marks.length,0);
 });
 it('enforces selection and persistence limits before mutation',()=>{
  const many=fixture(Array.from({length:501},(_,i)=>shape('shape:'+i)));assert.throws(()=>prepareOutlinePlan(many.editor,{lineCap:'round'},DEFAULT_CAD_SETTINGS));
  const f=fixture();f.state.budget='x'.repeat(1_900_000);assert.throws(()=>prepareOutlinePlan(f.editor,{dash:new Array(32).fill(10)},DEFAULT_CAD_SETTINGS));
 });
 it('serializes PDF/EPS cap, join, miter, dash and offset without changing colour/fill',()=>{
  const paint={...VECTOR_DEFAULT_PAINT,fill:'#abcdef',stroke:'#123456',strokeWidth:2,lineCap:'round' as const,lineJoin:'bevel' as const,miterLimit:15,dash:[6,4],dashOffset:-2};
  const paths=[{contours:[{closed:true,nodes:polygon.map(nodeAt)}],fillRule:'evenodd' as const,paint}];
  const pdf=serializeVectorDocument(paths,'pdf'),eps=serializeVectorDocument(paths,'eps');
  assert.match(pdf,/1 J/);assert.match(pdf,/2 j/);assert.match(pdf,/15 M/);assert.match(pdf,/\[6 4\] -2 d/);assert.match(pdf,/B\*/);
  assert.match(eps,/1 setlinecap/);assert.match(eps,/2 setlinejoin/);assert.match(eps,/15 setmiterlimit/);assert.match(eps,/\[6 4\] -2 setdash/);assert.match(eps,/eofill/);
 });
 it('PDF retains stroke opacity while EPS explicitly refuses transparency',()=>{
  const paint={...VECTOR_DEFAULT_PAINT,strokeOpacity:.4};
  const paths=[{contours:[{closed:false,nodes:polygon.map(nodeAt)}],fillRule:'evenodd' as const,paint}];
  assert.match(serializeVectorDocument(paths,'pdf'),/\/CA 0.4/);assert.throws(()=>serializeVectorDocument(paths,'eps'),/opacity/);
 });
});
