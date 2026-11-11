import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {fixture} from '../helpers/cad-editor';
import {twoPointGeometry,CadCircleTool,CadDimensionTool} from '../../src/lib/components/canvas/CadTwoPointTool';
import {editDrawingText,textPointSize,spaceDrawingSelection,scaleCanvasForm} from '../../src/lib/components/canvas/workbench-operations';
import {addOrderFileDocument} from '../../src/lib/components/canvas/order-file-documents';
import {arrangeProductionPocket} from '../../src/lib/components/canvas/production-layout';
import {saveProductionExport} from '../../src/lib/components/canvas/production-export';
import {setOrderBridge} from '../../src/lib/components/canvas/state-bridge';

describe('CAD drawing and text workbench',()=>{
 it('constructs exact centre-radius circles and rejects zero/oversized geometry',()=>{
  assert.deepEqual(twoPointGeometry('circle',{x:10,y:20},{x:13,y:24}),{type:'cad-ellipse',x:5,y:15,props:{w:10,h:10}});
  assert.equal(twoPointGeometry('circle',{x:0,y:0},{x:0,y:0}),null);
  assert.equal(twoPointGeometry('circle',{x:0,y:0},{x:1e9,y:0}),null);
  const d=twoPointGeometry('dimension',{x:10,y:20},{x:13,y:24},2)!;
  assert.deepEqual(d.props,{endX:3,endY:4,offset:15,decorationScale:.5});
 });
 it('previews a circle, cancels it on Escape and completes a snapped two-point dimension',()=>{
  const f=fixture();let tool=new CadCircleTool(f.editor,undefined as any);tool.onEnter();
  f.editor.inputs.currentPagePoint={x:10,y:20};tool.onPointerDown({button:0} as any);
  f.editor.inputs.currentPagePoint={x:13,y:24};tool.onPointerMove();assert.equal(f.shapes.size,1);
  tool.onKeyDown({key:'Escape'} as any);assert.equal(f.shapes.size,0);
  const dimension=new CadDimensionTool(f.editor,undefined as any);dimension.onEnter();
  f.editor.inputs.currentPagePoint={x:0,y:0};dimension.onPointerDown({button:0} as any);
  f.editor.inputs.currentPagePoint={x:30,y:40};dimension.onPointerDown({button:0} as any);
  const shape=f.editor.getOnlySelectedShape();assert.equal(shape.type,'cad-dimension');assert.equal(Math.hypot(shape.props.endX,shape.props.endY),50);
 });
 it('edits exact point size and multiline text in one operation, respecting ancestor locks',()=>{
  const f=fixture();f.editor.createShape({id:'shape:text',type:'text',props:{text:'old',size:'m',scale:1,font:'sans',textAlign:'start',autoSize:true}});f.editor.setSelectedShapes(['shape:text']);
  const props={text:'Latvija\nRīga',pointSize:72,font:'serif',textAlign:'middle',autoSize:false} as const;
  assert.equal(editDrawingText(f.editor,'shape:text' as any,props),true);
  assert.equal(textPointSize(f.editor.getShape('shape:text')),72);assert.equal(f.editor.getShape('shape:text').props.text,props.text);
  f.editor.createShape({id:'shape:group',type:'group',isLocked:true});f.editor.updateShape({id:'shape:text',parentId:'shape:group'});
  assert.equal(editDrawingText(f.editor,'shape:text' as any,{...props,text:'changed'}),false);
 });
 it('spaces rotated-parent children in page coordinates and prevents edits through locked descendants',()=>{
  const f=fixture();f.editor.createShape({id:'shape:group',type:'group',rotation:Math.PI/2});
  f.editor.createShape({id:'shape:a',parentId:'shape:group',type:'cad-ellipse',x:0,y:0,props:{w:10,h:20}});
  f.editor.createShape({id:'shape:b',type:'cad-ellipse',x:80,y:5,props:{w:20,h:10}});f.editor.setSelectedShapes(['shape:a','shape:b']);
  assert.equal(spaceDrawingSelection(f.editor,'x',7),true);
  const a=f.editor.getShapePageBounds('shape:a'),b=f.editor.getShapePageBounds('shape:b');assert.ok(Math.abs(b.x-a.maxX-7)<1e-8);
  f.editor.updateShape({id:'shape:group',isLocked:true});assert.equal(spaceDrawingSelection(f.editor,'x',7),false);
 });
 it('scales an order form without changing its content or aspect ratio',()=>{
  const f=fixture();f.editor.createShape({id:'shape:form',type:'profile-7st',props:{w:1800,h:900,data:{name:'kept'}}});
  assert.equal(scaleCanvasForm(f.editor,'shape:form',50),true);const shape=f.editor.getShape('shape:form');assert.equal(shape.props.w,900);assert.equal(shape.props.h,450);assert.deepEqual(shape.props.data,{name:'kept'});
  assert.equal(scaleCanvasForm(f.editor,'shape:form',0),false);f.state.isReadonly=true;assert.equal(scaleCanvasForm(f.editor,'shape:form',100),false);
 });
});
describe('production file destinations',()=>{
 function pocket(){const f=fixture();f.editor.createShape({id:'shape:cnc',type:'frame',x:1000,props:{w:800,h:500},meta:{omsFilePocket:'cnc'}});f.editor.createShape({id:'shape:bender',type:'frame',x:1000,y:540,props:{w:800,h:500},meta:{omsFilePocket:'bender'}});return f;}
 it('places cards in rows and grows boxes without overlapping the following box',()=>{
  const f=pocket();for(let i=0;i<5;i++)addOrderFileDocument(f.editor,{id:String(i),originalName:`part${i}.dxf`,mimeType:'application/dxf',url:'/file'},{x:0,y:0},'cnc');
  const cards=f.editor.getCurrentPageShapesSorted().filter((s:any)=>s.type==='document');assert.equal(cards.length,5);assert.equal(cards[0].x,24);assert.equal(cards[1].x,408);assert.equal(cards[2].y-cards[0].y,304);
  const cnc=f.editor.getShape('shape:cnc'),bender=f.editor.getShape('shape:bender');assert.ok(cnc.props.h>=cards[4].y+cards[4].props.h+24);assert.equal(bender.y,cnc.props.h+40);
  addOrderFileDocument(f.editor,{id:'0',originalName:'same',mimeType:'application/dxf',url:'/file'},{x:0,y:0},'cnc');assert.equal(f.editor.getCurrentPageShapesSorted().filter((s:any)=>s.type==='document').length,5);
 });
 it('preserves manually placed cards and does not mutate locked pockets',()=>{
  const f=pocket();f.editor.createShape({id:'shape:manual',type:'document',parentId:'shape:cnc',x:40,y:700,props:{w:300,h:200}});arrangeProductionPocket(f.editor,'shape:cnc' as any,200);
  assert.equal(f.editor.getShape('shape:manual').y,700);assert.ok(f.editor.getShape('shape:cnc').props.h>=924);
  f.editor.updateShape({id:'shape:cnc',isLocked:true});addOrderFileDocument(f.editor,{id:'file',originalName:'x',mimeType:'text/plain',url:'/file'},{x:0,y:0},'cnc');assert.equal(f.shapes.size,3);
 });
 it('routes a generated export through the unsaved draft queue with its selected category',async()=>{
  const f=pocket();let category='';setOrderBridge(f.editor,{orderId:'draft-local',onFilesUpload:async()=>{},onStoreCanvasFile:async(file,pocket)=>{category=pocket!;assert.equal(file.name,'part.dxf');return {id:'queued',url:'blob:queued'};}});
  const result=await saveProductionExport(f.editor,new File(['drawing'],'part.dxf',{type:'application/dxf'}),'cnc');assert.equal(result.queued,true);assert.equal(category,'cnc');
  const card=f.editor.getCurrentPageShapesSorted().find((s:any)=>s.type==='document');assert.equal(card.parentId,'shape:cnc');assert.equal(card.props.fileId,'queued');
 });
 it('retains a stored attachment but skips canvas placement when permissions change during upload',async()=>{
  const f=pocket();setOrderBridge(f.editor,{orderId:'draft-local',onFilesUpload:async()=>{},onStoreCanvasFile:async()=>{f.state.isReadonly=true;return {id:'queued',url:'blob:queued'};}});
  await saveProductionExport(f.editor,new File(['x'],'part.dxf',{type:'application/dxf'}),'cnc');assert.equal(f.shapes.size,2);
 });
});

describe('stored production export contract',()=>{
 it('uploads to the canonical order category and only places a card after success',async()=>{
  const f=fixture();f.editor.createShape({id:'shape:laser',type:'frame',props:{w:800,h:500},meta:{omsFilePocket:'laser'}});
  setOrderBridge(f.editor,{orderId:'order-123'});const original=globalThis.fetch;
  try{
   globalThis.fetch=async(input,init)=>{
    assert.ok(String(input).endsWith('/api/files/upload'));const body=init!.body as FormData;
    assert.equal(body.get('order_id'),'order-123');assert.equal(body.get('file_type'),'laser');assert.equal((body.get('file') as File).name,'part.eps');
    return new Response(JSON.stringify({file:{id:'stored'}}),{status:201});
   };
   const result=await saveProductionExport(f.editor,new File(['%!PS-Adobe-3.0'],'part.eps',{type:'application/postscript'}),'laser');
   assert.equal(result.queued,false);const card=f.editor.getCurrentPageShapesSorted().find((s:any)=>s.type==='document');assert.equal(card.parentId,'shape:laser');assert.equal(card.props.url,'/api/files/stored/download');
   globalThis.fetch=async()=>new Response('{}',{status:403});
   await assert.rejects(()=>saveProductionExport(f.editor,new File(['x'],'other.dxf'),'laser'));assert.equal(f.shapes.size,2);
  }finally{globalThis.fetch=original;}
 });
});

describe('production vector file validation',()=>{
 it('accepts EPS and SVG exports while rejecting mismatched extensions and signatures',async()=>{
  const {normalizeOrderFile,matchesOrderFileSignature}=await import('../../src/lib/server/files/order-storage');
  const svg='<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/></svg>';
  assert.equal(normalizeOrderFile(new File([svg],'drawing.svg',{type:'image/svg+xml'})).mime,'image/svg+xml');
  assert.equal(matchesOrderFileSignature('svg',new TextEncoder().encode(svg)),true);
  assert.equal(matchesOrderFileSignature('eps',new TextEncoder().encode('%!PS-Adobe-3.0 EPSF-3.0')),true);
  assert.equal(matchesOrderFileSignature('svg',new TextEncoder().encode('<html>not an SVG</html>')),false);
  assert.equal(matchesOrderFileSignature('eps',new TextEncoder().encode('%PDF-1.7')),false);
  assert.throws(()=>normalizeOrderFile(new File([svg],'drawing.svg',{type:'text/html'})));
 });
});

describe('nested and legacy canvas layouts',()=>{
 it('rejects spacing a group together with its nested grandchild',()=>{
  const f=fixture();f.editor.createShape({id:'shape:outer',type:'group'});f.editor.createShape({id:'shape:inner',type:'group',parentId:'shape:outer'});f.editor.createShape({id:'shape:child',type:'cad-ellipse',parentId:'shape:inner'});
  f.editor.setSelectedShapes(['shape:outer','shape:child']);assert.equal(spaceDrawingSelection(f.editor,'x',10),false);
 });
 it('adds a profile using the saved sheet width and below its existing content',async()=>{
  const {syncOrderDataToCanvas}=await import('../../src/lib/components/canvas/templates/DraftOrderTemplate');
  const f=fixture();f.editor.getCurrentPageShapes=()=>f.editor.getCurrentPageShapesSorted();f.editor.batch=(fn:()=>void)=>fn();
  f.editor.createShape({id:'shape:profile',type:'profile-7st',x:24,y:800,props:{w:1000,h:1300,orderId:'draft',profileIndex:0,quantity:1,data:{}}});
  syncOrderDataToCanvas(f.editor,undefined,undefined,{orderId:'draft',profiles:[{quantity:1,configuration:{}},{quantity:1,configuration:{}}]});
  const added=f.editor.getCurrentPageShapesSorted().find((s:any)=>s.props.profileIndex===1);assert.equal(added.props.w,1000);assert.equal(added.y,2140);
 });
});
