import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const {JSDOM}=createRequire(`${process.cwd()}/package.json`)('jsdom');

async function harness(run:(h:any)=>Promise<void>|void){
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/',pretendToBeVisual:true});
 const win=dom.window,channels:MessageChannel[]=[],NativeChannel=globalThis.MessageChannel;
 win.fetch=globalThis.fetch.bind(globalThis);
 win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
 const values:Record<string,unknown>={matchMedia:win.matchMedia,
  getComputedStyle:win.getComputedStyle.bind(win),requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),
  MessageChannel:class extends NativeChannel{constructor(){super();channels.push(this);}},ResizeObserver:class{observe(){}unobserve(){}disconnect(){}}};
 for(const key of ['window','document','navigator','self','Element','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','SVGElement','SVGSVGElement','XMLSerializer','Node','Event','CustomEvent','MouseEvent','KeyboardEvent','FocusEvent','DOMRect','DOMParser','MutationObserver','Image','localStorage'])values[key]=key==='window'||key==='self'?win:win[key];
 const previous=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 const tl=await import('@tldraw/tldraw');
 const layout=await import('../../src/lib/components/canvas/production-layout');
 const files=await import('../../src/lib/components/canvas/order-file-documents');
 class DocumentUtil extends tl.BaseBoxShapeUtil<any>{
  static override type='document';
  static override props={w:tl.T.number,h:tl.T.number,fileId:tl.T.string,title:tl.T.string,content:tl.T.string,status:tl.T.string,url:tl.T.string,mime:tl.T.string,kind:tl.T.string,fit:tl.T.string,pdfPage:tl.T.number,description:tl.T.string};
  getDefaultProps(){return {w:360,h:280,fileId:'',title:'',content:'',status:'ready',url:'',mime:'',kind:'file',fit:'contain',pdfPage:1,description:''};}
  component(){return null;}
  indicator(){return null;}
 }
 const host=document.createElement('div');document.body.append(host);
 const shapeUtils=[...tl.defaultShapeUtils,DocumentUtil];
 const editor=new tl.Editor({store:tl.createTLStore({shapeUtils,bindingUtils:tl.defaultBindingUtils}),shapeUtils,bindingUtils:tl.defaultBindingUtils,
  tools:[...tl.defaultTools,...tl.defaultShapeTools],getContainer:()=>host,initialState:'select'});
 editor.updateViewportScreenBounds(new tl.Box(0,0,1200,900));
 const snapshot=()=>structuredClone(editor.store.getStoreSnapshot('document'));
 const frame=(id:string,pocket:string,x:number,y=0)=>editor.createShape({id:id as any,type:'frame',x,y,props:{w:800,h:500,name:pocket},meta:{omsFilePocket:pocket}});
 try{await run({editor,tl,layout,files,snapshot,frame});}
 finally{editor.dispose();host.remove();channels.forEach(channel=>{channel.port1.close();channel.port2.close();});dom.window.close();for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
}

describe('native editor production layout transactions',()=>{
 it('routes drops by the visible rotated pocket rather than its enclosing page rectangle',async()=>harness(({editor,files,frame}:any)=>{
  frame('shape:cnc','cnc',0);
  editor.updateShape({id:'shape:cnc',type:'frame',rotation:Math.PI/4});
  const pocket=editor.getShape('shape:cnc');
  const outside={x:500,y:20};
  assert.equal(editor.getShapePageBounds(pocket).containsPoint(outside),true,'probe must be inside the enclosing bounds');
  assert.equal(editor.isPointInShape(pocket,outside,{hitInside:true}),false,'probe is outside the actual rotated frame');
  assert.equal(files.orderPocketAtPoint(editor,outside),undefined);
  const inside=editor.getShapePageTransform(pocket).applyToPoint({x:400,y:250});
  assert.equal(files.orderPocketAtPoint(editor,inside)?.id,pocket.id);
  assert.equal(files.addOrderFileDocument(editor,{id:'free-file',originalName:'drawing.pdf',mimeType:'application/pdf',url:'/file'},outside),true);
  const document=editor.getCurrentPageShapesSorted().find((shape:any)=>shape.props.fileId==='free-file');
  assert.equal(document.parentId,editor.getCurrentPageId());
  assert.equal(document.x,outside.x);assert.equal(document.y,outside.y);
 }));

 it('does not route a drop into a production pocket where an ancestor clips it away',async()=>harness(({editor,files}:any)=>{
  editor.createShape({id:'shape:parent',type:'frame',x:300,y:200,rotation:.4,props:{w:100,h:100}});
  editor.createShape({id:'shape:cnc',type:'frame',parentId:'shape:parent',x:0,y:0,props:{w:800,h:500},meta:{omsFilePocket:'cnc'}});
  const pocket=editor.getShape('shape:cnc'),transform=editor.getShapePageTransform(pocket);
  const visible=transform.applyToPoint({x:50,y:50}),clipped=transform.applyToPoint({x:200,y:50});
  assert.equal(files.orderPocketAtPoint(editor,visible)?.id,pocket.id);
  assert.equal(files.orderPocketAtPoint(editor,clipped),undefined);
 }));

 it('keeps native document defaults and the destination index assigned by reparenting',async()=>harness(({editor,files,frame}:any)=>{
  frame('shape:source','visuals',0);frame('shape:target','cnc',1000);
  const file={id:'source-file',originalName:'source.pdf',mimeType:'application/pdf',url:'/source'};
  assert.equal(files.addOrderFileDocument(editor,file,{x:0,y:0},'visuals'),true);
  assert.equal(files.addOrderFileDocument(editor,{...file,id:'target-file'},{x:0,y:0},'cnc'),true);
  let source=editor.getCurrentPageShapesSorted().find((s:any)=>s.props.fileId==='source-file');
  const target=editor.getCurrentPageShapesSorted().find((s:any)=>s.props.fileId==='target-file');
  assert.equal(source.props.fit,'contain');assert.equal(source.props.pdfPage,1);assert.equal(source.index,target.index);
  files.syncCreationFileDocuments(editor,[{...file,file_type:'cnc'}]);
  source=editor.getShape(source.id);assert.equal(source.parentId,'shape:target');
  assert.notEqual(source.index,target.index);
  const children=editor.getSortedChildIdsForParent('shape:target').map((id:any)=>editor.getShape(id));
  assert.equal(new Set(children.map((s:any)=>s.index)).size,children.length);
 }));

 it('keeps a reassigned rotated viewer completely below its destination header with one undo',async()=>harness(({editor,files,layout,snapshot,frame,tl}:any)=>{
  frame('shape:source','visuals',0);frame('shape:target','cnc',1500);
  editor.updateShape({id:'shape:target',type:'frame',rotation:Math.PI/2});
  const file={id:'rotated-file',originalName:'drawing.pdf',mimeType:'application/pdf',url:'/file'};
  assert.equal(files.addOrderFileDocument(editor,file,{x:0,y:0},'visuals'),true);
  const id=editor.getCurrentPageShapesSorted().find((shape:any)=>shape.props.fileId===file.id).id;
  const rotation=editor.getShapePageTransform(id).rotation();
  editor.history.clear();const before=snapshot();
  files.syncCreationFileDocuments(editor,[{...file,file_type:'cnc'}]);
  const document=editor.getShape(id),target=editor.getShape('shape:target');
  assert.equal(document.parentId,target.id);
  assert.ok(Math.abs(editor.getShapePageTransform(document).rotation()-rotation)<1e-8);
  const transform=tl.Mat.Identity().translate(document.x,document.y).rotate(document.rotation);
  const corners=new tl.Box(0,0,document.props.w,document.props.h).corners.map((point:any)=>transform.applyToPoint(point));
  for(const point of corners){
   assert.ok(point.x>=24-1e-8&&point.x<=target.props.w-24+1e-8,'viewer stays inside horizontal pocket margins');
   assert.ok(point.y>=layout.productionPocketHeaderHeight(target)+24-1e-8,'viewer stays below the header');
   assert.ok(point.y<=target.props.h-24+1e-8,'viewer is not clipped at the bottom');
  }
  const after=snapshot();editor.undo();assert.deepEqual(snapshot(),before);editor.redo();assert.deepEqual(snapshot(),after);
 }));

 it('spaces rotated generated cards by their visible extents and stabilizes a narrow pocket in one pass',async()=>harness(({editor,layout,frame,tl,snapshot}:any)=>{
  frame('shape:cnc','cnc',1000);
  editor.updateShape({id:'shape:cnc',type:'frame',props:{w:150}});
  editor.createShapes([0,1].map(index=>({id:`shape:card-${index}`,type:'document',parentId:'shape:cnc',x:20,y:20,
   rotation:(index?-.25:.25)*Math.PI,props:{w:360,h:280},meta:{omsAutoArrange:true}})));
  assert.equal(layout.arrangeProductionPocket(editor,'shape:cnc'),true);
  const pocket=editor.getShape('shape:cnc');
  const boxes=[0,1].map(index=>{
   const shape=editor.getShape(`shape:card-${index}`),matrix=tl.Mat.Identity().translate(shape.x,shape.y).rotate(shape.rotation);
   return tl.Box.FromPoints(new tl.Box(0,0,shape.props.w,shape.props.h).corners.map((point:any)=>matrix.applyToPoint(point)));
  });
  for(const box of boxes){
   assert.ok(box.minX>=24-1e-8&&box.maxX<=pocket.props.w-24+1e-8);
   assert.ok(box.minY>=layout.productionPocketHeaderHeight(pocket)+24-1e-8&&box.maxY<=pocket.props.h-24+1e-8);
  }
  assert.ok(boxes[0].maxX+24<=boxes[1].minX+1e-8||boxes[0].maxY+24<=boxes[1].minY+1e-8,'rotated cards have a real gap');
  const settled=snapshot();
  for(let index=0;index<5;index++)assert.equal(layout.arrangeProductionPocket(editor,'shape:cnc'),true);
  assert.deepEqual(snapshot(),settled);
 }));

 it('reverses a failed background relayout without consuming user undo or redo history',async()=>harness(({editor,layout,snapshot,frame}:any)=>{
  frame('shape:cnc','cnc',1000);frame('shape:bender','bender',1000,540);
  editor.createShape({id:'shape:card',type:'document',parentId:'shape:cnc',x:10,y:20,props:{w:360,h:280,fileId:'card'},meta:{omsAutoArrange:true}});
  editor.createShape({id:'shape:user',type:'geo',x:-500,y:0,props:{w:50,h:50}});
  editor.history.clear();editor.mark('user-change');editor.updateShape({id:'shape:user',type:'geo',x:-450});editor.mark('after-user-change');editor.undo();
  assert.equal(editor.getShape('shape:user').x,-500);assert.equal(editor.getCanRedo(),true);
  const before=snapshot(),undos=editor.history.getNumUndos(),redos=editor.history.getNumRedos();
  const stop=editor.sideEffects.registerBeforeChangeHandler('shape',(previous:any,next:any)=>next.id==='shape:bender'?previous:next);
  assert.equal(layout.arrangeProductionPocket(editor,'shape:cnc',400,{history:'ignore'}),false);
  stop();
  assert.deepEqual(snapshot(),before);assert.equal(editor.history.getNumUndos(),undos);assert.equal(editor.history.getNumRedos(),redos);
  assert.equal(layout.arrangeProductionPocket(editor,'shape:cnc',400,{history:'ignore'}),true);
  assert.equal(editor.getShape('shape:cnc').meta.omsPocketHeaderHeight,400);
  const card=structuredClone(editor.getShape('shape:card')),cnc=structuredClone(editor.getShape('shape:cnc')),bender=structuredClone(editor.getShape('shape:bender'));
  assert.equal(editor.history.getNumUndos(),undos);assert.equal(editor.history.getNumRedos(),redos);
  editor.redo();assert.equal(editor.getShape('shape:user').x,-450);
  assert.deepEqual(editor.getShape('shape:card'),card);assert.deepEqual(editor.getShape('shape:cnc'),cnc);assert.deepEqual(editor.getShape('shape:bender'),bender);
  editor.undo();assert.equal(editor.getShape('shape:user').x,-500);assert.deepEqual(editor.getShape('shape:card'),card);
 }));

 it('rolls back a created card and preceding frame writes when native hooks refuse dependent growth',async()=>harness(({editor,files,snapshot,frame}:any)=>{
  frame('shape:cnc','cnc',1000);frame('shape:bender','bender',1000,540);
  editor.updateShape({id:'shape:cnc',type:'frame',meta:{...editor.getShape('shape:cnc').meta,omsPocketHeaderHeight:400}});
  const before=snapshot();
  const stop=editor.sideEffects.registerBeforeChangeHandler('shape',(previous:any,next:any)=>next.id==='shape:bender'?previous:next);
  assert.equal(files.addOrderFileDocument(editor,{id:'file',originalName:'drawing.pdf',mimeType:'application/pdf',url:'/file'},{x:0,y:0},'cnc'),false);
  stop();assert.deepEqual(snapshot(),before);
 }));

 it('rolls back attachment insertion when native hooks refuse the width needed to keep a narrow pocket readable',async()=>harness(({editor,files,snapshot,frame}:any)=>{
  frame('shape:cnc','cnc',1000);editor.updateShape({id:'shape:cnc',type:'frame',props:{w:100}});
  const before=snapshot(),file={id:'narrow-file',originalName:'drawing.pdf',mimeType:'application/pdf',url:'/file'};
  const stop=editor.sideEffects.registerBeforeChangeHandler('shape',(previous:any,next:any)=>next.id==='shape:cnc'&&next.props.w!==previous.props.w?previous:next);
  assert.equal(files.addOrderFileDocument(editor,file,{x:0,y:0},'cnc'),false);
  stop();assert.deepEqual(snapshot(),before);
  assert.equal(files.addOrderFileDocument(editor,file,{x:0,y:0},'cnc'),true);
  const card=editor.getCurrentPageShapesSorted().find((shape:any)=>shape.props.fileId===file.id),pocket=editor.getShape('shape:cnc');
  assert.ok(card.x>=24&&card.props.w>=120&&card.x+card.props.w+24<=pocket.props.w);
 }));
});
