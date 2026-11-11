import {describe,it,expect} from 'vitest';
import {prepareCreationCanvas} from '../../src/lib/order/creation-canvas';
describe('new draft canvas persistence',()=>{
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
