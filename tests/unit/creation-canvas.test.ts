import {describe,it,expect} from 'vitest';
import {prepareCreationCanvas,creationCanvasFilePockets,updateCreationCanvasPockets} from '../../src/lib/order/creation-canvas';
import {ORDER_CANVAS_SCALE_META_KEY} from '../../src/lib/order/canvas-layout-scale';
describe('new draft canvas persistence',()=>{
 it('reconciles a pocket chosen in Form after capturing and hiding the canvas',()=>{
  const snapshot={document:{store:{
   'shape:visuals':{id:'shape:visuals',type:'frame',props:{name:'Visuals (PDF/Rasters)'},meta:{omsFilePocket:'visuals'}},
   'shape:cnc':{id:'shape:cnc',type:'frame',props:{name:'CNC Routing'},meta:{omsFilePocket:'cnc'}},
   'shape:file':{id:'shape:file',type:'document',parentId:'shape:visuals',x:50,y:190,props:{w:360,h:280,fileId:'queued',url:'blob:preview'},meta:{omsFilePocket:'visuals'}}
  }}};
  const changed=updateCreationCanvasPockets(snapshot,{queued:'cnc'});
  const saved=prepareCreationCanvas(changed,'local','saved',{queued:'stored'},new Set());
  expect(saved.document.store['shape:file'].parentId).toBe('shape:cnc');
  expect(saved.document.store['shape:file'].meta.omsFilePocket).toBe('cnc');
  expect(saved.document.store['shape:file'].props.fileId).toBe('stored');
  expect(snapshot.document.store['shape:file'].parentId).toBe('shape:visuals');
 });
 it('keeps hidden-canvas generated viewers proportional when Form changes their destination',()=>{
  const scale=6000/(1800*25.4/96);
  const snapshot={document:{store:{
   'shape:visuals':{id:'shape:visuals',type:'frame',props:{name:'Visuals (PDF/Rasters)'},meta:{omsFilePocket:'visuals'}},
   'shape:cnc':{id:'shape:cnc',type:'frame',props:{name:'CNC Routing'},meta:{omsFilePocket:'cnc',[ORDER_CANVAS_SCALE_META_KEY]:scale}},
   'shape:file':{id:'shape:file',type:'document',parentId:'shape:visuals',x:50,y:190,props:{w:360,h:280,fileId:'queued',url:'blob:preview'},meta:{omsFilePocket:'visuals',omsAutoArrange:true,retained:'keep'}}
  }}};
  const changed=updateCreationCanvasPockets(snapshot,{queued:'cnc'}),doc=changed.document.store['shape:file'];
  expect(doc.parentId).toBe('shape:cnc');expect(doc.x).toBe(24*scale);expect(doc.y).toBe(180*scale);
  expect(doc.props.w).toBe(360*scale);expect(doc.props.h).toBe(280*scale);expect(doc.meta[ORDER_CANVAS_SCALE_META_KEY]).toBe(scale);
  expect(doc.meta.retained).toBe('keep');expect(snapshot.document.store['shape:file'].props.w).toBe(360);
  const returned=updateCreationCanvasPockets(changed,{queued:'visuals'}).document.store['shape:file'];
  expect(Math.abs(returned.props.w-360)<1e-8).toBe(true);expect(Math.abs(returned.props.h-280)<1e-8).toBe(true);
  expect(returned.x).toBe(24);expect(returned.y).toBe(180);expect(returned.meta[ORDER_CANVAS_SCALE_META_KEY]).toBe(1);
 });
 it('preserves manually sized viewer dimensions and an unchanged destination position',()=>{
  const snapshot={store:{
   'shape:cnc':{id:'shape:cnc',type:'frame',props:{name:'CNC Routing'},meta:{omsFilePocket:'cnc',[ORDER_CANVAS_SCALE_META_KEY]:12}},
   'shape:manual':{id:'shape:manual',type:'document',parentId:'page:one',x:91,y:217,props:{w:420,h:360,fileId:'manual'},meta:{omsFilePocket:'visuals',[ORDER_CANVAS_SCALE_META_KEY]:2}},
   'shape:kept':{id:'shape:kept',type:'document',parentId:'shape:cnc',x:555,y:777,props:{w:450,h:300,fileId:'kept'},meta:{omsFilePocket:'cnc',omsAutoArrange:true,[ORDER_CANVAS_SCALE_META_KEY]:3}}
  }};
  const changed=updateCreationCanvasPockets(snapshot,{manual:'cnc',kept:'cnc'});
  expect(changed.store['shape:manual'].props).toEqual(snapshot.store['shape:manual'].props);
  expect(changed.store['shape:manual'].meta[ORDER_CANVAS_SCALE_META_KEY]).toBe(2);
  expect(changed.store['shape:manual'].x).toBe(24*12);
  expect(changed.store['shape:kept']).toEqual(snapshot.store['shape:kept']);
 });
 it('refuses unsafe scaled and parent-transformed snapshot moves without changing their assignment',()=>{
  for(const problem of ['large-scale','near-edge','rotated-parent','children']){
   const snapshot:any={document:{store:{
    'shape:source':{id:'shape:source',type:'frame',x:0,y:0,rotation:0,props:{w:800,h:500},meta:{omsFilePocket:'visuals'}},
    'shape:target':{id:'shape:target',type:'frame',x:problem==='near-edge'?999000:0,y:0,rotation:0,props:{w:800,h:500},meta:{omsFilePocket:'cnc',[ORDER_CANVAS_SCALE_META_KEY]:problem==='large-scale'?12598.425196850393:12.598425196850393}},
    'shape:file':{id:'shape:file',type:'document',parentId:'shape:source',x:50,y:190,rotation:0,props:{w:360,h:280,fileId:'queued'},meta:{omsFilePocket:'visuals',omsAutoArrange:true}}
   }}};
   const store=snapshot.document.store;
   if(problem==='rotated-parent'){
    store['shape:parent']={id:'shape:parent',type:'group',x:0,y:999000,rotation:Math.PI/2,parentId:'page:one'};
    store['shape:target'].parentId='shape:parent';
   }
   if(problem==='children')store['shape:cut']={id:'shape:cut',type:'cad-ellipse',parentId:'shape:file',x:0,y:0,props:{w:100,h:100}};
   const changed=updateCreationCanvasPockets(snapshot,{queued:'cnc'});
   expect(changed).toEqual(snapshot);
   expect(updateCreationCanvasPockets(snapshot,{queued:'cnc'},{requireAll:true})).toBe(null);
  }
 });
 it('preserves locked viewers and every locked source or destination ancestor',()=>{
  for(const locked of ['shape:file','shape:source','shape:source-parent','shape:target','shape:target-parent']){
   const snapshot:any={store:{
    'shape:source-parent':{id:'shape:source-parent',type:'group',parentId:'page:one',x:0,y:0,rotation:0},
    'shape:target-parent':{id:'shape:target-parent',type:'group',parentId:'page:one',x:0,y:0,rotation:0},
    'shape:source':{id:'shape:source',type:'frame',parentId:'shape:source-parent',x:0,y:0,rotation:0,props:{w:800,h:500},meta:{omsFilePocket:'visuals'}},
    'shape:target':{id:'shape:target',type:'frame',parentId:'shape:target-parent',x:0,y:0,rotation:0,props:{w:800,h:500},meta:{omsFilePocket:'cnc',[ORDER_CANVAS_SCALE_META_KEY]:12}},
    'shape:file':{id:'shape:file',type:'document',parentId:'shape:source',x:50,y:190,rotation:0,props:{w:360,h:280,fileId:'queued'},meta:{omsFilePocket:'visuals',omsAutoArrange:true}}
   }};
   snapshot.store[locked].isLocked=true;
   expect(updateCreationCanvasPockets(snapshot,{queued:'cnc'})).toEqual(snapshot);
   expect(updateCreationCanvasPockets(snapshot,{queued:'cnc'},{requireAll:true})).toBe(null);
  }
 });
 it('allows Form assignment before a queued attachment has a canvas viewer',()=>{
  const snapshot={document:{store:{'page:one':{id:'page:one',typeName:'page',meta:{}}}}};
  expect(updateCreationCanvasPockets(snapshot,{queued:'cnc'},{requireAll:true})).toEqual(snapshot);
 });
 it('keeps the latest canvas move and exact position when persisting file references',()=>{
  const snapshot={document:{store:{
   'shape:cnc':{id:'shape:cnc',type:'frame',props:{name:'CNC Routing'},meta:{omsFilePocket:'cnc'}},
   'shape:file':{id:'shape:file',type:'document',parentId:'shape:cnc',x:91,y:217,props:{fileId:'queued',url:'blob:preview'},meta:{omsFilePocket:'visuals'}}
  }}};
  expect(creationCanvasFilePockets(snapshot)).toEqual({queued:'cnc'});
  const saved=prepareCreationCanvas(snapshot,'local','saved',{queued:'stored'},new Set());
  expect(saved.document.store['shape:file'].parentId).toBe('shape:cnc');
  expect(saved.document.store['shape:file'].x).toBe(91);expect(saved.document.store['shape:file'].y).toBe(217);
 });
 it('uses canonical private attachments, removes deleted files and leaves the local snapshot untouched',()=>{
  const snapshot={document:{store:{form:{props:{orderId:'local'}},file:{props:{fileId:'queued',url:'blob:preview'}},removed:{props:{fileId:'removed',url:'blob:removed'}},note:{props:{text:'Review dimensions'}}}}};
  const saved=prepareCreationCanvas(snapshot,'local','saved',{queued:'stored'},new Set(['removed']),'/oms');
  expect(saved.document.store.form.props.orderId).toBe('saved');
  expect(saved.document.store.file.props).toEqual({fileId:'stored',url:'/oms/api/files/stored/download'});
  expect(saved.document.store.removed).toBe(undefined);
  expect(saved.document.store.note.props.text).toBe('Review dimensions');
  expect(snapshot.document.store.file.props.url).toBe('blob:preview');
 });
 it('blocks persistence of a file with no successful upload',()=>{
  expect(()=>prepareCreationCanvas({props:{fileId:'pending',url:'blob:preview'}},'local','saved',{},new Set())).toThrow();
 });
 it('drops deleted viewer bindings and session selection without touching other connections or CAD settings',()=>{
  const snapshot={document:{store:{
   'page:one':{meta:{omsCad:{scale:10,unit:'mm'}}},
   'shape:file':{id:'shape:file',typeName:'shape',props:{fileId:'removed',url:'blob:removed'}},
   'shape:arrow':{id:'shape:arrow',typeName:'shape',props:{}},
   'binding:deleted':{typeName:'binding',fromId:'shape:arrow',toId:'shape:file'},
   'binding:kept':{typeName:'binding',fromId:'shape:arrow',toId:'shape:kept'}
  }},session:{pageStates:[{pageId:'page:one',selectedShapeIds:['shape:file','shape:arrow'],focusedGroupId:null}]}};
  const saved=prepareCreationCanvas(snapshot,'local','saved',{},new Set(['removed']));
  expect(saved.document.store['shape:file']).toBe(undefined);
  expect(saved.document.store['binding:deleted']).toBe(undefined);
  expect(saved.document.store['binding:kept']).toEqual(snapshot.document.store['binding:kept']);
  expect(saved.document.store['page:one']).toEqual(snapshot.document.store['page:one']);
  expect(saved.session.pageStates[0].selectedShapeIds).toEqual(['shape:arrow']);
  expect(snapshot.session.pageStates[0].selectedShapeIds).toEqual(['shape:file','shape:arrow']);
 });
});
