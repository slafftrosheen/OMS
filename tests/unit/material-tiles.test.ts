import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixture } from '../helpers/cad-editor';
import { nodeAt, mapContours } from '../../src/lib/components/canvas/cad-curves';
import { VECTOR_DEFAULT_PAINT, type VectorPath } from '../../src/lib/components/canvas/cad-paint';
import { validAppearance, transformAppearance } from '../../src/lib/components/canvas/cad-appearance';
import { rasterTileMatrices } from '../../src/lib/components/canvas/cad-raster-tiles';
import { prepareMaterialTexture, applyMaterialTexture, getMaterialTextureDraft, removeMaterialTexture } from '../../src/lib/components/canvas/material-texture';
import { DEFAULT_CAD_SETTINGS, cadMmPerPixel, type CadSettings } from '../../src/lib/components/canvas/cad-settings';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { prepareVectorExport, serializeVectorDocument } from '../../src/lib/components/canvas/cad-vector-export';
import { prepareVectorExportWithAssets } from '../../src/lib/components/canvas/cad-vector-export-client';
import { VectorArtwork } from '../../src/lib/components/canvas/VectorArtwork';
const {createCanvas,loadImage}=createRequire(resolve('package.json'))('@napi-rs/canvas');
const near=(a:number,b:number,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const rect=(x=0,y=0,w=200,h=100)=>({closed:true,nodes:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}].map(nodeAt)});
const colors=[[255,0,0],[0,255,0],[0,0,255],[255,255,0]];
function image(){const c=createCanvas(2,2),ctx=c.getContext('2d'),data=ctx.createImageData(2,2);data.data.set(colors.flatMap(c=>[...c,255]));ctx.putImageData(data,0,0);return {width:2,height:2,png:c.toDataURL('image/png'),rgb:deflateSync(new Uint8Array(colors.flat())).toString('base64'),usage:'material' as const,repeat:true as const,matrix:[20,0,0,20,0,0] as [number,number,number,number,number,number]};}
const tile={mode:'tile' as const,tileWidthMm:20,offsetXmm:7,offsetYmm:-3,scale:100,angle:30,opacity:100};
function drawing(settings:CadSettings=DEFAULT_CAD_SETTINGS){const f=fixture(),factor=cadMmPerPixel(settings);f.editor.updatePage({meta:{omsCad:settings}});f.editor.createShape({id:'shape:part',type:'cad-bezier',props:{contours:mapContours([rect(),rect(75,35,50,30)],p=>({x:p.x/factor,y:p.y/factor})),fillRule:'evenodd'},meta:{omsVectorPaint:{...VECTOR_DEFAULT_PAINT,stroke:'none'}}});f.editor.setSelectedShapes(['shape:part']);return f;}
function path():VectorPath{return {contours:[rect(),rect(75,35,50,30)],fillRule:'evenodd',paint:{...VECTOR_DEFAULT_PAINT,stroke:'none',raster:image()}};}
async function pixels(text:string,format:'pdf'|'eps') {const dir=mkdtempSync(join(tmpdir(),'oms-tiles-'));try{writeFileSync(join(dir,'in.'+format),text);execFileSync('gs',['-dSAFER','-dBATCH','-dNOPAUSE','-dQUIET','-dEPSCrop','-sDEVICE=png16m','-r72','-sOutputFile='+join(dir,'out.png'),join(dir,'in.'+format)],{timeout:10000});const img=await loadImage(readFileSync(join(dir,'out.png'))),c=createCanvas(img.width,img.height),ctx=c.getContext('2d');ctx.drawImage(img,0,0);return (x:number,y:number)=>Array.from(ctx.getImageData(x,y,1,1).data).slice(0,3);}finally{rmSync(dir,{recursive:true,force:true});}}

describe('physical material tiles',()=>{
  it('keeps millimetre size and offsets at different document scales and display units',()=>{
    let reference:number[]|undefined;
    for(const s of [DEFAULT_CAD_SETTINGS,{...DEFAULT_CAD_SETTINGS,unit:'in' as const,scale:10},{...DEFAULT_CAD_SETTINGS,unit:'cm' as const,scale:.5}]){
      const f=drawing(s),plan=prepareMaterialTexture(f.editor,{raster:image()},tile),m=plan.paint.raster!.matrix,factor=cadMmPerPixel(s);
      near(Math.hypot(m[0],m[1])*factor,20);near(Math.hypot(m[2],m[3])*factor,20);
      near((m[4]+(m[0]+m[2])/2)*factor,107);near((m[5]+(m[1]+m[3])/2)*factor,53);
      assert.ok(plan.tileCount!>50);const physical=m.map(v=>v*factor);if(reference)physical.forEach((v,i)=>near(v,reference![i]));else reference=physical;
      const before=buildCadDxf(f.editor,'selected',s).text;assert.equal(applyMaterialTexture(f.editor,plan),true);assert.equal(buildCadDxf(f.editor,'selected',s).text,before);
      const restored=getMaterialTextureDraft(f.editor)!;near(restored.tileWidthMm!,20);near(restored.offsetXmm!,7);near(restored.offsetYmm!,-3);near(restored.angle,30);assert.equal(restored.mode,'tile');
      assert.equal(removeMaterialTexture(f.editor),true);assert.equal(buildCadDxf(f.editor,'selected',s).text,before);
    }
  });
  it('computes tight tile-space bounds for rotated paths and rejects excessive density before mutation',()=>{
    const p=path(),r=p.paint.raster!;assert.equal(rasterTileMatrices(r,p.contours).length,50);
    const angle=.6,m=[Math.cos(angle),Math.sin(angle),-Math.sin(angle),Math.cos(angle),100,90] as [number,number,number,number,number,number];
    const paint=transformAppearance(p.paint,m),contours=mapContours(p.contours,q=>({x:m[0]*q.x+m[2]*q.y+m[4],y:m[1]*q.x+m[3]*q.y+m[5]}));assert.equal(rasterTileMatrices(paint.raster!,contours).length,50);
    const f=drawing();assert.throws(()=>prepareMaterialTexture(f.editor,{raster:image()},{...tile,tileWidthMm:.01}),/material-tiles/);assert.equal(f.marks.length,0);
    for(const patch of [{tileWidthMm:0},{tileWidthMm:Infinity},{offsetXmm:NaN},{offsetYmm:1e7}])assert.throws(()=>prepareMaterialTexture(f.editor,{raster:image()},{...tile,...patch}),/geometry/);
    f.editor.updatePage({meta:{}});assert.throws(()=>prepareMaterialTexture(f.editor,{raster:image()},tile),/settings/);
  });
  it('derives saved physical mapping from current scale and edited contour bounds',()=>{
    const f=drawing();applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,{raster:image()},tile));
    f.editor.updatePage({meta:{omsCad:{...DEFAULT_CAD_SETTINGS,scale:2}}});
    const scaled=getMaterialTextureDraft(f.editor)!;near(scaled.tileWidthMm!,40);near(scaled.offsetXmm!,14);near(scaled.offsetYmm!,-6);
    const shape=f.only(),contours=structuredClone(shape.props.contours);contours[0].nodes[1].x+=100;
    f.editor.updateShape({id:shape.id,type:shape.type,props:{...shape.props,contours}});
    const edited=getMaterialTextureDraft(f.editor)!;near(edited.tileWidthMm!,40);near(edited.offsetXmm!,14-100*cadMmPerPixel(DEFAULT_CAD_SETTINGS));
    const matrix=shape.meta.omsVectorPaint.raster.matrix;
    const reviewed=prepareMaterialTexture(f.editor,edited.draft,edited);reviewed.paint.raster!.matrix.forEach((v,i)=>near(v,matrix[i]));
  });
  it('switches back to cover without retaining repeat metadata and rejects stale tile reviews',()=>{
    const f=drawing(),plan=prepareMaterialTexture(f.editor,{raster:image()},tile);assert.equal(applyMaterialTexture(f.editor,plan),true);
    const draft=getMaterialTextureDraft(f.editor)!;assert.equal(applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,draft.draft,{scale:100,angle:0,opacity:100,mode:'cover'})),true);assert.equal(f.only().meta.omsVectorPaint.raster.repeat,undefined);
    const next=prepareMaterialTexture(f.editor,{raster:image()},tile);f.editor.updatePage({meta:{omsCad:{...DEFAULT_CAD_SETTINGS,scale:10}}});assert.equal(applyMaterialTexture(f.editor,next),false);
  });
  it('limits repeat metadata to material rasters and uses one transformed SVG pattern with holes',()=>{
    const p=path();assert.equal(validAppearance(p.paint),true);assert.equal(validAppearance({raster:{...image(),usage:undefined}}),false);assert.equal(validAppearance({raster:{...image(),repeat:false}} as any),false);
    const svg=renderToStaticMarkup(React.createElement('svg',null,React.createElement(VectorArtwork,{id:'tiles',...p})));assert.equal((svg.match(/<image/g)||[]).length,1);assert.match(svg,/<pattern/);assert.match(svg,/patternTransform="matrix\(20 0 0 20 0 0\)"/);assert.match(svg,/fill-rule="evenodd"/);
  });
});
describe('repeated material visual export',()=>{
  for(const format of ['pdf','eps'] as const)it(`renders repeated colors and holes in ${format} while storing the image only once`,async()=>{
    const p=path(),text=serializeVectorDocument([p],format),pixel=await pixels(text,format);
    for(const [x,y,color] of [[5,5,0],[15,5,1],[5,15,2],[15,15,3],[25,25,0],[195,95,3]] as const)assert.deepEqual(pixel(x,y),colors[color]);assert.deepEqual(pixel(85,45),[255,255,255]);
    assert.equal((text.match(format==='pdf'?/\/Subtype \/Image/g:/\/ReusableStreamDecode filter/g)||[]).length,1);
    assert.equal((text.match(format==='pdf'?/\/Im0 Do/g:/0 setfileposition/g)||[]).length,50);
    assert.ok(text.length<15000);
  });
  for(const format of ['pdf','eps'] as const)it(`preserves rotated and shifted tile placement in ${format}`,async()=>{
    const p=path(),t=.37,w=24,h=18;p.paint.raster!.matrix=[w*Math.cos(t),w*Math.sin(t),-h*Math.sin(t),h*Math.cos(t),7,-3];
    const pixel=await pixels(serializeVectorDocument([p],format),format),[a,b,c,d,e,f]=p.paint.raster!.matrix,det=a*d-b*c;
    for(const [x,y] of [[13,13],[47,23],[147,83],[183,57]]){const u=(d*(x+.5-.01-e)-c*(y+.5-.01-f))/det,v=(-b*(x+.5-.01-e)+a*(y+.5-.01-f))/det;const sx=((u%1)+1)%1,sy=((v%1)+1)%1;assert.deepEqual(pixel(x,y),colors[(sy<.5?0:2)+(sx<.5?0:1)]);}
  });
  it('retains tile and manufacturing metadata when hydrating a private image for PDF/EPS',async()=>{
    const original={fetch:globalThis.fetch,bitmap:globalThis.createImageBitmap,document:globalThis.document};
    const r=image(),bytes=Buffer.from(r.png.slice(22),'base64'),id='12345678-1234-4234-8234-123456789abc';
    globalThis.document={createElement:()=>createCanvas(1,1)} as any;globalThis.fetch=(async()=>new Response(bytes,{headers:{'Content-Type':'image/png'}})) as any;
    globalThis.createImageBitmap=(async()=>{const image=await loadImage(bytes);image.close=()=>{};return image;}) as any;
    try{const f=drawing(),draft={raster:{width:2,height:2,external:true,fileId:id,hasAlpha:false,png:`/api/files/${id}/download`}};assert.equal(applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,draft,tile)),true);const before=JSON.stringify(f.only());
      for(const format of ['pdf','eps'] as const){const out=await prepareVectorExportWithAssets(f.editor,DEFAULT_CAD_SETTINGS,'selected',format,new AbortController().signal);assert.equal(out.omitted.length,0);assert.equal(out.paths[0].paint.raster!.repeat,true);assert.equal(out.paths[0].paint.raster!.usage,'material');assert.ok(out.text.length);}
      assert.equal(JSON.stringify(f.only()),before);
    }finally{globalThis.fetch=original.fetch;globalThis.createImageBitmap=original.bitmap;globalThis.document=original.document;}
  });
  it('reports EPS transparency and rejects excessive stored repeat counts instead of dropping tiles',()=>{
    const f=drawing();applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,{raster:image()},{...tile,opacity:50}));assert.equal(prepareVectorExport(f.editor,DEFAULT_CAD_SETTINGS,'selected','eps').omitted.length,1);
    const p=path();p.paint.raster!.matrix=[.001,0,0,.001,0,0];assert.throws(()=>serializeVectorDocument([p],'pdf'),/material-tiles/);assert.throws(()=>serializeVectorDocument([p],'eps'),/material-tiles/);
  });
});
