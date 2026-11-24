import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {fixture} from '../helpers/cad-editor';
import {addOrderFileDocument,syncCreationFileDocuments} from '../../src/lib/components/canvas/order-file-documents';
import {DEFAULT_CAD_SETTINGS,cadMmPerPixel} from '../../src/lib/components/canvas/cad-settings';
import {defaultOrderCanvasScale} from '../../src/lib/components/canvas/shapes/form-shapes/form-layout';
import {ORDER_CANVAS_SCALE_META_KEY,readOrderCanvasScale} from '../../src/lib/order/canvas-layout-scale';
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
 it('sizes new order attachments outside pockets for the calibrated document without moving their drop point',()=>{
  for(const calibrated of [false,true]){
   const f=fixture();if(calibrated)f.editor.updatePage({meta:{omsCad:DEFAULT_CAD_SETTINGS}});
   addOrderFileDocument(f.editor,{id:'file',originalName:'drawing.pdf',mimeType:'application/pdf',url:'/file'},{x:120,y:340});
   const doc=f.editor.getCurrentPageShapesSorted()[0],scale=calibrated?defaultOrderCanvasScale(DEFAULT_CAD_SETTINGS):1;
   assert.equal(doc.x,120);assert.equal(doc.y,340);assert.equal(doc.props.w,360*scale);assert.equal(doc.props.h,280*scale);
   assert.equal(doc.meta.omsAutoArrange,false);assert.equal(readOrderCanvasScale(doc),scale);
   if(calibrated)assert.ok(Math.abs(doc.props.w*cadMmPerPixel(DEFAULT_CAD_SETTINGS)-1200)<1e-7);
  }
 });
 it('reparents generated viewers between differently scaled pockets and updates their content scale',()=>{
  const f=fixture(),scale=defaultOrderCanvasScale(DEFAULT_CAD_SETTINGS);
  f.editor.reparentShapes=(ids:string[],parentId:string)=>ids.forEach(id=>f.editor.updateShape({id,parentId}));
  f.editor.createShape({id:'shape:visuals',type:'frame',props:{w:800,h:500},meta:{omsFilePocket:'visuals'}});
  f.editor.createShape({id:'shape:cnc',type:'frame',x:1000*scale,props:{w:800*scale,h:500*scale},meta:{omsFilePocket:'cnc',[ORDER_CANVAS_SCALE_META_KEY]:scale}});
  f.editor.createShape({id:'shape:file',type:'document',parentId:'shape:visuals',x:24,y:188,props:{w:360,h:280,fileId:'queued'},meta:{omsFilePocket:'visuals',omsAutoArrange:true,retained:'keep'}});
  syncCreationFileDocuments(f.editor,[{id:'queued',originalName:'part.dxf',mimeType:'application/dxf',url:'blob:file',file_type:'cnc'}]);
  const doc=f.editor.getShape('shape:file');assert.equal(doc.parentId,'shape:cnc');
  assert.equal(doc.x,24*scale);assert.ok(Math.abs(doc.y-188*scale)<1e-7);assert.equal(doc.props.w,360*scale);
  assert.equal(readOrderCanvasScale(doc),scale);assert.equal(doc.meta.retained,'keep');
 });
 it('syncs new files into a rotated scaled pocket using local dimensions and ignores locked destinations',()=>{
  const f=fixture(),scale=defaultOrderCanvasScale(DEFAULT_CAD_SETTINGS);
  f.editor.createShape({id:'shape:cnc',type:'frame',x:1200,y:2300,rotation:Math.PI/3,props:{w:800*scale,h:500*scale},meta:{omsFilePocket:'cnc',[ORDER_CANVAS_SCALE_META_KEY]:scale}});
  const attachment={id:'queued',originalName:'part.dxf',mimeType:'application/dxf',url:'blob:file',file_type:'cnc' as const};
  syncCreationFileDocuments(f.editor,[attachment]);
  const doc=f.editor.getCurrentPageShapesSorted().find((s:any)=>s.type==='document');
  assert.equal(doc.parentId,'shape:cnc');assert.equal(doc.x,24*scale);assert.ok(Math.abs(doc.y-188*scale)<1e-7);
  f.editor.updateShape({id:'shape:cnc',isLocked:true});syncCreationFileDocuments(f.editor,[{...attachment,id:'second'}]);
  assert.equal(f.shapes.size,2);
 });
});
