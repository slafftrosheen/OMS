import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixture } from '../helpers/cad-editor';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { VECTOR_DEFAULT_PAINT } from '../../src/lib/components/canvas/cad-paint';
import { validAppearance } from '../../src/lib/components/canvas/cad-appearance';
import { prepareMaterialTexture, applyMaterialTexture, removeMaterialTexture, materialTextureSelection, getMaterialTextureDraft, readMaterialTexture } from '../../src/lib/components/canvas/material-texture';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { measureCadSelection } from '../../src/lib/components/canvas/cad-measurements';
import { prepareVectorExport } from '../../src/lib/components/canvas/cad-vector-export';
import { VectorArtwork } from '../../src/lib/components/canvas/VectorArtwork';
const {createCanvas,loadImage}=createRequire(resolve('package.json'))('@napi-rs/canvas');
const rect=(x=0,y=0,w=200,h=100)=>({closed:true,nodes:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}].map(nodeAt)});
function image(){const c=createCanvas(2,2),ctx=c.getContext('2d');ctx.fillStyle='#ab571e';ctx.fillRect(0,0,2,2);return {raster:{width:2,height:2,png:c.toDataURL('image/png'),rgb:deflateSync(new Uint8Array([171,87,30,171,87,30,171,87,30,171,87,30])).toString('base64')}};}
const settings={scale:100,angle:0,opacity:100};
function drawing(){const f=fixture();const update=f.editor.updateShape;f.editor.updateShape=(patch:any)=>update({...patch,...(patch.meta?{meta:{...f.shapes.get(patch.id)?.meta,...patch.meta}}:{})});f.editor.createShape({id:'shape:curve',type:'cad-bezier',x:15,y:23,rotation:.2,props:{contours:[rect(),rect(50,25,50,50)],fillRule:'evenodd'},meta:{custom:'keep',omsVectorPaint:{...VECTOR_DEFAULT_PAINT,fill:'#ffffff'}}});f.editor.setSelectedShapes(['shape:curve']);return f;}

describe('material fill geometry and manufacturing',()=>{
  it('preserves all geometry, holes, measurements and DXF byte for byte through apply and clear',()=>{
    const f=drawing(),before=structuredClone(f.only()),dxf=buildCadDxf(f.editor,'selected',DEFAULT_CAD_SETTINGS).text,measurement=measureCadSelection(f.editor,DEFAULT_CAD_SETTINGS);
    const plan=prepareMaterialTexture(f.editor,image(),{scale:130,angle:37,opacity:75});assert.equal(applyMaterialTexture(f.editor,plan),true);
    assert.deepEqual(f.only().props,before.props);assert.equal(f.only().rotation,before.rotation);assert.equal(f.only().meta.custom,'keep');assert.equal(buildCadDxf(f.editor,'selected',DEFAULT_CAD_SETTINGS).text,dxf);assert.deepEqual(measureCadSelection(f.editor,DEFAULT_CAD_SETTINGS),measurement);
    assert.equal(f.marks.length,2);assert.equal(materialTextureSelection(f.editor)!.hasTexture,true);
    const saved=JSON.parse(JSON.stringify(f.only()));f.shapes.set(saved.id,saved);assert.equal(getMaterialTextureDraft(f.editor)!.angle,37);assert.equal(getMaterialTextureDraft(f.editor)!.scale,130);
    assert.equal(removeMaterialTexture(f.editor),true);assert.equal(f.only().meta.omsVectorPaint.raster,undefined);assert.equal(f.only().meta.omsMaterialTexture,null);assert.deepEqual(f.only().props,before.props);assert.equal(buildCadDxf(f.editor,'selected',DEFAULT_CAD_SETTINGS).text,dxf);
    f.editor.bailToMark(f.marks[0].id);assert.deepEqual(f.only(),before);
  });
  it('covers every bounds corner for varied aspect ratios and rotations without stretching',()=>{
    const f=drawing();for(const [width,height] of [[2,2],[1,4],[8,1]])for(const angle of [0,30,90,153,-270])for(const scale of [100,200]){
      const draft=image();draft.raster.width=width;draft.raster.height=height;
      const p=prepareMaterialTexture(f.editor,draft,{scale,angle,opacity:100}),[a,b,c,d,e,g]=p.paint.raster!.matrix,det=a*d-b*c;
      assert.ok(Math.abs(Math.hypot(a,b)/width-Math.hypot(c,d)/height)<1e-8);
      for(const [x,y] of [[0,0],[200,0],[200,100],[0,100]]){const u=(d*(x-e)-c*(y-g))/det,v=(-b*(x-e)+a*(y-g))/det;assert.ok(u>=-1e-9&&u<=1+1e-9&&v>=-1e-9&&v<=1+1e-9,`${angle}: ${u},${v}`);}
    }
  });
  it('keeps contour clipping in SVG, embeds material pixels in PDF/EPS, and reports EPS transparency',()=>{
    const f=drawing(),p=prepareMaterialTexture(f.editor,image(),settings);assert.equal(applyMaterialTexture(f.editor,p),true);
    const svg=renderToStaticMarkup(React.createElement(VectorArtwork,{id:'texture',contours:p.contours,fillRule:p.fillRule,paint:p.paint}));assert.match(svg,/<clipPath/);assert.match(svg,/clip-rule="evenodd"/);assert.match(svg,/<image/);assert.match(svg,/data:image\/png/);
    for(const format of ['pdf','eps'] as const){const result=prepareVectorExport(f.editor,DEFAULT_CAD_SETTINGS,'selected',format);assert.equal(result.omitted.length,0);assert.equal(result.paths[0].paint.raster!.usage,'material');assert.match(result.text,format==='pdf'?/\/Subtype \/Image/:/\/ImageType 1/);}
    assert.equal(applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,image(),{...settings,opacity:50})),true);
    assert.equal(prepareVectorExport(f.editor,DEFAULT_CAD_SETTINGS,'selected','pdf').omitted.length,0);assert.equal(prepareVectorExport(f.editor,DEFAULT_CAD_SETTINGS,'selected','eps').omitted.length,1);
  });
  it('continues excluding imported raster page boundaries from CNC and measurement',()=>{
    const f=drawing();applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,image(),settings));delete f.only().meta.omsVectorPaint.raster.usage;
    assert.equal(materialTextureSelection(f.editor),null);assert.equal(buildCadDxf(f.editor,'selected',DEFAULT_CAD_SETTINGS).omitted.length,1);assert.equal(measureCadSelection(f.editor,DEFAULT_CAD_SETTINGS).omitted,1);
    assert.equal(validAppearance({raster:{...f.only().meta.omsVectorPaint.raster,usage:'unknown'}} as any),false);
  });
  it('refuses stale, protected, open, clipped, bound and failed updates without geometry changes',()=>{
    for(const fault of ['readonly','lock','frame','open','clip','binding','selection','geometry','failed']){
      const f=drawing(),plan=prepareMaterialTexture(f.editor,image(),settings);
      if(fault==='readonly')f.state.isReadonly=true;if(fault==='lock')f.only().isLocked=true;if(fault==='open')f.only().props.contours[0].closed=false;if(fault==='clip')f.only().mask=[];if(fault==='binding')f.state.bindings=[{}];if(fault==='selection')f.editor.selectNone();if(fault==='geometry')f.only().x++;
      if(fault==='frame'){f.editor.createShape({id:'shape:frame',type:'frame'});f.only().parentId='shape:frame';}if(fault==='failed')f.editor.updateShape=()=>{};
      const before=structuredClone([...f.shapes.values()]);assert.equal(applyMaterialTexture(f.editor,plan),false,fault);assert.deepEqual([...f.shapes.values()],before);assert.equal(f.marks.length,0);
    }
  });
  it('allows clearing a material from a full snapshot but blocks growing it past the save budget',()=>{
    const f=drawing();applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,image(),settings));f.editor.store={getStoreSnapshot:()=>({shapes:[...f.shapes.values()],padding:'x'.repeat(1_900_000)})};
    assert.equal(removeMaterialTexture(f.editor),true);assert.equal(f.only().meta.omsVectorPaint.raster,undefined);
    assert.equal(applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,image(),settings)),false);
  });
  it('rejects invalid settings and image metadata',()=>{
    const f=drawing();for(const patch of [{scale:99},{scale:2001},{angle:361},{opacity:-1},{opacity:101},{scale:NaN}])assert.throws(()=>prepareMaterialTexture(f.editor,image(),{...settings,...patch}),/geometry/);
    assert.throws(()=>prepareMaterialTexture(f.editor,{raster:{...image().raster,png:'https://example.com/texture.png'}},settings),/geometry/);
  });
});
describe('material image intake',()=>{
  it('reads original PNG pixels with alpha and closes decoded resources',async()=>{
    const doc=globalThis.document,decode=globalThis.createImageBitmap;let closed=0;
    globalThis.document={createElement:()=>createCanvas(1,1)} as any;
    globalThis.createImageBitmap=(async(blob:Blob)=>{const bitmap=await loadImage(Buffer.from(await blob.arrayBuffer()));bitmap.close=()=>closed++;return bitmap;}) as any;
    try{const f=drawing(),canvas=createCanvas(1200,2);canvas.getContext('2d').fillRect(0,0,600,2);const file=new File([canvas.toBuffer('image/png')],'wood.png',{type:'image/png'});const draft=await readMaterialTexture(f.editor,file,new AbortController().signal);assert.equal(draft.raster.width,1200);assert.equal(draft.raster.height,2);assert.ok(draft.raster.alpha);assert.equal(draft.raster.usage,'material');assert.equal(closed,1);
      const aborted=new AbortController();aborted.abort();await assert.rejects(readMaterialTexture(f.editor,file,aborted.signal),/cancelled/);await assert.rejects(readMaterialTexture(f.editor,new File(['bad'],'bad.svg',{type:'image/svg+xml'}),new AbortController().signal),/material-image/);
    }finally{globalThis.document=doc;globalThis.createImageBitmap=decode;}
  });
});
