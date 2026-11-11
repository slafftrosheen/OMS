import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {fixture} from '../helpers/cad-editor';
import {syncCreationFileDocuments} from '../../src/lib/components/canvas/order-file-documents';
describe('canvas attachment placement',()=>{
 it('keeps a document inside its moved group when its pocket metadata catches up',()=>{
  const f=fixture();
  f.editor.reparentShapes=(ids:string[],parentId:string)=>ids.forEach(id=>f.editor.updateShape({id,parentId}));
  f.editor.createShape({id:'shape:cnc',type:'frame',props:{name:'CNC Routing'},meta:{omsFilePocket:'cnc'}});
  f.editor.createShape({id:'shape:group',type:'group',parentId:'shape:cnc'});
  f.editor.createShape({id:'shape:file',type:'document',parentId:'shape:group',x:91,y:217,props:{fileId:'queued'},meta:{omsFilePocket:'visuals'}});
  syncCreationFileDocuments(f.editor,[{id:'queued',originalName:'part.dxf',mimeType:'application/dxf',url:'blob:file',file_type:'cnc'}]);
  const doc=f.editor.getShape('shape:file');
  assert.equal(doc.parentId,'shape:group');assert.equal(doc.x,91);assert.equal(doc.y,217);
  assert.equal(doc.meta.omsFilePocket,'cnc');
 });
});
