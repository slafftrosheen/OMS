import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import DxfParser from 'dxf-parser';
import { fixture } from '../helpers/cad-editor';
import { buildTextGuide, selectedTextGuide } from '../../src/lib/components/canvas/cad-text-guide';
import { layoutCadGuideText, prepareCadText, type CadTextOptions } from '../../src/lib/components/canvas/cad-text';
import { nodeAt, cubicAt, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import { DEFAULT_CAD_SETTINGS, cadMmPerPixel, unitMm } from '../../src/lib/components/canvas/cad-settings';
import { applyCadPlan } from '../../src/lib/components/canvas/cad-plans';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';
const near=(a:number,b:number,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const line=(length=400):CadContour=>({closed:false,nodes:[nodeAt({x:10,y:20}),nodeAt({x:10+length,y:20})]});
const font={unitsPerEm:100,hasGlyphForCodePoint:()=>true,layout:(text:string)=>({
  glyphs:[...text].map(c=>({id:1,path:{commands:c===' '?[]:[{command:'moveTo',args:[0,0]},{command:'lineTo',args:[60,0]},{command:'lineTo',args:[60,80]},{command:'lineTo',args:[0,80]},{command:'closePath',args:[]}]}})),
  positions:[...text].map(c=>({xAdvance:c==='\u0301'?0:60,yAdvance:0,xOffset:c==='\u0301'?-40:0,yOffset:c==='\u0301'?80:0}))
})};
const base={height:80,offset:0,distance:0,reverse:false,layout:{align:'start' as const}};
const fontData=()=>{const b=readFileSync('static/tldraw/2.4.6/fonts/IBMPlexSans-Medium.woff2');return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;};
const options=(patch:Partial<CadTextOptions>={}):CadTextOptions=>({text:'BŪVE Привет',font:'custom',fontData:fontData(),height:20,x:0,y:0,keepSource:true,guide:{shapeId:'shape:guide',offset:5,distance:7,reverse:false},layout:{align:'middle'},...patch});
function drawing(contour=line(2000)){const f=fixture();f.editor.createShape({id:'shape:guide',type:'cad-bezier',props:{contours:[contour]}});f.editor.setSelectedShapes(['shape:guide']);return f;}

describe('guide length and rigid lettering',()=>{
  it('samples straight segments by distance, including degenerate handles and outgoing corners',()=>{
    const c=line(100);c.nodes.push(nodeAt({x:110,y:120}));const g=buildTextGuide(c);
    near(g.length,200);assert.deepEqual(g.sample(50),{point:{x:60,y:20},tangent:{x:1,y:0}});
    assert.deepEqual(g.sample(100).tangent,{x:0,y:1});assert.deepEqual(g.sample(200).point,{x:110,y:120});
    assert.throws(()=>g.sample(-1),/guide-fit/);assert.throws(()=>g.sample(201),/guide-fit/);
  });
  it('inverts nonuniform cubic speed against an independent dense length reference',()=>{
    const points=[{x:0,y:0},{x:10,y:-180},{x:300,y:210},{x:600,y:20}];
    const a=nodeAt(points[0]),b=nodeAt(points[3]);a.outX=10;a.outY=-180;b.inX=-300;b.inY=190;
    const g=buildTextGuide({closed:false,nodes:[a,b]});let length=0,previous=points[0];
    const samples=[{length:0,p:previous}];for(let i=1;i<=50000;i++){const p=cubicAt(points,i/50000);length+=Math.hypot(p.x-previous.x,p.y-previous.y);samples.push({length,p});previous=p;}
    near(g.length,length,.001);
    for(const fraction of [.1,.25,.5,.9]){const target=length*fraction;let i=samples.findIndex(s=>s.length>=target);const lo=samples[i-1],hi=samples[i],ratio=(target-lo.length)/(hi.length-lo.length);const p=g.sample(target).point;near(p.x,lo.p.x+(hi.p.x-lo.p.x)*ratio,.001);near(p.y,lo.p.y+(hi.p.y-lo.p.y)*ratio,.001);}
  });
  for(const reverse of [false,true])for(const align of ['start','middle','end'] as const)it(`places ${align} with reverse=${reverse} and normal offset`,()=>{
    const r=layoutCadGuideText(font,'AA',buildTextGuide(line()),{...base,reverse,distance:12,layout:{align}});
    const start=(400-120)*(align==='middle'?.5:align==='end'?1:0);
    near(r.advance,120);const n=r.contours[0].nodes;
    near(n[0].x,reverse?410-start:10+start);near(n[0].y,reverse?32:8);
    near(n[1].x-n[0].x,reverse?-60:60);near(n[3].y-n[0].y,reverse?80:-80);
  });
  it('wraps closed paths but rejects open overflow and repeated loops',()=>{
    const c=line(100);c.closed=true;const guide=buildTextGuide(c);
    const a=layoutCadGuideText(font,'A',guide,{...base,offset:190}),b=layoutCadGuideText(font,'A',guide,{...base,offset:-10});assert.deepEqual(a,b);
    assert.throws(()=>layoutCadGuideText(font,'AAAA',guide,base),/guide-fit/);
    for(const offset of [-1,341])assert.throws(()=>layoutCadGuideText(font,'A',buildTextGuide(line()),{...base,offset}),/guide-fit/);
    for(const text of ['A\nB','A\rB','A\u2028B'])assert.throws(()=>layoutCadGuideText(font,text,guide,base),/arc-text-line/);
    assert.throws(()=>buildTextGuide({closed:false,nodes:[nodeAt({x:0,y:0}),nodeAt({x:0,y:0})]}),/guide-selection/);
  });
  it('keeps combining marks attached to their base glyph during rotation',()=>{
    const c=line();c.nodes[1].x=10;c.nodes[1].y=420;
    const raw=layoutCadGuideText(font,'A\u0301B',buildTextGuide(line()),{...base,height:160});
    const turn=layoutCadGuideText(font,'A\u0301B',buildTextGuide(c),{...base,height:160});
    for(let i=0;i<4;i++)for(let j=0;j<4;j++){const a=raw.contours[0].nodes[i],b=raw.contours[1].nodes[j],x=turn.contours[0].nodes[i],y=turn.contours[1].nodes[j];near(Math.hypot(a.x-b.x,a.y-b.y),Math.hypot(x.x-y.x,x.y-y.y));}
  });
});

describe('guide lettering document and cutting integration',()=>{
  it('retains transformed guide, letter holes and metadata with one undo operation',async()=>{
    const f=drawing();f.editor.createShape({id:'shape:group',type:'group',x:120,y:90,rotation:.6});f.editor.updateShape({id:'shape:guide',parentId:'shape:group',x:12,y:18,rotation:.1});
    const old=structuredClone([...f.shapes.values()]),plan=await prepareCadText(f.editor,DEFAULT_CAD_SETTINGS,options());
    assert.deepEqual(plan.sourceIds,['shape:guide']);assert.deepEqual(plan.removeIds,[]);assert.ok(plan.contours.length>10);assert.ok(plan.warnings.includes('guide-text-review'));
    assert.equal(applyCadPlan(f.editor,plan),true);assert.deepEqual(f.shapes.get('shape:guide'),old[0]);assert.deepEqual(f.only().meta.omsTextGuide,plan.guideText);assert.equal(f.marks.length,2);
    const dxf=buildCadDxf(f.editor,'selected',DEFAULT_CAD_SETTINGS);assert.equal(dxf.omitted.length,0);assert.ok(new DxfParser().parseSync(dxf.text)!.entities.length>10);
    f.editor.bailToMark(f.marks[0].id);assert.deepEqual([...f.shapes.values()],old);
  });
  it('uses the same physical geometry across mm, inch, scale and origin changes',async()=>{
    let expected:any;
    for(const settings of [DEFAULT_CAD_SETTINGS,{...DEFAULT_CAD_SETTINGS,scale:10,unit:'in' as const,originX:27,originY:34}]){
      const factor=cadMmPerPixel(settings),u=unitMm(settings.unit),c=line(1000);c.nodes=c.nodes.map(n=>({...n,x:settings.originX+n.x/factor,y:settings.originY+n.y/factor}));
      const f=drawing(c),plan=await prepareCadText(f.editor,settings,options({height:20/u,guide:{shapeId:'shape:guide',offset:5/u,distance:7/u,reverse:true}}));
      near(plan.guideText!.lengthMm,1000);near(plan.guideText!.offsetMm,5);near(plan.guideText!.distanceMm,7);assert.equal(applyCadPlan(f.editor,plan),true);
      const dxf=new DxfParser().parseSync(buildCadDxf(f.editor,'selected',settings).text)!;
      const points=(dxf.entities as any[]).map(e=>e.controlPoints??e.vertices);
      if(expected)points.forEach((ps:any[],i:number)=>ps.forEach((p,j)=>{near(p.x,expected[i][j].x,1e-6);near(p.y,expected[i][j].y,1e-6);}));else expected=points;
    }
  });
  it('rejects unsupported guides and mutations after review without losing the source',async()=>{
    for(const fault of ['lock','readonly','clip','binding','frame','raster','multi']){
      const f=drawing();if(fault==='lock')f.only().isLocked=true;if(fault==='readonly')f.state.isReadonly=true;if(fault==='clip')f.only().mask=[];if(fault==='binding')f.state.bindings=[{}];if(fault==='raster')f.only().meta.omsVectorPaint={raster:{usage:'material'}};
      if(fault==='frame'){f.editor.createShape({id:'shape:frame',type:'frame'});f.only().parentId='shape:frame';}if(fault==='multi')f.only().props.contours.push(line());
      assert.throws(()=>selectedTextGuide(f.editor,DEFAULT_CAD_SETTINGS,'shape:guide'));assert.equal(f.marks.length,0);
    }
    for(const fault of ['selection','geometry','readonly','creation']){const f=drawing(),plan=await prepareCadText(f.editor,DEFAULT_CAD_SETTINGS,options());if(fault==='selection')f.editor.selectNone();if(fault==='geometry')f.only().x=5;if(fault==='readonly')f.state.isReadonly=true;if(fault==='creation')f.state.failCreation=true;const before=structuredClone([...f.shapes.values()]);assert.equal(applyCadPlan(f.editor,plan),false);assert.deepEqual([...f.shapes.values()],before);}
  });
});
