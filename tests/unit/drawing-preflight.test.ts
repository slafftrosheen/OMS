import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {createShapeId} from '@tldraw/tldraw';
import {capturePreflightDxfScope,clearPreflightHighlight,inspectDrawingPreflight,locatePreflightIssue,preflightContourKey,readPreflightHighlight} from '../../src/lib/components/canvas/drawing-preflight';
import {buildCadDxf} from '../../src/lib/components/canvas/cad-dxf';
import {measureCadSelection} from '../../src/lib/components/canvas/cad-measurements';
import {nodeAt} from '../../src/lib/components/canvas/cad-curves';
import {DEFAULT_CAD_SETTINGS,cadMmPerPixel} from '../../src/lib/components/canvas/cad-settings';
import {VECTOR_DEFAULT_PAINT} from '../../src/lib/components/canvas/cad-paint';
const settings={...DEFAULT_CAD_SETTINGS},mm=cadMmPerPixel(settings);
const rectangle=[{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}];
const make=(type:string,id:string,props:any):any=>({id:'shape:'+id,type,x:0,y:0,rotation:0,parentId:'page:one',props,meta:{omsObjectName:id},isLocked:false,opacity:1});
const path=(id:string,points=rectangle,closed=true)=>make('cad-path',id,{points:structuredClone(points),closed,color:'black'});
const panel=(id:string,x:number,y:number,w:number,h:number)=>path(id,[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]);
function fixture(items:any[]){
 const shapes=new Map(items.map(s=>[s.id,s]));let selected=items.map(s=>s.id),zoomed=false,focusedBounds:unknown;
 const page={id:'page:one',meta:{omsCad:settings}};
 const editor:any={
  getShape:(id:string)=>shapes.get(id),getCurrentPage:()=>page,getCurrentPageId:()=>page.id,
  getCurrentPageShapesSorted:()=>[...shapes.values()],getCurrentPageShapeIds:()=>new Set(shapes.keys()),
  getSelectedShapeIds:()=>selected,setSelectedShapes:(ids:string[])=>{selected=ids;},
  getShapeAndDescendantIds:(ids:string[])=>{const all=new Set(ids);for(const id of all)for(const s of shapes.values())if(s.parentId===id)all.add(s.id);return all;},
  getShapeMask:(id:string)=>shapes.get(id)?.mask,getInstanceState:()=>({isReadonly:true}),
  getShapeGeometry:(s:any)=>({bounds:{x:0,y:0,w:s.props.w??100,h:s.props.h??50}}),
  getShapePageTransform:(s:any)=>{const parent=shapes.get(s.parentId),r=s.rotation;
   const local=(p:any)=>({x:s.x+p.x*Math.cos(r)-p.y*Math.sin(r),y:s.y+p.x*Math.sin(r)+p.y*Math.cos(r)});
   return {applyToPoint:(p:any)=>parent?editor.getShapePageTransform(parent).applyToPoint(local(p)):local(p),rotation:()=>r+(parent?editor.getShapePageTransform(parent).rotation():0)};
  },
  complete(){},setCurrentTool(){},getSelectionPageBounds:()=>selected.length ? {x:0,y:0,w:100,h:50} : undefined,
  zoomToBounds:(bounds:{x:number;y:number;w:number;h:number})=>{zoomed=true;const {x,y,w,h}=bounds;focusedBounds={x,y,w,h};},
  updateShapes:()=>{throw new Error('Must not edit');},deleteShapes:()=>{throw new Error('Must not delete');},
 };
 return {editor,shapes,page,selection:()=>selected,zoomed:()=>zoomed,focusedBounds:()=>focusedBounds};
}
const inspect=(f:ReturnType<typeof fixture>,threshold=0.1)=>inspectDrawingPreflight(f.editor,settings,'all',threshold);
const raster={width:2,height:1,png:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAD91JpzAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',rgb:'eJz7z8AAAAMBAQA=',matrix:[1,0,0,1,0,0]};
describe('production drawing check',()=>{
 it('finds open paths and proven short segments in physical millimetres without mutation',()=>{
  const f=fixture([path('open',[{x:0,y:0},{x:.1,y:0},{x:100,y:0}],false)]),before=JSON.stringify([...f.shapes.values()]);
  const report=inspect(f);
  assert.equal(report.checked,1);assert.equal(report.open,1);
  assert.equal(report.issues.filter(i=>i.kind==='short').length,1);
  assert.ok(Math.abs(report.issues.find(i=>i.kind==='short')!.lengthMm!-.1*mm)<1e-10);
  assert.equal(JSON.stringify([...f.shapes.values()]),before);
  const scaled=inspectDrawingPreflight(f.editor,{...settings,scale:100},'all',.1);
  assert.equal(scaled.issues.some(i=>i.kind==='short'),false);
 });
 it('reports invalid zero-length segments even when DXF omits the shape',()=>{
  const f=fixture([path('zero',[{x:1,y:2},{x:1,y:2},{x:10,y:2}],false)]),r=inspect(f);
  assert.equal(r.omitted,1);assert.equal(r.issues.filter(i=>i.kind==='zero').length,1);
  assert.equal(r.issues.some(i=>i.kind==='invalid'),true);
 });
 it('does not classify a long cubic loop by its endpoint distance',()=>{
  const a={...nodeAt({x:0,y:0}),outX:100,outY:100},b={...nodeAt({x:0,y:0}),inX:-100,inY:100};
  const r=inspect(fixture([make('cad-bezier','loop',{contours:[{closed:false,nodes:[a,b]}],fillRule:'evenodd',color:'black'})]));
  assert.equal(r.issues.some(i=>i.kind==='short'||i.kind==='zero'),false);
 });
 it('matches reversed closed paths with shifted start nodes across native CAD path and straight Bézier',()=>{
  const nodes=[...rectangle.slice(2),...rectangle.slice(0,2)].reverse().map(nodeAt);
  const f=fixture([path('plate'),make('cad-bezier','copy',{contours:[{closed:true,nodes}],fillRule:'evenodd',color:'black'})]);
  const duplicate=inspect(f).issues.find(i=>i.kind==='duplicate')!;
  assert.equal(duplicate.id,'shape:copy');assert.equal(duplicate.otherId,'shape:plate');
 });
 it('matches reversed cubic controls and identifies duplicate contours within a compound',()=>{
  const a={...nodeAt({x:0,y:0}),outX:20,outY:30},b={...nodeAt({x:80,y:0}),inX:-10,inY:40};
  const forward={closed:false,nodes:[a,b]},reverse={closed:false,nodes:[b,a].map(n=>({...n,inX:n.outX,inY:n.outY,outX:n.inX,outY:n.inY}))};
  assert.equal(preflightContourKey(forward),preflightContourKey(reverse));
  const f=fixture([make('cad-bezier','compound',{contours:[forward,reverse],color:'black'})]),r=inspect(f),issue=r.issues.find(i=>i.kind==='duplicate')!;
  assert.equal(issue.contour,1);assert.equal(issue.otherContour,0);assert.equal(locatePreflightIssue(f.editor,r,r.issues.indexOf(issue)),true);
  assert.deepEqual(f.selection(),['shape:compound']);
 });
 it('matches transformed group children using world geometry',()=>{
  const group=make('group','group',{});group.x=100;group.y=250;group.rotation=Math.PI/2;
  const child=path('child');child.parentId=group.id;
  const world=rectangle.map(p=>({x:100-p.y,y:250+p.x}));
  const f=fixture([group,child,path('world',world)]);f.editor.setSelectedShapes([group.id]);
  const selected=inspectDrawingPreflight(f.editor,settings,'selected');assert.equal(selected.checked,1);assert.equal(selected.sharedEdges,0);
  const all=inspect(f);
  assert.equal(all.issues.filter(i=>i.kind==='duplicate').length,1);
  assert.equal(all.sharedEdges,4);
 });
 it('does not merge nearby distinct paths or different cubic controls',()=>{
  const f=fixture([path('a'),path('b',rectangle.map(p=>({x:p.x+.01,y:p.y})))]);
  assert.equal(inspect(f).issues.some(i=>i.kind==='duplicate'),false);
  const a={closed:false,nodes:[nodeAt({x:0,y:0}),nodeAt({x:10,y:0})]};
  const b=structuredClone(a);b.nodes[0].outY=1;
  assert.notEqual(preflightContourKey(a),preflightContourKey(b));
 });
 it('reports partial shared sections in millimetres and locates all covering objects',()=>{
  const large=panel('large',0,0,100,50),first=panel('first',100,10,40,20),second=panel('second',100,20,60,20);
  const f=fixture([large,first,second]),before=JSON.stringify([...f.shapes.values()]);
  const report=inspect(f),exported=buildCadDxf(f.editor,'all',settings,{commonLines:true});
  assert.deepEqual([report.sharedEdges,report.duplicatePasses],[3,4]);
  assert.deepEqual([report.sharedEdges,report.duplicatePasses],[exported.sharedEdges,exported.passesRemoved]);
  const findings=report.issues.filter(i=>i.kind==='shared');
  assert.equal(findings.length,3);
  assert.ok(findings.every(i=>Math.abs(i.lengthMm!-10*mm)<1e-10));
  const triple=findings.find(i=>i.coveringContours===3)!;
  assert.equal(locatePreflightIssue(f.editor,report,report.issues.indexOf(triple)),true);
  assert.deepEqual(new Set(f.selection()),new Set([large.id,first.id,second.id]));
  assert.equal(f.zoomed(),true);
  assert.equal(JSON.stringify([...f.shapes.values()]),before);
 });
 it('honors the captured scope and skips open, clipped and non-cutting geometry',()=>{
  const left=panel('left',0,0,100,50),right=panel('right',100,10,30,20);
  const clipped=panel('clipped',100,10,30,20);clipped.mask=[];
  const f=fixture([left,right,clipped,path('open',[{x:100,y:10},{x:100,y:30}],false)]);
  f.editor.setSelectedShapes([left.id,clipped.id,'shape:open']);
  assert.equal(inspectDrawingPreflight(f.editor,settings,'selected').sharedEdges,0);
  const all=inspect(f);
  assert.equal(all.sharedEdges,1);
  assert.deepEqual(new Set(all.issues.find(i=>i.kind==='shared')!.relatedIds),new Set([left.id,right.id]));
 });
 it('reports potential duplicate cuts across colors while preserving color-specific export behavior',()=>{
  const first=panel('red',0,0,100,50),second=panel('blue',100,10,40,20);
  first.meta.omsVectorPaint={...VECTOR_DEFAULT_PAINT,stroke:'#ff0000'};
  second.meta.omsVectorPaint={...VECTOR_DEFAULT_PAINT,stroke:'#0000ff'};
  const f=fixture([first,second]);
  assert.equal(inspect(f).duplicatePasses,1);
  assert.equal(buildCadDxf(f.editor,'all',settings,{commonLines:true,colorLayers:true}).sharedEdges,0);
 });
 it('locates the precise shared section in page space with scaled inch settings and a custom origin',()=>{
  const f=fixture([panel('long',0,0,100,50),panel('short',100,10,40,20)]);
  const inches={...settings,unit:'in' as const,scale:2.5,originX:500,originY:-250};
  f.page.meta.omsCad=inches;
  const report=inspectDrawingPreflight(f.editor,inches,'all');
  const index=report.issues.findIndex(issue=>issue.kind==='shared');
  const shared=report.issues[index];
  assert.ok(shared.sharedSegment);
  assert.ok(Math.abs(shared.lengthMm!-20*cadMmPerPixel(inches))<1e-8);
  const before=JSON.stringify([...f.shapes.values()]);
  assert.equal(locatePreflightIssue(f.editor,report,index),true);
  const marker=readPreflightHighlight(f.editor)!;
  assert.ok(Math.abs(marker.from.x-100)<1e-8&&Math.abs(marker.to.x-100)<1e-8);
  assert.ok(Math.abs(Math.min(marker.from.y,marker.to.y)-10)<1e-8);
  assert.ok(Math.abs(Math.max(marker.from.y,marker.to.y)-30)<1e-8);
  const bounds=f.focusedBounds() as {x:number;y:number;w:number;h:number};
  assert.ok(Math.abs(bounds.x-76)<1e-8&&Math.abs(bounds.y+14)<1e-8&&Math.abs(bounds.w-48)<1e-8&&Math.abs(bounds.h-68)<1e-8);
  assert.equal(JSON.stringify([...f.shapes.values()]),before);
  clearPreflightHighlight(f.editor);
  assert.equal(readPreflightHighlight(f.editor),null);
 });
 it('drops the marker on drawing edits and page changes and clears it when locating another kind',()=>{
  const left=panel('left',0,0,100,50),right=panel('right',100,10,40,20);
  const open=path('open',[{x:200,y:0},{x:210,y:0}],false);
  const f=fixture([left,right,open]),report=inspect(f);
  const locate=(kind:'shared'|'open')=>locatePreflightIssue(f.editor,report,report.issues.findIndex(issue=>issue.kind===kind));
  assert.equal(locate('shared'),true);
  assert.ok(readPreflightHighlight(f.editor));
  assert.equal(locate('open'),true);
  assert.equal(readPreflightHighlight(f.editor),null);
  assert.equal(locate('shared'),true);
  left.x=1;
  assert.equal(readPreflightHighlight(f.editor),null);
  assert.equal(locate('shared'),false);
  left.x=0;
  assert.equal(readPreflightHighlight(f.editor),null);
  assert.equal(locate('shared'),true);
  f.page.id='page:other';
  assert.equal(readPreflightHighlight(f.editor),null);
 });
 it('hands the checked group scope to DXF after Locate changes the selection',()=>{
  const group=make('group','group',{}),left=panel('left',0,0,100,50),right=panel('right',100,10,40,20);
  const extra=panel('extra',180,0,20,50),outside=panel('outside',300,0,20,50);
  left.parentId=right.parentId=extra.parentId=group.id;
  const f=fixture([group,left,right,extra,outside]);
  f.editor.setSelectedShapes([group.id]);
  const report=inspectDrawingPreflight(f.editor,settings,'selected');
  const index=report.issues.findIndex(i=>i.kind==='shared');
  assert.equal(locatePreflightIssue(f.editor,report,index),true);
  assert.deepEqual(new Set(f.selection()),new Set([left.id,right.id]));
  const scope=capturePreflightDxfScope(f.editor,report);
  assert.ok(scope);
  const normal=buildCadDxf(f.editor,scope,settings);
  assert.equal(normal.entities,3);
  assert.equal(normal.closedContours,3);
  assert.equal(normal.sharedEdges,0);
  const shared=buildCadDxf(f.editor,scope,settings,{commonLines:true});
  assert.equal(shared.sharedEdges,1);
  assert.equal(shared.widthMm,200*mm);
  assert.deepEqual(new Set(f.selection()),new Set([left.id,right.id]));
  assert.equal(buildCadDxf(f.editor,'selected',settings).entities,2);
  assert.equal(buildCadDxf(f.editor,'all',settings).entities,4);
 });
 it('rejects stale or empty handoffs and validates captured DXF scope against the page',()=>{
  const f=fixture([panel('checked',0,0,10,10)]);
  const report=inspect(f),captured=capturePreflightDxfScope(f.editor,report);
  assert.ok(captured);
  assert.throws(()=>buildCadDxf(f.editor,{...captured,shapeIds:[createShapeId('missing')]},settings),/invalid/);
  f.shapes.get('shape:checked')!.x=20;
  assert.equal(capturePreflightDxfScope(f.editor,report),null);
  const fresh=inspect(f);
  f.page.id='page:another';
  assert.equal(capturePreflightDxfScope(f.editor,fresh),null);
  assert.throws(()=>buildCadDxf(f.editor,captured,settings),/invalid/);
  const unsupported=fixture([make('text','label',{text:'Sign'})]);
  assert.equal(capturePreflightDxfScope(unsupported.editor,inspect(unsupported)),null);
 });
 it('counts shared sections and duplicate passes when the finding list reaches its cap',()=>{
  const r=inspect(fixture(Array.from({length:503},(_,i)=>panel(String(i),i*100,0,100,50))));
  assert.deepEqual([r.sharedEdges,r.duplicatePasses,r.issueCount,r.issues.length,r.truncated],[502,502,502,500,true]);
 });
 it('matches exact circles and ellipses independently of path seam',()=>{
  const a=make('cad-ellipse','ellipse',{w:100,h:50,color:'black'}),b=structuredClone(a);b.id='shape:copy';
  const f=fixture([a,b]),r=inspect(f);assert.equal(r.closed,2);assert.equal(r.issues.filter(i=>i.kind==='duplicate').length,1);
 });
 it('separates text, image, forms and clipped paths from reviewed cutting geometry',()=>{
  const clipped=path('clip');clipped.mask=[];
  const r=inspect(fixture([clipped,make('text','label',{text:'Sign'}),make('image','photo',{}),make('order-details','form',{})]));
  assert.equal(r.checked,0);assert.equal(r.omitted,4);
  assert.deepEqual(r.issues.map(i=>i.kind),['clipped','text','unsupported','unsupported']);
 });
 it('allows issue navigation in read-only mode, captures selection and refuses stale reports',()=>{
  const f=fixture([path('line',[{x:0,y:0},{x:10,y:0}],false)]),r=inspect(f);
  assert.equal(locatePreflightIssue(f.editor,r,0),true);assert.equal(f.zoomed(),true);
  assert.deepEqual(f.selection(),['shape:line']);
  assert.equal(locatePreflightIssue(f.editor,r,0),true);
  f.shapes.get('shape:line')!.x=5;assert.equal(locatePreflightIssue(f.editor,r,0),false);
 });
 it('rejects invalid scope, thresholds, empty selection and excessive workload',()=>{
  const f=fixture([path('one')]);
  assert.throws(()=>inspectDrawingPreflight(f.editor,settings,'invalid' as any),/settings/);
  for(const value of [0,NaN,101])assert.throws(()=>inspect(f,value),/settings/);
  f.editor.setSelectedShapes([]);assert.throws(()=>inspectDrawingPreflight(f.editor,settings,'selected'),/empty/);
  assert.throws(()=>inspect(fixture(Array.from({length:1001},(_,i)=>path(String(i))))),/limit/);
  const nodes=Array.from({length:4096},(_,i)=>nodeAt({x:i,y:0}));
  assert.throws(()=>inspect(fixture(Array.from({length:4},(_,i)=>make('cad-bezier',String(i),{contours:[{closed:false,nodes}],color:'black'})))),/limit/);
 });
 it('caps visible findings without hiding that the result was truncated',()=>{
  const f=fixture(Array.from({length:501},(_,i)=>{const s=path(String(i),[{x:0,y:0},{x:10,y:0}],false);s.y=i;return s;}));
  const r=inspect(f);assert.equal(r.issueCount,501);assert.equal(r.issues.length,500);assert.equal(r.truncated,true);
 });
 it('retains material-filled analytic geometry in DXF and measurement while omitting page rasters',()=>{
  for(const s of [path('material'),make('cad-ellipse','material',{w:100,h:50,color:'black'})]){
   s.meta.omsVectorPaint={...VECTOR_DEFAULT_PAINT,raster:{...raster,usage:'material'}};
   const f=fixture([s]),dxf=buildCadDxf(f.editor,'all',settings);
   assert.equal(dxf.entities,1);assert.equal(dxf.omitted.length,0);
   assert.ok(dxf.text.includes(s.type==='cad-ellipse'?'ELLIPSE':'LWPOLYLINE'));
   assert.equal(measureCadSelection(f.editor,settings).measured,1);assert.equal(inspect(f).checked,1);
   delete s.meta.omsVectorPaint.raster.usage;
   assert.equal(buildCadDxf(f.editor,'all',settings).entities,0);
   assert.equal(measureCadSelection(f.editor,settings).omitted,1);assert.equal(inspect(f).omitted,1);
  }
 });
});
