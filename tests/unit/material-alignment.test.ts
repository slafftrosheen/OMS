import { describe, it } from 'vitest';
import type { TLShapeId } from '@tldraw/tldraw';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { fixture } from '../helpers/cad-editor';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { VECTOR_DEFAULT_PAINT } from '../../src/lib/components/canvas/cad-paint';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';
import { prepareMaterialTexture, applyMaterialTexture } from '../../src/lib/components/canvas/material-texture';
import { materialAlignmentSelection, prepareMaterialAlignment, applyMaterialAlignment } from '../../src/lib/components/canvas/material-alignment';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { prepareVectorExport } from '../../src/lib/components/canvas/cad-vector-export';
import { prepareCreationCanvas } from '../../src/lib/order/creation-canvas';
const {createCanvas}=createRequire(resolve('package.json'))('@napi-rs/canvas');
const rect=(x=0,y=0,w=100,h=80)=>({closed:true,nodes:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}].map(nodeAt)});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function drawing(){
  const f=fixture(),update=f.editor.updateShape;
  f.editor.updateShape=(patch:any)=>update({...patch,...(patch.meta?{meta:{...f.shapes.get(patch.id)?.meta,...patch.meta}}:{})});
  f.editor.updatePage({meta:{omsCad:DEFAULT_CAD_SETTINGS}});
  for(const [id,x,y,rotation] of [['a',10,20,.3],['b',120,25,-.6],['c',230,40,1.2]] as const)
    f.editor.createShape({id:`shape:${id}`,type:'cad-bezier',x,y,rotation,props:{contours:[rect(),rect(30,25,40,30)],fillRule:'evenodd'},meta:{custom:id,omsVectorPaint:{...VECTOR_DEFAULT_PAINT,fill:'#ffffff',stroke:id==='b'?'#ff0000':'#000000',strokeWidth:2,dash:[3,2]}}});
  const c=createCanvas(2,2);c.getContext('2d').fillRect(0,0,2,2);
  const draft={raster:{width:2,height:2,png:c.toDataURL('image/png'),rgb:deflateSync(new Uint8Array(12)).toString('base64')}};
  f.editor.setSelectedShapes(['shape:a']);applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,draft,{mode:'tile',tileWidthMm:17,offsetXmm:3,offsetYmm:-2,scale:100,angle:29,opacity:100}));
  f.editor.setSelectedShapes(['shape:a','shape:b','shape:c']);f.marks.length=0;
  return f;
}
function worldMatrix(f:ReturnType<typeof drawing>,id:string){const s=f.shapes.get(id),m=s.meta.omsVectorPaint.raster.matrix,t=f.editor.getShapePageTransform(s);const o=t.applyToPoint({x:m[4],y:m[5]}),x=t.applyToPoint({x:m[4]+m[0],y:m[5]+m[1]}),y=t.applyToPoint({x:m[4]+m[2],y:m[5]+m[3]});return [x.x-o.x,x.y-o.y,y.x-o.x,y.y-o.y,o.x,o.y];}

describe('continuous materials across selected objects',()=>{
  it('aligns rotated objects in page space, preserving strokes, geometry, source, metadata and cutting DXF',()=>{
    const f=drawing(),before=structuredClone([...f.shapes.values()]),dxf=buildCadDxf(f.editor,'selected',DEFAULT_CAD_SETTINGS).text;
    const info=materialAlignmentSelection(f.editor);assert.equal(info.count,3);assert.deepEqual(info.sources.map(s=>s.id),['shape:a']);
    const p=prepareMaterialAlignment(f.editor,'shape:a' as TLShapeId);assert.deepEqual(p.targetIds,['shape:b','shape:c']);assert.ok(p.tileCount>0);assert.equal(applyMaterialAlignment(f.editor,p),true);
    const expected=worldMatrix(f,'shape:a');for(const id of ['shape:b','shape:c'])worldMatrix(f,id).forEach((v,i)=>near(v,expected[i]));
    assert.deepEqual(f.shapes.get('shape:a'),before[0]);
    for(const original of before){const actual=f.shapes.get(original.id);assert.deepEqual(actual.props,original.props);for(const key of ['x','y','rotation','opacity','parentId'])assert.equal(actual[key],original[key]);assert.equal(actual.meta.custom,original.meta.custom);for(const key of ['stroke','strokeWidth','strokeOpacity','dash'])assert.deepEqual(actual.meta.omsVectorPaint[key],original.meta.omsVectorPaint[key]);}
    assert.equal(buildCadDxf(f.editor,'selected',DEFAULT_CAD_SETTINGS).text,dxf);assert.equal(f.marks.length,2);
    f.editor.bailToMark(f.marks[0].id);assert.deepEqual([...f.shapes.values()],before);
  });
  it('aligns through nested rotated groups and preserves inherited opacity in the review',()=>{
    const f=drawing();f.editor.createShape({id:'shape:group1',type:'group',x:30,y:70,rotation:.7,opacity:.5});f.editor.createShape({id:'shape:group2',type:'group',parentId:'shape:group1',x:25,y:30,rotation:-.9,opacity:.5});
    f.editor.updateShape({id:'shape:b',parentId:'shape:group2',opacity:.5});
    const plan=prepareMaterialAlignment(f.editor,'shape:a' as TLShapeId);near(plan.paths[1].paint.fillOpacity,.125);assert.equal(applyMaterialAlignment(f.editor,plan),true);
    worldMatrix(f,'shape:b').forEach((v,i)=>near(v,worldMatrix(f,'shape:a')[i]));
  });
  it('replaces target gradient and old material options, preserving target outline and source alpha',()=>{
    const f=drawing(),a=f.shapes.get('shape:a');a.meta.omsVectorPaint.fillOpacity=.6;a.meta.omsVectorPaint.raster.alpha=deflateSync(new Uint8Array([128,255,255,128])).toString('base64');
    const b=f.shapes.get('shape:b');b.meta.omsMaterialTexture={mode:'cover',scale:800,angle:133};b.meta.omsVectorPaint.gradient={type:'linear',matrix:[1,0,0,1,0,0],start:[0,0],end:[100,0],r0:0,r1:1,stops:[{offset:0,color:'#000000'},{offset:1,color:'#ffffff'}]};
    assert.equal(applyMaterialAlignment(f.editor,prepareMaterialAlignment(f.editor,'shape:a' as TLShapeId)),true);const changed=f.shapes.get('shape:b');assert.equal(changed.meta.omsMaterialTexture,null);assert.equal(changed.meta.omsVectorPaint.gradient,undefined);assert.equal(changed.meta.omsVectorPaint.fillOpacity,.6);assert.equal(changed.meta.omsVectorPaint.raster.alpha,a.meta.omsVectorPaint.raster.alpha);
  });
  it('survives JSON save/reload with matching PDF/EPS tile placement and unchanged source',()=>{
    const f=drawing();applyMaterialAlignment(f.editor,prepareMaterialAlignment(f.editor,'shape:a' as TLShapeId));
    const saved=JSON.parse(JSON.stringify([...f.shapes.values()]));f.shapes.clear();for(const shape of saved)f.shapes.set(shape.id,shape);
    for(const format of ['pdf','eps'] as const){const out=prepareVectorExport(f.editor,DEFAULT_CAD_SETTINGS,'selected',format);assert.equal(out.omitted.length,0);assert.equal(out.paths.length,3);const matrix=out.paths[0].paint.raster!.matrix;for(const p of out.paths)p.paint.raster!.matrix.forEach((v,i)=>near(v,matrix[i]));assert.ok(out.text.length>100);}
  });
  it('keeps one shared queued asset and remaps every copy on order save',()=>{
    const f=drawing(),a=f.shapes.get('shape:a');a.meta.omsVectorPaint.raster={width:2,height:2,external:true,fileId:'queued',png:'blob:https://oms.local/preview',hasAlpha:false,usage:'material',repeat:true,matrix:a.meta.omsVectorPaint.raster.matrix};
    assert.equal(applyMaterialAlignment(f.editor,prepareMaterialAlignment(f.editor,'shape:a' as TLShapeId)),true);
    const snapshot={document:{store:Object.fromEntries([...f.shapes].map(([id,s])=>[id,{...s,typeName:'shape'}]))}},id='12345678-1234-4234-8234-123456789abc';
    const saved=prepareCreationCanvas(snapshot,'local','saved',{queued:id},new Set(),'/oms');
    for(const shape of Object.values(saved.document.store) as any[]){assert.equal(shape.meta.omsVectorPaint.raster.fileId,id);assert.equal(shape.meta.omsVectorPaint.raster.png,`/oms/api/files/${id}/download`);assert.equal(shape.meta.omsVectorPaint.raster.repeat,true);assert.equal(shape.meta.omsVectorPaint.raster.usage,'material');}
    assert.equal(a.meta.omsVectorPaint.raster.fileId,'queued');
  });
  it('preflights total save budget and refuses growth without making partial changes',()=>{
    const f=drawing(),before=JSON.stringify([...f.shapes.values()]);f.editor.store={getStoreSnapshot:()=>({shapes:[...f.shapes.values()],padding:'x'.repeat(1_900_000)})};assert.throws(()=>prepareMaterialAlignment(f.editor,'shape:a' as TLShapeId),/save-limit/);assert.equal(JSON.stringify([...f.shapes.values()]),before);assert.equal(f.marks.length,0);
  });
  it('rolls back every target if a later update is ignored',()=>{
    const f=drawing(),before=structuredClone([...f.shapes.values()]),plan=prepareMaterialAlignment(f.editor,'shape:a' as TLShapeId),update=f.editor.updateShape;
    f.editor.updateShape=(patch:any)=>{if(patch.id!=='shape:c')update(patch);};assert.equal(applyMaterialAlignment(f.editor,plan),false);assert.deepEqual([...f.shapes.values()],before);assert.equal(f.marks.length,0);
  });
  for(const fault of ['selection','move','source','target','readonly','locked','ancestor','open','clip','binding','frame','settings','tamper'])it(`rejects ${fault} changes after review`,()=>{
    const f=drawing(),plan=prepareMaterialAlignment(f.editor,'shape:a' as TLShapeId);
    if(fault==='selection')f.editor.setSelectedShapes(['shape:a','shape:b']);if(fault==='move')f.shapes.get('shape:b').x++;
    if(fault==='source')f.shapes.get('shape:a').meta.omsVectorPaint.raster.matrix[4]++;
    if(fault==='target')f.shapes.get('shape:c').meta.custom='changed';if(fault==='readonly')f.state.isReadonly=true;if(fault==='locked')f.shapes.get('shape:b').isLocked=true;
    if(fault==='ancestor'){f.editor.createShape({id:'shape:g',type:'group',isLocked:true});f.shapes.get('shape:b').parentId='shape:g';}
    if(fault==='open')f.shapes.get('shape:b').props.contours[0].closed=false;if(fault==='clip')f.shapes.get('shape:b').mask=[];if(fault==='binding')f.state.bindings=[{}];
    if(fault==='frame'){f.editor.createShape({id:'shape:frame',type:'frame'});f.shapes.get('shape:b').parentId='shape:frame';}
    if(fault==='settings')f.editor.updatePage({meta:{omsCad:{...DEFAULT_CAD_SETTINGS,scale:10}}});if(fault==='tamper')plan.changes[0].paint.raster!.matrix[4]++;
    const before=structuredClone([...f.shapes.values()]);assert.equal(applyMaterialAlignment(f.editor,plan),false);assert.deepEqual([...f.shapes.values()],before);assert.equal(f.marks.length,0);
  });
  it('rejects unsupported selections, sources and density before allocating a plan',()=>{
    const f=drawing();assert.throws(()=>prepareMaterialAlignment(f.editor,'shape:b' as TLShapeId),/material-align-source/);
    delete f.shapes.get('shape:a').meta.omsVectorPaint.raster.repeat;assert.equal(materialAlignmentSelection(f.editor).error,'material-align-source');
    f.shapes.get('shape:a').meta.omsVectorPaint.raster.repeat=true;f.shapes.get('shape:b').props.contours[0].closed=false;assert.equal(materialAlignmentSelection(f.editor).error,'material-align-selection');
    f.shapes.get('shape:b').props.contours[0].closed=true;f.shapes.get('shape:a').meta.omsVectorPaint.raster.matrix=[.001,0,0,.001,0,0];assert.throws(()=>prepareMaterialAlignment(f.editor,'shape:a' as TLShapeId),/material-align-tiles/);
    f.editor.setSelectedShapes(Array.from({length:51},(_,i)=>`shape:${i}`));assert.equal(materialAlignmentSelection(f.editor).error,'material-align-limit');
  });
});
