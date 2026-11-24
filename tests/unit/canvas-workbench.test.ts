import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {fixture} from '../helpers/cad-editor';
import {twoPointGeometry,CadCircleTool,CadDimensionTool} from '../../src/lib/components/canvas/CadTwoPointTool';
import {editDrawingText,textPointSize,spaceDrawingSelection,scaleCanvasForm} from '../../src/lib/components/canvas/workbench-operations';
import {addOrderFileDocument} from '../../src/lib/components/canvas/order-file-documents';
import {arrangeProductionPocket} from '../../src/lib/components/canvas/production-layout';
import {uploadOrderCanvasFiles} from '../../src/lib/components/canvas/asset-uploader';
import {productionExportTarget,saveProductionExport} from '../../src/lib/components/canvas/production-export';
import {setOrderBridge} from '../../src/lib/components/canvas/state-bridge';
import {MAX_ORDER_FILE_BYTES} from '../../src/lib/order/file-limits';
import {CadLineTool} from '../../src/lib/components/canvas/CadPolylineTool';
import {polylineSession,resolveCadDraftPoint} from '../../src/lib/components/canvas/cad-polyline-draft';
import {applyDrawingGuideChange,prepareDrawingGuideChange} from '../../src/lib/components/canvas/drawing-guides';
import {DEFAULT_CAD_SETTINGS} from '../../src/lib/components/canvas/cad-settings';

describe('CAD drawing and text workbench',()=>{
 it('finishes a two-point line on an angled guide or at an exact typed bearing',()=>{
  const f=fixture();
  assert.equal(applyDrawingGuideChange(f.editor,prepareDrawingGuideChange(f.editor,
   {kind:'add',axis:'angle',pivot:{x:125,y:75},angle:45})),true);
  f.state.snap=true;
  const line=new CadLineTool(f.editor,undefined as any);
  const click=(x:number,y:number)=>{f.editor.inputs.currentPagePoint={x,y};line.onPointerDown({button:0} as any);};
  line.onEnter();click(10,10);click(126,78);
  const drawn=f.editor.getOnlySelectedShape();assert.equal(drawn.type,'cad-path');
  assert.deepEqual(drawn.props.points,[{x:0,y:0},{x:114,y:66}]);
  assert.equal(polylineSession(f.editor).controller,null);
  line.onEnter();const session=polylineSession(f.editor);
  assert.equal(session.controller!.add({x:0,y:0}),true);
  const target=resolveCadDraftPoint('polar',25.4,90,{x:0,y:0},DEFAULT_CAD_SETTINGS)!;
  assert.equal(session.controller!.add(target),true);
  assert.ok(Math.abs(f.editor.getOnlySelectedShape().props.points[1].y+96)<1e-8);
 });
 it('constructs exact centre-radius circles and rejects zero/oversized geometry',()=>{
  assert.deepEqual(twoPointGeometry('circle',{x:10,y:20},{x:13,y:24}),{type:'cad-ellipse',x:5,y:15,props:{w:10,h:10}});
  assert.equal(twoPointGeometry('circle',{x:0,y:0},{x:0,y:0}),null);
  assert.equal(twoPointGeometry('circle',{x:0,y:0},{x:1e9,y:0}),null);
  const d=twoPointGeometry('dimension',{x:10,y:20},{x:13,y:24},2)!;
  assert.deepEqual(d.props,{endX:3,endY:4,offset:15,decorationScale:.5,precision:null,showUnit:true,marker:'auto'});
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
  const f=fixture();f.editor.createShape({id:'shape:text',type:'text',props:{text:'old',size:'m',scale:1,font:'sans',textAlign:'start',autoSize:true,w:120}});f.editor.setSelectedShapes(['shape:text']);
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
 it('uses the clicked pocket for stored and unsaved uploads when frames overlap',async()=>{
  const f=pocket();
  f.editor.updateShape({id:'shape:bender',y:0});
  f.editor.getContainer=()=>new EventTarget();
  const point={x:1100,y:100};
  const file=new File(['drawing'],'part.dxf',{type:'application/dxf'});
  const original=globalThis.fetch;
  try {
   const posted:Array<FormDataEntryValue|null>=[];
   globalThis.fetch=async(_input,init)=>{
    posted.push((init?.body as FormData).get('file_type'));
    return Response.json({file:{id:`upload-${posted.length}`}},{status:201});
   };
   setOrderBridge(f.editor,{orderId:'order-123'});
   await uploadOrderCanvasFiles(f.editor,[file],'order-123',point,undefined,'cnc');
   assert.equal(f.editor.getCurrentPageShapesSorted().find((s:any)=>s.props.fileId==='upload-1')?.parentId,'shape:cnc');
   await uploadOrderCanvasFiles(f.editor,[file],'order-123',point);
   assert.deepEqual(posted,['cnc','bender']);
   let queued:string|undefined;
   setOrderBridge(f.editor,{orderId:'draft-local',onFilesUpload:async(_files,_point,pocket)=>{queued=pocket;}});
   await uploadOrderCanvasFiles(f.editor,[file],'draft-local',point,undefined,'cnc');
   assert.equal(queued,'cnc');
  }finally{globalThis.fetch=original;}
 });
 it('routes a generated export through the unsaved draft queue with its selected category',async()=>{
  const f=pocket();let category='';setOrderBridge(f.editor,{orderId:'draft-local',onFilesUpload:async()=>{},onStoreCanvasFile:async(file,pocket)=>{category=pocket!;assert.equal(file.name,'part.dxf');return {id:'queued',url:'blob:queued'};}});
  const result=await saveProductionExport(f.editor,new File(['drawing'],'part.dxf',{type:'application/dxf'}),'cnc');assert.equal(result.queued,true);assert.equal(category,'cnc');
  const card=f.editor.getCurrentPageShapesSorted().find((s:any)=>s.type==='document');assert.equal(card.parentId,'shape:cnc');assert.equal(card.props.fileId,'queued');
 });
 it('keeps a successful attachment upload and reports when its physical canvas card cannot be placed',async()=>{
  const f=fixture(),container=new EventTarget(),messages:Array<{message:string;busy:boolean}>=[];
  f.editor.getContainer=()=>container;
  f.editor.updatePage({meta:{omsCad:DEFAULT_CAD_SETTINGS}});
  container.addEventListener('oms:canvas-upload',event=>messages.push((event as CustomEvent).detail));
  let uploaded=0;
  setOrderBridge(f.editor,{orderId:'order-123',onAssetUploaded:()=>{uploaded++;}});
  const original=globalThis.fetch;
  try{
   globalThis.fetch=async()=>Response.json({file:{id:'stored-file'}},{status:201});
   await uploadOrderCanvasFiles(f.editor,[new File(['drawing'],'edge.pdf',{type:'application/pdf'})],'order-123',{x:999000,y:0});
   assert.equal(uploaded,1);assert.equal(f.shapes.size,0);
   assert.equal(messages.at(-1)?.busy,false);
   assert.ok(messages.at(-1)?.message.includes('edge.pdf'));
   assert.ok(messages.at(-1)?.message.includes('canvas card could not be placed'));
   assert.equal(messages.at(-1)?.message.includes('Save Draft to keep their canvas placement'),false);
  }finally{globalThis.fetch=original;}
 });
 it('retains a stored attachment but skips canvas placement when permissions change during upload',async()=>{
  const f=pocket();setOrderBridge(f.editor,{orderId:'draft-local',onFilesUpload:async()=>{},onStoreCanvasFile:async()=>{f.state.isReadonly=true;return {id:'queued',url:'blob:queued'};}});
  const result=await saveProductionExport(f.editor,new File(['x'],'part.dxf',{type:'application/dxf'}),'cnc');assert.equal(f.shapes.size,2);
  assert.equal(result.placed,false);
 });
 it('rolls back partial layout and retries the saved draft file after canvas edits without another upload',async()=>{
  const f=pocket(), file=new File(['drawing'],'part.pdf',{type:'application/pdf'});
  let uploads=0;
  setOrderBridge(f.editor,{orderId:'draft-local',onFilesUpload:async()=>{},onStoreCanvasFile:async()=>{
   uploads++;
   return {id:'queued',url:'blob:queued'};
  }});
  const originalUpdate=f.editor.updateShape;
  // A new card is created directly at its validated final position. Force a
  // dependent frame growth so the failure still occurs after card creation.
  f.editor.updateShape({id:'shape:cnc',meta:{...f.editor.getShape('shape:cnc').meta,omsPocketHeaderHeight:400}});
  f.editor.updateShape=(patch:any)=>{if(patch.type==='frame')throw new Error('layout failed');return originalUpdate(patch);};
  const first=await saveProductionExport(f.editor,file,'cnc');
  assert.equal(first.placed,false);
  assert.equal(f.shapes.size,2);
  f.editor.updateShape=originalUpdate;
  f.editor.updatePage({meta:{edited:true}});
  const retry=await saveProductionExport(f.editor,file,'cnc');
  assert.equal(retry.placed,true);
  assert.equal(retry.id,first.id);
  assert.equal(uploads,1);
  assert.equal([...f.shapes.values()].filter(s=>s.props.fileId==='queued').length,1);
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
 it('reuses the upload request after a lost response and assigns a fresh one to another save',async()=>{
  const f=fixture();
  f.editor.createShape({id:'shape:laser',type:'frame',props:{w:800,h:500},meta:{omsFilePocket:'laser'}});
  setOrderBridge(f.editor,{orderId:'order-123'});
  const file=new File(['%PDF-1.7'],'part.pdf',{type:'application/pdf'});
  const requests:FormDataEntryValue[]=[];
  const original=globalThis.fetch;
  try {
   globalThis.fetch=async(_input,init)=>{
    const requestId=(init?.body as FormData).get('canvas_export_request_id');
    assert.equal(typeof requestId,'string');
    requests.push(requestId!);
    if(requests.length===1)throw new TypeError('Response lost');
    return Response.json({file:{id:requests.length===2?'recovered':'another-save'}},{status:201});
   };
   await assert.rejects(saveProductionExport(f.editor,file,'laser'),{message:'exportUnconfirmed'});
   assert.equal(f.shapes.size,1);
   assert.equal((await saveProductionExport(f.editor,file,'laser')).placed,true);
   assert.equal(requests[1],requests[0]);
   assert.equal((await saveProductionExport(f.editor,new File([file],file.name,{type:file.type}),'laser')).placed,true);
   assert.notEqual(requests[2],requests[0]);
  } finally { globalThis.fetch=original; }
 });
 it('checks the attachment limit before saving and distinguishes HTTP recovery cases',async()=>{
  const f=fixture();
  f.editor.createShape({id:'shape:laser',type:'frame',props:{w:800,h:500},meta:{omsFilePocket:'laser'}});
  setOrderBridge(f.editor,{orderId:'order-123'});
  const oversized=new File([new Uint8Array(MAX_ORDER_FILE_BYTES+1)],'large.png',{type:'image/png'});
  const file=new File(['%PDF-1.7'],'part.pdf',{type:'application/pdf'});
  const original=globalThis.fetch;
  try {
   globalThis.fetch=async()=>assert.fail('invalid attachment must not be sent');
   await assert.rejects(saveProductionExport(f.editor,oversized,'laser'),{message:'exportAttachmentLimit'});
   await assert.rejects(saveProductionExport(f.editor,new File([],'empty.pdf'),'laser'),{message:'exportEmptyFile'});
   const requestIds=new Set<FormDataEntryValue|null>();
   for(const [status,issue] of [[401,'exportSignIn'],[403,'exportForbidden'],[409,'exportConflict'],[413,'exportUploadLimit'],
       [429,'exportBusy'],[503,'exportStoreUnavailable'],[504,'exportTimeout'],[200,'exportUnconfirmed']] as const){
    globalThis.fetch=async(_input,init)=>{
     requestIds.add((init?.body as FormData).get('canvas_export_request_id'));
     return new Response('<html>Unexpected response</html>',{status});
    };
    await assert.rejects(saveProductionExport(f.editor,file,'laser'),{message:issue});
   }
   assert.equal(requestIds.size,1);
   assert.ok([...requestIds][0]);
   assert.equal(f.shapes.size,1);
  } finally { globalThis.fetch=original; }
 });
 it('skips upload for a stale target and skips placement in a replacement pocket',async()=>{
  const f=fixture(), file=new File(['drawing'],'part.svg',{type:'image/svg+xml'});
  const frame=(id:string)=>f.editor.createShape({id,type:'frame',props:{w:800,h:500},meta:{omsFilePocket:'laser'}});
  frame('shape:first');
  setOrderBridge(f.editor,{orderId:'order-123'});
  const before=productionExportTarget(f.editor,'laser')!;
  setOrderBridge(f.editor,{orderId:'order-456'});
  const original=globalThis.fetch;
  try {
   globalThis.fetch=async()=>assert.fail('stale export must not be uploaded');
   await assert.rejects(saveProductionExport(f.editor,file,'laser',undefined,undefined,before),/changed/);
   globalThis.fetch=async()=>{
    f.editor.deleteShapes(['shape:first']);
    frame('shape:replacement');
    return Response.json({file:{id:'committed'}},{status:201});
   };
   const result=await saveProductionExport(f.editor,file,'laser');
   assert.equal(result.placed,false);
   assert.equal(f.shapes.size,1);
   assert.equal(result.id,'committed');
  } finally { globalThis.fetch=original; }
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
