import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import type {Editor,TLShape} from '@tldraw/tldraw';
import {applyDrawingSolidFill,drawingSolidFillSource} from '../../src/lib/components/canvas/drawing-solid-fill';
import {VECTOR_DEFAULT_PAINT} from '../../src/lib/components/canvas/cad-paint';

const node=(x:number,y:number)=>({x,y,inX:0,inY:0,outX:0,outY:0,mode:'corner'});
const contour={closed:true,nodes:[node(0,0),node(80,0),node(80,40),node(0,40)]};
const gradient={type:'linear',matrix:[1,0,0,1,0,0],start:[0,0],end:[80,0],r0:0,r1:1,stops:[{offset:0,color:'#123456'},{offset:1,color:'#abcdef'}]};
function artwork(type='cad-ellipse',props:Record<string,unknown>={w:80,h:40}){
 return {id:'shape:fill',type,x:30,y:40,rotation:0.3,opacity:0.5,isLocked:false,index:'a1',parentId:'page:test',
  props:{color:'black',...props},meta:{omsObjectName:'Original',fileId:'file:source',omsMaterialTexture:{mode:'tile'},omsVectorPaint:{
   ...VECTOR_DEFAULT_PAINT,fill:'#112233',stroke:'#aabbcc',strokeWidth:3,lineCap:'round',lineJoin:'bevel',dash:[4,2],dashOffset:1,fillOpacity:0.6,strokeOpacity:0.7,
   gradient,clips:[{contours:[contour],fillRule:'evenodd'}],
  }}} as unknown as TLShape;
}
function setup(initial=artwork()){
 const records=new Map<string,TLShape>([[initial.id,structuredClone(initial)]]),marks=new Map<string,TLShape[]>();
 let selected:string=initial.id,readonly=false,refuse=false,alter=false,before:TLShape[]=[];
 const editor={
  getOnlySelectedShape:()=>records.get(selected),getShape:(id:string)=>records.get(id),
  getShapeAndDescendantIds:(ids:string[])=>new Set(ids),
  getInstanceState:()=>({isReadonly:readonly}),
  isShapeOrAncestorLocked:(s:TLShape)=>s.isLocked||!!records.get(s.parentId)?.isLocked,
  store:{getStoreSnapshot:()=>[...records.values()]},
  mark:(name:string)=>{marks.set(name,structuredClone([...records.values()]));if(!name.endsWith('-complete'))before=structuredClone([...records.values()]);},
  run:(fn:()=>void)=>fn(),
  bailToMark:(name:string)=>{records.clear();for(const s of marks.get(name)??[])records.set(s.id,s);},
  updateShape:(patch:any)=>{if(refuse)return;const old=records.get(patch.id)!;records.set(patch.id,{...old,...patch,...(alter?{x:999}:{})});},
 } as unknown as Editor;
 return {editor,records,readonly:()=>{readonly=true;},select:(id:string)=>{selected=id;},
  refuse:()=>{refuse=true;},alter:()=>{alter=true;},marks,
  undo:()=>{records.clear();for(const s of before)records.set(s.id,s);}};
}
describe('solid CAD fill editor',()=>{
 it('accepts only one valid closed CAD source',()=>{
  for(const s of [artwork(),artwork('cad-path',{closed:true,points:[{x:0,y:0},{x:80,y:0},{x:80,y:40}]}),artwork('cad-bezier',{contours:[contour],fillRule:'evenodd'})])
   assert.ok(drawingSolidFillSource(setup(s).editor));
  for(const s of [artwork('cad-path',{closed:false,points:[{x:0,y:0},{x:80,y:0}]}),artwork('cad-bezier',{contours:[{...contour,closed:false}],fillRule:'evenodd'}),artwork('text',{text:'Order'})])
   assert.equal(drawingSolidFillSource(setup(s).editor),null);
 });
 it('replaces only fill appearance and preserves clipping, outline, source metadata and geometry; one undo restores all',()=>{
  const env=setup(),source=drawingSolidFillSource(env.editor)!,before=structuredClone(source.shape);
  assert.equal(applyDrawingSolidFill(env.editor,source.shape.id,source.signature,'#ff2200'),true);
  const after=env.editor.getShape(source.shape.id)!,paint=after.meta.omsVectorPaint as any,oldPaint=before.meta.omsVectorPaint as any;
  assert.equal(paint.fill,'#ff2200');assert.equal(paint.gradient,undefined);assert.equal(after.meta.omsMaterialTexture,null);
  for(const key of ['stroke','strokeWidth','lineCap','lineJoin','dash','dashOffset','strokeOpacity','fillOpacity','clips'])assert.deepEqual(paint[key],oldPaint[key]);
  assert.equal(after.meta.fileId,before.meta.fileId);assert.deepEqual({...after,meta:before.meta},before);
  assert.equal(env.marks.size,2);env.undo();assert.deepEqual(env.editor.getShape(source.shape.id),before);
 });
 it('supports removing fill without changing outlines or closing open paths',()=>{
  const env=setup(),s=drawingSolidFillSource(env.editor)!;
  assert.equal(applyDrawingSolidFill(env.editor,s.shape.id,s.signature,'none'),true);
  assert.equal((env.editor.getShape(s.shape.id)!.meta.omsVectorPaint as any).stroke,'#aabbcc');
  assert.equal((env.editor.getShape(s.shape.id)!.meta.omsVectorPaint as any).fill,'none');
 });
 it('rejects a changed source or a different selection before history mutation',()=>{
  const env=setup(),s=drawingSolidFillSource(env.editor)!;
  env.records.get(s.shape.id)!.x++;
  assert.equal(applyDrawingSolidFill(env.editor,s.shape.id,s.signature,'#ff2200'),false);
  env.select('shape:missing');
  assert.equal(applyDrawingSolidFill(env.editor,s.shape.id,s.signature,'#ff2200'),false);
  assert.equal(env.marks.size,0);
 });
 it('rejects read-only, locked and protected-parent edits',()=>{
  for(const kind of ['readonly','locked','locked-parent','form-parent']){
   const env=setup();if(kind==='readonly')env.readonly();
   if(kind==='locked')env.records.get('shape:fill')!.isLocked=true;
   if(kind.endsWith('parent')){
    const parent={...artwork(),id:'shape:parent',type:kind==='form-parent'?'order-details':'group',isLocked:kind==='locked-parent'} as TLShape;
    env.records.set(parent.id,parent);env.records.get('shape:fill')!.parentId=parent.id;
   }
   const s=drawingSolidFillSource(env.editor)!;
   assert.equal(applyDrawingSolidFill(env.editor,s.shape.id,s.signature,'#ff2200'),false);
   assert.equal(env.marks.size,0);
  }
 });
 it('does not replace malformed paint or accept unsafe colour values',()=>{
  const env=setup(),s=drawingSolidFillSource(env.editor)!;
  assert.equal(applyDrawingSolidFill(env.editor,s.shape.id,s.signature,'url(unsafe)'),false);
  env.records.get(s.shape.id)!.meta.omsVectorPaint={fill:'broken'};
  assert.equal(drawingSolidFillSource(env.editor),null);assert.equal(env.marks.size,0);
 });
 it('rolls back refused or unexpectedly altered native updates',()=>{
  for(const mode of ['refuse','alter'] as const){
   const env=setup(),s=drawingSolidFillSource(env.editor)!,before=structuredClone(s.shape);env[mode]();
   assert.equal(applyDrawingSolidFill(env.editor,s.shape.id,s.signature,'#ff2200'),false);
   assert.deepEqual(env.editor.getShape(s.shape.id),before);
  }
 });
 it('allows shrinking oversized artwork but refuses a fill that grows it further',()=>{
  const env=setup();env.records.get('shape:fill')!.meta.padding='x'.repeat(1_900_001);
  const s=drawingSolidFillSource(env.editor)!;
  assert.equal(applyDrawingSolidFill(env.editor,s.shape.id,s.signature,'#ff2200'),true);
  const second=env.records.get('shape:fill')!;delete second.meta.omsVectorPaint;delete second.meta.omsMaterialTexture;
  const small=drawingSolidFillSource(env.editor)!;
  assert.equal(applyDrawingSolidFill(env.editor,small.shape.id,small.signature,'#ff2200'),false);
 });
});
