import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import DxfParser from 'dxf-parser';
import {fixture} from '../helpers/cad-editor';
import {CadPolylineTool} from '../../src/lib/components/canvas/CadPolylineTool';
import {polylineSession,resolveCadDraftPoint} from '../../src/lib/components/canvas/cad-polyline-draft';
import {DEFAULT_CAD_SETTINGS,cadMmPerPixel,canvasPointToCad} from '../../src/lib/components/canvas/cad-settings';
import {buildCadDxf} from '../../src/lib/components/canvas/cad-dxf';
import {curveBounds} from '../../src/lib/components/canvas/cad-curves';
import {layoutCadText,prepareCadText,readCadFont,glyphRunContours,validateCadTextLayout} from '../../src/lib/components/canvas/cad-text';
import {applyCadPlan} from '../../src/lib/components/canvas/cad-plans';

const close=(a:number,b:number,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const settings={...DEFAULT_CAD_SETTINGS,scale:10,originX:300,originY:500};

describe('exact point entry during polyline drawing',()=>{
 it('resolves absolute, offset and polar input using the saved origin, unit and scale',()=>{
  const start=resolveCadDraftPoint('absolute',125,80,undefined,settings)!;
  const absolute=canvasPointToCad(start,settings);close(absolute.x,125);close(absolute.y,80);
  const offset=resolveCadDraftPoint('offset',30,-20,start,settings)!;const cad=canvasPointToCad(offset,settings);close(cad.x,155);close(cad.y,60);
  const polar=canvasPointToCad(resolveCadDraftPoint('polar',50,90,start,settings)!,settings);close(polar.x,125);close(polar.y,130);
  const inches={...settings,unit:'in' as const};const inch=resolveCadDraftPoint('polar',2,0,start,inches)!;close(inch.x-start.x,2*25.4/cadMmPerPixel(inches));
 });
 it('rejects incomplete, zero-length polar, missing-origin and oversized input without snapping numeric positions',()=>{
  assert.equal(resolveCadDraftPoint('offset',10,10,undefined,null),null);
  assert.equal(resolveCadDraftPoint('polar',0,0,{x:0,y:0},null),null);
  assert.equal(resolveCadDraftPoint('absolute',NaN,0,undefined,null),null);
  assert.equal(resolveCadDraftPoint('absolute',1e9,0,undefined,settings),null);
  assert.deepEqual(resolveCadDraftPoint('offset',3,4,{x:10,y:20},null),{x:13,y:16});
 });
 it('mixes pointer and typed segments, discards the pointer preview on Finish, and exports exact DXF coordinates',()=>{
  const f=fixture(),tool=new CadPolylineTool(f.editor,undefined as any);tool.onEnter();f.state.snap=true;
  const session=polylineSession(f.editor);f.editor.inputs.currentPagePoint=resolveCadDraftPoint('absolute',0,0,undefined,settings)!;
  tool.onPointerDown({button:0} as any);
  assert.equal(session.controller!.add(resolveCadDraftPoint('offset',100,0,session.state.get()!.points.at(-1),settings)!),true);
  assert.equal(session.controller!.add(resolveCadDraftPoint('polar',50,90,session.state.get()!.points.at(-1),settings)!),true);
  f.editor.inputs.currentPagePoint={x:999,y:999};tool.onPointerMove();assert.equal(f.editor.getCurrentPageShapesSorted()[0].props.points.length,4);
  assert.equal(session.controller!.finish(false),true);assert.equal(session.state.get(),null);assert.equal(session.controller,null);
  const shape=f.editor.getOnlySelectedShape();assert.equal(shape.props.points.length,3);assert.equal(shape.props.closed,false);
  const parsed=new DxfParser().parseSync(buildCadDxf(f.editor,'selected',settings).text)!;const vertices=(parsed.entities[0] as any).vertices;
  for(const [i,[x,y]] of [[0,0],[100,0],[100,50]].entries()){close(vertices[i].x,x);close(vertices[i].y,y);}
 });
 it('removes points, closes an explicit return to the start without a duplicate seam, and cancels atomically',()=>{
  const f=fixture(),tool=new CadPolylineTool(f.editor,undefined as any);tool.onEnter();const session=polylineSession(f.editor);
  for(const point of [{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:20,y:20}])assert.equal(session.controller!.add(point),true);
  session.controller!.back();assert.equal(session.state.get()!.points.length,3);
  session.controller!.add({x:0,y:0});session.controller!.finish(true);
  assert.equal(f.editor.getOnlySelectedShape().props.closed,true);assert.equal(f.editor.getOnlySelectedShape().props.points.length,3);
  tool.onEnter();session.controller!.add({x:200,y:200});session.controller!.add({x:210,y:200});session.controller!.cancel();assert.equal(f.shapes.size,1);assert.equal(session.state.get(),null);
 });
 it('refuses duplicate points and rolls back when read-only permission arrives during numeric entry',()=>{
  const f=fixture(),tool=new CadPolylineTool(f.editor,undefined as any);tool.onEnter();const session=polylineSession(f.editor);
  assert.equal(session.controller!.add({x:10,y:20}),true);assert.equal(session.controller!.add({x:10,y:20}),false);
  f.state.isReadonly=true;assert.equal(session.controller!.add({x:20,y:30}),false);assert.equal(f.shapes.size,0);assert.equal(session.state.get(),null);
 });
 it('clears the numeric session when switching away before the first point',()=>{
  const f=fixture(),tool=new CadPolylineTool(f.editor,undefined as any);tool.onEnter();assert.ok(polylineSession(f.editor).controller);
  tool.onExit();assert.equal(polylineSession(f.editor).controller,null);assert.equal(polylineSession(f.editor).state.get(),null);
 });
});

// A deliberately simple independently shaped font makes placement expectations explicit.
const font={unitsPerEm:100,hasGlyphForCodePoint:()=>true,layout:(text:string)=>{
 const chars=[...text];return {glyphs:chars.map(c=>({id:c==='\u0301'?2:1,path:{commands:c===' '?[]:[{command:'moveTo',args:[0,0]},{command:'lineTo',args:[40,0]},{command:'lineTo',args:[40,80]},{command:'lineTo',args:[0,80]},{command:'closePath',args:[]}]}})),
 positions:chars.map(c=>({xAdvance:c==='\u0301'?0:60,yAdvance:0,xOffset:c==='\u0301'?-35:0,yOffset:c==='\u0301'?80:0}))};
}};
describe('outline lettering layout',()=>{
 it('aligns lines by shaped advances and changes baseline spacing without losing glyph outlines',()=>{
  for(const [align,x] of [['start',0],['middle',30],['end',60]] as const){
   const contours=layoutCadText(font,'AA\nA',{align,lineHeight:2});assert.equal(contours.length,3);close(curveBounds([contours[2]]).x,x);close(contours[2].nodes[0].y,200);
  }
 });
 it('adds tracking before advancing glyphs and keeps zero-advance marks attached',()=>{
  const normal=layoutCadText(font,'A\u0301B'),spaced=layoutCadText(font,'A\u0301B',{letterSpacing:20});
  close(spaced[1].nodes[0].x,normal[1].nodes[0].x);close(spaced[2].nodes[0].x-normal[2].nodes[0].x,20);
  close(curveBounds(spaced).w-curveBounds(normal).w,20);
 });
 it('rejects invalid typography values before producing a plan',()=>{
  for(const layout of [{letterSpacing:NaN},{letterSpacing:201},{letterSpacing:-51},{lineHeight:0},{lineHeight:6},{align:'unknown'}])assert.throws(()=>validateCadTextLayout(layout as any),/geometry/);
 });
 it('preserves real font kerning, counters and exact physical block height for spaced multiline lettering',async()=>{
  const bytes=readFileSync('static/tldraw/2.4.6/fonts/IBMPlexSans-Medium.woff2');const data=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
  const actual=await readCadFont(data);close(curveBounds(layoutCadText(actual,'AV')).w,curveBounds(glyphRunContours(actual,'AV')).w);assert.ok(layoutCadText(actual,'O').length>=2);
  const f=fixture();const plan=await prepareCadText(f.editor,settings,{text:'BŪVE\r\nПривет',font:'custom',fontData:data,height:80,x:100,y:200,keepSource:true,layout:{align:'middle',letterSpacing:12,lineHeight:1.7}});
  const bounds=curveBounds(plan.contours);close(bounds.h*cadMmPerPixel(settings),80);close(canvasPointToCad({x:bounds.x,y:bounds.y+bounds.h},settings).y,200);
  assert.equal(applyCadPlan(f.editor,plan),true);const result=buildCadDxf(f.editor,'selected',settings);assert.equal(result.omitted.length,0);assert.ok(result.closedContours>5);
  assert.deepEqual(f.editor.getOnlySelectedShape().meta.omsTextLayout,{align:'middle',letterSpacing:12,lineHeight:1.7});
 });
});
