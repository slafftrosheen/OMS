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
});
