import {describe,it,expect} from 'vitest';
import {prepareCreationCanvas,creationCanvasFilePockets,updateCreationCanvasPockets} from '../../src/lib/order/creation-canvas';
describe('new draft canvas persistence',()=>{
 it('reconciles a pocket chosen in Form after capturing and hiding the canvas',()=>{
  const snapshot={document:{store:{
   'shape:visuals':{id:'shape:visuals',type:'frame',props:{name:'Visuals (PDF/Rasters)'},meta:{omsFilePocket:'visuals'}},
   'shape:cnc':{id:'shape:cnc',type:'frame',props:{name:'CNC Routing'},meta:{omsFilePocket:'cnc'}},
   'shape:file':{id:'shape:file',type:'document',parentId:'shape:visuals',x:50,y:190,props:{fileId:'queued',url:'blob:preview'},meta:{omsFilePocket:'visuals'}}
  }}};
  const changed=updateCreationCanvasPockets(snapshot,{queued:'cnc'});
  const saved=prepareCreationCanvas(changed,'local','saved',{queued:'stored'},new Set());
  expect(saved.document.store['shape:file'].parentId).toBe('shape:cnc');
  expect(saved.document.store['shape:file'].meta.omsFilePocket).toBe('cnc');
  expect(saved.document.store['shape:file'].props.fileId).toBe('stored');
  expect(snapshot.document.store['shape:file'].parentId).toBe('shape:visuals');
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
