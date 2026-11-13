import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import type { TLShapeId } from '@tldraw/tldraw';
import { fixture } from '../helpers/cad-editor';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';
import { VECTOR_DEFAULT_PAINT } from '../../src/lib/components/canvas/cad-paint';
import { validAppearance } from '../../src/lib/components/canvas/cad-appearance';
import { MATERIAL_TEXTURE_PRESETS, createMaterialPresetImage, sampleMaterialPreset, readMaterialPreset } from '../../src/lib/components/canvas/material-presets';
import { drawingMaterialOptions, readDrawingMaterial } from '../../src/lib/components/canvas/material-library';
import { prepareMaterialTexture, applyMaterialTexture, getMaterialTextureDraft } from '../../src/lib/components/canvas/material-texture';
import { prepareVectorExport } from '../../src/lib/components/canvas/cad-vector-export';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';
const {createCanvas}=createRequire(resolve('package.json'))('@napi-rs/canvas');
const rect=(x=0,y=0,w=300,h=150)=>({closed:true,nodes:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}].map(nodeAt)});
function drawing(){const f=fixture();f.editor.updatePage({meta:{omsCad:DEFAULT_CAD_SETTINGS}});for(const id of ['source','target'])f.editor.createShape({id:`shape:${id}`,type:'cad-bezier',x:id==='target'?400:0,props:{contours:[rect(),rect(50,30,100,70)],fillRule:'evenodd'},meta:{omsObjectName:id,omsVectorPaint:{...VECTOR_DEFAULT_PAINT,fill:'#eeeeee'}}});f.editor.setSelectedShapes(['shape:source']);return f;}
async function withCanvas(fn:()=>Promise<void>){const saved={document:globalThis.document,fetch:globalThis.fetch};globalThis.document={createElement:()=>createCanvas(1,1)} as any;globalThis.fetch=(async()=>{throw new Error('network must not be used');}) as any;try{await fn();}finally{globalThis.document=saved.document;globalThis.fetch=saved.fetch;}}

describe('portable built-in material finishes',()=>{
  for(const preset of MATERIAL_TEXTURE_PRESETS)it(`creates deterministic periodic ${preset.id} pixels and exports a real editable fill`,()=>withCanvas(async()=>{
    const image=createMaterialPresetImage(preset.id);assert.equal(image.width,256);assert.equal(image.height,256);assert.equal(image.data.length,256*256*3);assert.deepEqual(image.data,createMaterialPresetImage(preset.id).data);
    assert.ok(new Set(image.data).size>20);
    for(const [u,v] of [[0,0],[0,.21],[.73,0],[.17,.29],[.83,.91]]){assert.deepEqual(sampleMaterialPreset(preset.id,u,v),sampleMaterialPreset(preset.id,u+1,v-2));assert.deepEqual(sampleMaterialPreset(preset.id,0,v),sampleMaterialPreset(preset.id,1,v));assert.deepEqual(sampleMaterialPreset(preset.id,u,0),sampleMaterialPreset(preset.id,u,1));}
    const material=await readMaterialPreset(preset.id,new AbortController().signal);assert.equal(material.mode,'tile');assert.equal(material.tileWidthMm,preset.tileWidthMm);assert.equal(material.draft.raster.external,undefined);assert.ok(JSON.stringify(material).length<350000);assert.deepEqual(new Uint8Array(inflateSync(Buffer.from(material.draft.raster.rgb!,'base64'))),image.data);
    const f=drawing(),before=JSON.stringify(f.only().props),dxf=buildCadDxf(f.editor,'selected',DEFAULT_CAD_SETTINGS).text;
    assert.equal(applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,material.draft,material)),true);assert.equal(validAppearance(f.only().meta.omsVectorPaint),true);assert.equal(JSON.stringify(f.only().props),before);assert.equal(buildCadDxf(f.editor,'selected',DEFAULT_CAD_SETTINGS).text,dxf);
    for(const format of ['pdf','eps'] as const){const out=prepareVectorExport(f.editor,DEFAULT_CAD_SETTINGS,'selected',format);assert.equal(out.omitted.length,0);assert.equal(out.paths[0].paint.raster!.repeat,true);assert.ok(out.text.length>1000);}
    const saved=JSON.parse(JSON.stringify(f.only()));f.shapes.set(saved.id,saved);assert.equal(getMaterialTextureDraft(f.editor)!.draft.raster.png,material.draft.raster.png);
  }));
  it('rejects unknown materials and cancellation without producing a draft',()=>withCanvas(async()=>{
    assert.throws(()=>createMaterialPresetImage('unknown' as any),/material-preset/);assert.throws(()=>sampleMaterialPreset('oak',NaN,0),/material-preset/);
    await assert.rejects(readMaterialPreset('unknown' as any,new AbortController().signal),/material-preset/);
    const aborted=new AbortController();aborted.abort();await assert.rejects(readMaterialPreset('oak',aborted.signal),/cancelled/);
    const during=new AbortController(),pending=readMaterialPreset('concrete',during.signal);during.abort();await assert.rejects(pending,/cancelled/);
  }));
});
describe('reuse materials from the current drawing',()=>{
  it('reads locked sources without selecting, editing, or uploading and centers the target mapping',()=>withCanvas(async()=>{
    const f=drawing(),material=await readMaterialPreset('oak',new AbortController().signal);
    applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,material.draft,{...material,angle:37,offsetXmm:13,offsetYmm:-7,opacity:66}));
    const source=f.only();source.isLocked=true;f.editor.setSelectedShapes(['shape:target']);const sourceBefore=JSON.stringify(source),marks=f.marks.length;
    assert.deepEqual(drawingMaterialOptions(f.editor).map(s=>s.name),['source']);
    const reuse=readDrawingMaterial(f.editor,'shape:source' as TLShapeId)!;assert.equal(reuse.offsetXmm,0);assert.equal(reuse.offsetYmm,0);assert.ok(Math.abs(reuse.angle-37)<1e-8);assert.equal(reuse.opacity,66);assert.ok(Math.abs(reuse.tileWidthMm!-120)<1e-8);assert.equal(f.marks.length,marks);assert.equal(f.only().id,'shape:target');
    const before=JSON.stringify(f.only().props);assert.equal(applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,reuse.draft,reuse)),true);assert.equal(JSON.stringify(f.only().props),before);assert.equal(JSON.stringify(source),sourceBefore);assert.equal(f.only().meta.omsVectorPaint.raster.png,source.meta.omsVectorPaint.raster.png);
    reuse.draft.raster.width=2;assert.equal(source.meta.omsVectorPaint.raster.width,256);
  }));
  it('preserves private references, lists only this page and rejects removed or invalid source objects',()=>withCanvas(async()=>{
    const f=drawing(),material=await readMaterialPreset('aluminium',new AbortController().signal);applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,material.draft,material));
    const source=f.only(),id='12345678-1234-4234-8234-123456789abc';source.meta.omsVectorPaint.raster={...source.meta.omsVectorPaint.raster,external:true,png:`/api/files/${id}/download`,fileId:id,hasAlpha:false};delete source.meta.omsVectorPaint.raster.rgb;
    f.editor.setSelectedShapes(['shape:target']);const reuse=readDrawingMaterial(f.editor,source.id)!;assert.equal(reuse.draft.raster.fileId,id);assert.equal(reuse.draft.raster.external,true);assert.equal(reuse.draft.raster.rgb,undefined);
    const getIds=f.editor.getCurrentPageShapeIds,getSorted=f.editor.getCurrentPageShapesSorted;f.editor.getCurrentPageShapeIds=()=>new Set(['shape:target']);f.editor.getCurrentPageShapesSorted=()=>[f.only()];assert.equal(readDrawingMaterial(f.editor,source.id),null);assert.equal(drawingMaterialOptions(f.editor).length,0);f.editor.getCurrentPageShapeIds=getIds;f.editor.getCurrentPageShapesSorted=getSorted;
    source.meta.omsVectorPaint.raster.png='https://untrusted.invalid/image.png';assert.equal(readDrawingMaterial(f.editor,source.id),null);assert.equal(drawingMaterialOptions(f.editor).length,0);
    f.shapes.delete(source.id);assert.equal(readDrawingMaterial(f.editor,source.id),null);
  }));
  it('reads without mutation in read-only mode but retains target write protection',()=>withCanvas(async()=>{
    const f=drawing(),material=await readMaterialPreset('carbon',new AbortController().signal);applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,material.draft,material));f.editor.setSelectedShapes(['shape:target']);const reuse=readDrawingMaterial(f.editor,'shape:source' as TLShapeId)!;const plan=prepareMaterialTexture(f.editor,reuse.draft,reuse);f.state.isReadonly=true;
    assert.equal(drawingMaterialOptions(f.editor).length,1);assert.ok(readDrawingMaterial(f.editor,'shape:source' as TLShapeId));assert.equal(applyMaterialTexture(f.editor,plan),false);
  }));
});
