import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import DxfParser from 'dxf-parser';
import { fixture } from '../helpers/cad-editor';
import { layoutCadArcText, layoutCadText, prepareCadText, readCadFont, type CadTextOptions } from '../../src/lib/components/canvas/cad-text';
import { curveBounds, cubicPoints, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import { DEFAULT_CAD_SETTINGS, cadMmPerPixel, unitMm, type CadSettings } from '../../src/lib/components/canvas/cad-settings';
import { applyCadPlan } from '../../src/lib/components/canvas/cad-plans';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';

const near = (a: number, b: number, tolerance = 1e-8) => assert.ok(Math.abs(a-b) < tolerance, `${a} != ${b}`);
const font = {
  unitsPerEm: 100, hasGlyphForCodePoint: () => true,
  layout: (text: string) => {
    const chars = text === 'fi' ? ['ligature'] : [...text];
    return {
      glyphs: chars.map(c => ({ id: 1, path: { commands: c === ' ' ? [] : [
        { command: 'moveTo', args: [0, 0] }, { command: 'lineTo', args: [60, 0] },
        { command: 'bezierCurveTo', args: [60, 20, 60, 60, 60, 80] },
        { command: 'lineTo', args: [0, 80] }, { command: 'closePath', args: [] }
      ] } })),
      positions: chars.map(c => ({ xAdvance: c === '\u0301' ? 0 : c === 'ligature' ? 100 : 60,
        yAdvance: 0, xOffset: c === '\u0301' ? -40 : 0, yOffset: c === '\u0301' ? 80 : 0 }))
    };
  }
};
const base = { radius: 200, height: 80, x: 17, y: 29, angle: 90, direction: 'clockwise' as const, layout: { align: 'middle' as const } };
const anchor = (c: CadContour) => ({ x: (c.nodes[0].x+c.nodes[1].x)/2, y: (c.nodes[0].y+c.nodes[1].y)/2 });
const distance = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x,a.y-b.y);
const fontBytes = () => {
  const bytes = readFileSync('static/tldraw/2.4.6/fonts/IBMPlexSans-Medium.woff2');
  return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
};
const options = (extra: Partial<CadTextOptions> = {}): CadTextOptions => ({ text:'BŪVE Привет',font:'custom',fontData:fontBytes(),height:20,x:100,y:200,keepSource:true,
  arc:{radius:120,angle:90,direction:'clockwise'},layout:{align:'middle',letterSpacing:5},...extra });

describe('circular outline lettering geometry', () => {
  for (const direction of ['clockwise','counterclockwise'] as const) for (const align of ['start','middle','end'] as const)
    it(`anchors shaped advances for ${direction} / ${align}`, () => {
      const result = layoutCadArcText(font,'AA',{...base,direction,layout:{align}});
      near(result.advance,120);near(result.sweepDegrees,120/200*180/Math.PI);
      for (let i=0;i<2;i++) {
        const offset = i*60+30-120*(align==='middle'?.5:align==='end'?1:0);
        const angle = Math.PI/2+(direction==='clockwise'?-1:1)*offset/200;
        const a=anchor(result.contours[i]);near(a.x,17+200*Math.cos(angle));near(a.y,29-200*Math.sin(angle));
      }
    });
  it('keeps top clockwise and bottom counterclockwise lettering upright', () => {
    for (const [direction,angle,baselineY] of [['clockwise',90,-171],['counterclockwise',-90,229]] as const) {
      const c=layoutCadArcText(font,'A',{...base,direction,angle}).contours[0];
      near(c.nodes[0].y,baselineY);near(c.nodes[1].y,baselineY);near(c.nodes[1].x-c.nodes[0].x,60);near(c.nodes[3].y,baselineY-80);
    }
  });
  it('preserves each glyph outline, cubic handles, closure and winding under a rigid transform', () => {
    const straight=layoutCadText(font,'AA'),curved=layoutCadArcText(font,'AA',{...base,angle:35,height:40}).contours;
    for(let g=0;g<2;g++) {
      assert.equal(curved[g].closed,straight[g].closed);
      for(let i=0;i<4;i++) {
        const a=straight[g].nodes[i],b=curved[g].nodes[i];
        near(Math.hypot(b.inX,b.inY),Math.hypot(a.inX,a.inY)/2);near(Math.hypot(b.outX,b.outY),Math.hypot(a.outX,a.outY)/2);
        for(let j=0;j<4;j++)near(distance(b,curved[g].nodes[j]),distance(a,straight[g].nodes[j])/2);
      }
      const cross=(c:CadContour)=>(c.nodes[1].x-c.nodes[0].x)*(c.nodes[3].y-c.nodes[0].y)-(c.nodes[1].y-c.nodes[0].y)*(c.nodes[3].x-c.nodes[0].x);
      near(cross(curved[g]),cross(straight[g])/4);
    }
  });
  it('uses spaces and tracking in the arc advance without creating extra contours', () => {
    const a=layoutCadArcText(font,'A A',{...base,layout:{align:'start',letterSpacing:20}});
    assert.equal(a.contours.length,2);near(a.advance,220);
    const b=layoutCadArcText(font,' AA ',base);assert.equal(b.contours.length,2);near(b.advance,240);
    const expected=2*base.radius*Math.sin(160/base.radius/2);near(distance(anchor(a.contours[0]),anchor(a.contours[1])),expected);
  });
  it('keeps combining marks on the base glyph rotation and preserves shaped ligatures', () => {
    const raw=layoutCadText(font,'A\u0301B'),arc=layoutCadArcText(font,'A\u0301B',{...base,height:160,layout:{align:'middle',letterSpacing:20}});
    assert.equal(arc.contours.length,3);
    for(let i=0;i<4;i++)for(let j=0;j<4;j++)near(distance(raw[0].nodes[i],raw[1].nodes[j]),distance(arc.contours[0].nodes[i],arc.contours[1].nodes[j]));
    const ligature=layoutCadArcText(font,'fi',base);assert.equal(ligature.contours.length,1);near(ligature.advance,100);
  });
  it('retains requested radius and glyph height rather than fitting the curved bounding box', () => {
    const a=layoutCadArcText(font,'AAA',base),b=layoutCadArcText(font,'AAA',{...base,radius:400});
    assert.notEqual(curveBounds(a.contours).h,80);
    for(const c of a.contours){near(distance(anchor(c),base),200);near(distance(c.nodes[0],c.nodes[3]),80);}
    for(const c of b.contours){near(distance(anchor(c),base),400);near(distance(c.nodes[0],c.nodes[3]),80);}
  });
  it('accepts a full turn and refuses excess advance, invalid inputs and multiline text', () => {
    near(layoutCadArcText(font,'A',{...base,radius:60/(2*Math.PI)}).sweepDegrees,360);
    assert.throws(()=>layoutCadArcText(font,'A',{...base,radius:60/(2*Math.PI)-.01}),/arc-text-fit/);
    for(const text of ['A\nA','A\rA','A\u2028A','A\u2029A'])assert.throws(()=>layoutCadArcText(font,text,base),/arc-text-line/);
    for(const change of [{radius:0},{radius:NaN},{height:0},{height:Infinity},{angle:361},{x:NaN},{y:Infinity},{direction:'invalid'}])assert.throws(()=>layoutCadArcText(font,'A',{...base,...change} as any),/geometry/);
    assert.throws(()=>layoutCadArcText(font,' '.repeat(3),base),/geometry/);
    assert.throws(()=>layoutCadArcText(font,'A'.repeat(501),base),/limit/);
    assert.throws(()=>layoutCadArcText({...font,hasGlyphForCodePoint:()=>false},'A',base),/missing-glyph/);
  });
  it('distinguishes collapsed negative tracking from a run that exceeds one circle', () => {
    const narrow={...font,layout:(text:string)=>{const run=font.layout(text);run.positions=run.positions.map(p=>({...p,xAdvance:20}));return run;}};
    assert.throws(()=>layoutCadArcText(narrow,'AAAA',{...base,layout:{letterSpacing:-50}}),/arc-text-advance/);
    assert.throws(()=>layoutCadArcText(narrow,'AAAA',{...base,radius:1}),/arc-text-fit/);
    assert.ok(layoutCadArcText(narrow,'AAAA',{...base,layout:{letterSpacing:0}}).advance>0);
  });
  it('refuses vertical and backward shaped advances instead of misplacing glyphs', () => {
    for(const p of [{xAdvance:60,yAdvance:10},{xAdvance:-60,yAdvance:0}]) {
      const unusual={...font,layout:(text:string)=>{const run=font.layout(text);run.positions[0]={...run.positions[0],...p};return run;}};
      assert.throws(()=>layoutCadArcText(unusual,'A',base),/arc-text-layout/);
    }
  });
});

describe('circular lettering integration and manufacturing coordinates', () => {
  it('retains real Latin/Latvian/Cyrillic counters, metadata, existing artwork and one undo operation', async () => {
    const f=fixture();f.editor.createShape({id:'shape:source',type:'geo',props:{w:40,h:30}});f.editor.setSelectedShapes(['shape:source']);
    const before=structuredClone([...f.shapes.values()]),plan=await prepareCadText(f.editor,DEFAULT_CAD_SETTINGS,options());
    assert.ok(plan.contours.length>10);assert.equal(plan.fillRule,'nonzero');assert.ok(plan.contours.every(c=>c.closed));
    assert.deepEqual(plan.sourceIds,[]);assert.deepEqual(plan.removeIds,[]);near(plan.arcText!.radiusMm,120);
    assert.ok(plan.warnings.includes('arc-text-review'));assert.equal(applyCadPlan(f.editor,plan),true);
    assert.equal(f.shapes.size,2);assert.equal(f.marks.length,2);assert.equal(f.only().meta.omsSourceText,'BŪVE Привет');
    assert.deepEqual(f.only().meta.omsTextArc,plan.arcText);assert.equal(f.only().props.fillRule,'nonzero');
    f.editor.bailToMark(f.marks[0].id);assert.deepEqual([...f.shapes.values()],before);assert.deepEqual(f.editor.getSelectedShapeIds(),['shape:source']);
  });
  it('exports identical full-size DXF geometry at mm 1:1, mm 1:10 and inch display 1:10', async () => {
    const settings:CadSettings[]=[{...DEFAULT_CAD_SETTINGS,originX:300,originY:500},{...DEFAULT_CAD_SETTINGS,scale:10,originX:-70,originY:200},{...DEFAULT_CAD_SETTINGS,scale:10,unit:'in',originX:50,originY:-40}];
    let expected:any[]|undefined;
    for(const s of settings) {
      const f=fixture();f.state.zoom=.125;const factor=unitMm(s.unit);
      const plan=await prepareCadText(f.editor,s,options({height:20/factor,x:100/factor,y:200/factor,arc:{radius:120/factor,angle:90,direction:'clockwise'}}));
      near(plan.arcText!.radiusMm,120);assert.equal(applyCadPlan(f.editor,plan),true);
      const exported=buildCadDxf(f.editor,'selected',s);assert.equal(exported.omitted.length,0);
      const parsed=new DxfParser().parseSync(exported.text)!;assert.equal(parsed.header.$INSUNITS,4);
      assert.ok(parsed.entities.every(e=>e.type==='SPLINE'||e.type==='LWPOLYLINE'));
      const controls=(parsed.entities as any[]).map(e=>e.type==='SPLINE'?e.controlPoints:e.vertices);
      if(expected)controls.forEach((ps,i)=>ps.forEach((p:any,j:number)=>{near(p.x,expected![i][j].x,1e-6);near(p.y,expected![i][j].y,1e-6);}));
      else expected=controls;
      // Independently verify every exported cubic's controls against the planned curves.
      plan.contours.forEach((c,i)=>{
        const points=parsed.entities[i].type==='SPLINE'?c.nodes.flatMap((n,j)=>cubicPoints(n,c.nodes[(j+1)%c.nodes.length]).filter((_,k)=>j===0||k>0)):c.nodes;
        assert.equal(controls[i].length,points.length);
        points.forEach((p,j)=>{near(controls[i][j].x,(p.x-s.originX)*cadMmPerPixel(s),1e-6);near(controls[i][j].y,(s.originY-p.y)*cadMmPerPixel(s),1e-6);});
      });
    }
  });
  it('checks source mode, physical bounds and single-line fit before mutating', async () => {
    const f=fixture();f.editor.createShape({id:'shape:text',type:'text',props:{text:'Hello'}});
    await assert.rejects(prepareCadText(f.editor,DEFAULT_CAD_SETTINGS,options({sourceId:'shape:text'})),/selection/);
    for(const patch of [{text:'One\nTwo'},{arc:{radius:.1,angle:90,direction:'clockwise' as const}},{x:1e9},{height:1e10}])
      await assert.rejects(prepareCadText(f.editor,DEFAULT_CAD_SETTINGS,options(patch)));
    assert.equal(f.shapes.size,1);assert.equal(f.marks.length,0);
  });
  it('rejects stale selection, readonly, capacity and failed creation without partially applying', async () => {
    for(const fault of ['selection','readonly','capacity','creation','payload']) {
      const f=fixture(),plan=await prepareCadText(f.editor,DEFAULT_CAD_SETTINGS,options());
      if(fault==='selection')f.editor.setSelectedShapes(['shape:missing']);
      if(fault==='readonly')f.state.isReadonly=true;
      if(fault==='capacity')f.editor.options.maxShapesPerPage=0;
      if(fault==='creation')f.state.failCreation=true;
      if(fault==='payload')f.editor.store={getStoreSnapshot:()=>({padding:'x'.repeat(1_900_000)})};
      assert.equal(applyCadPlan(f.editor,plan),false);assert.equal(f.shapes.size,0);assert.equal(f.marks.length,0);
    }
  });
  it('does not alter ordinary multiline lettering or add arc metadata in straight mode', async () => {
    const f=fixture(),plan=await prepareCadText(f.editor,DEFAULT_CAD_SETTINGS,options({text:'BŪVE\nПривет',arc:undefined}));
    assert.equal(plan.arcText,undefined);near(plan.heightMm,20);assert.equal(plan.shapes![0].meta!.omsTextArc,undefined);
    const actual=await readCadFont(fontBytes());assert.ok(layoutCadText(actual,'ŌO').length>=4);
  });
});
