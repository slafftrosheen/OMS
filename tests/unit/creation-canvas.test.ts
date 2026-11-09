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
});
