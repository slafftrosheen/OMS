import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixture } from '../helpers/cad-editor';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { VECTOR_DEFAULT_PAINT } from '../../src/lib/components/canvas/cad-paint';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';
import { transformAppearance } from '../../src/lib/components/canvas/cad-appearance';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { measureCadSelection } from '../../src/lib/components/canvas/cad-measurements';
import { prepareVectorExport } from '../../src/lib/components/canvas/cad-vector-export';
import { VectorArtwork } from '../../src/lib/components/canvas/VectorArtwork';
import { prepareGradientFill, applyGradientFill, removeGradientFill, gradientFillSelection, getGradientFillSettings, type GradientFillSettings } from '../../src/lib/components/canvas/gradient-fill';

const { createCanvas, loadImage } = createRequire(resolve('package.json'))('@napi-rs/canvas');
const rect = (x = 0, y = 0, w = 200, h = 100) => ({ closed: true, nodes: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }].map(nodeAt) });
const settings = (): GradientFillSettings => ({ type: 'linear', angle: 0, opacity: 100, stops: [{ offset: 0, color: '#ff0000' }, { offset: .25, color: '#00ff00' }, { offset: 1, color: '#0000ff' }] });
function drawing(holes = true) {
  const f = fixture(), update = f.editor.updateShape;
  // Match native tldraw's top-level metadata merge, including explicit clears.
  f.editor.updateShape = (patch: any) => update({ ...patch, ...(patch.meta ? { meta: { ...f.shapes.get(patch.id)?.meta, ...patch.meta } } : {}) });
  f.editor.createShape({ id: 'shape:curve', type: 'cad-bezier', x: 15, y: 23, rotation: .2, opacity: .8,
    props: { contours: holes ? [rect(), rect(70,35,60,30)] : [rect()], fillRule: 'evenodd' },
    meta: { custom: 'keep', omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, fill: '#eeeeee', stroke: '#332211', strokeWidth: 2, strokeOpacity: .7, dash: [3,2] } } });
  f.editor.setSelectedShapes(['shape:curve']);
  return f;
}

describe('editable vector gradient fills', () => {
  it('preserves geometry, styling, measurements and exact DXF through apply, save, clear and undo', () => {
    const f = drawing(), before = structuredClone(f.only());
    const dxf = buildCadDxf(f.editor, 'selected', DEFAULT_CAD_SETTINGS).text, measurement = measureCadSelection(f.editor, DEFAULT_CAD_SETTINGS);
    const input = { ...settings(), angle: 37, opacity: 65 }, plan = prepareGradientFill(f.editor, input);
    input.stops[0].color = '#ffffff';
    assert.equal(plan.settings.stops[0].color, '#ff0000');
    assert.equal(applyGradientFill(f.editor, plan), true);
    assert.deepEqual(f.only().props, before.props);
    for (const key of ['x','y','rotation','opacity','parentId']) assert.equal(f.only()[key], before[key]);
    for (const key of ['stroke','strokeWidth','strokeOpacity','lineCap','lineJoin','miterLimit','dash','dashOffset','fill']) assert.deepEqual(f.only().meta.omsVectorPaint[key], before.meta.omsVectorPaint[key]);
    assert.equal(f.only().meta.custom, 'keep');
    assert.equal(gradientFillSelection(f.editor)!.hasGradient, true);
    assert.equal(buildCadDxf(f.editor, 'selected', DEFAULT_CAD_SETTINGS).text, dxf);
    assert.deepEqual(measureCadSelection(f.editor, DEFAULT_CAD_SETTINGS), measurement);
    const saved = JSON.parse(JSON.stringify(f.only())); f.shapes.set(saved.id, saved);
    const loaded = getGradientFillSettings(f.editor)!;
    assert.ok(Math.abs(loaded.angle - 37) < 1e-10); assert.equal(loaded.opacity, 65); assert.deepEqual(loaded.stops, settings().stops);
    loaded.stops[0].color = '#123456'; assert.equal(f.only().meta.omsVectorPaint.gradient.stops[0].color, '#ff0000');
    assert.equal(removeGradientFill(f.editor), true);
    assert.deepEqual(f.only().meta.omsVectorPaint, { ...before.meta.omsVectorPaint, fillOpacity: .65 });
    assert.equal(f.only().meta.omsMaterialTexture, null);
    f.editor.bailToMark(f.marks[0].id); assert.deepEqual(f.only(), before);
  });

  it('fits the linear axis to projected bounds at every angle, with positive angles pointing up', () => {
    const f = drawing();
    for (const angle of [0,30,90,153,180,-45,-270,360]) {
      const g = prepareGradientFill(f.editor, { ...settings(), angle }).paint.gradient!;
      const dx = g.end[0]-g.start[0], dy = g.end[1]-g.start[1], squared = dx*dx+dy*dy;
      const ts = [[0,0],[200,0],[200,100],[0,100]].map(([x,y]) => ((x-g.start[0])*dx+(y-g.start[1])*dy)/squared);
      assert.ok(Math.abs(Math.min(...ts)) < 1e-12); assert.ok(Math.abs(Math.max(...ts)-1) < 1e-12);
      assert.ok(Math.abs((g.start[0]+g.end[0])/2-100) < 1e-12); assert.ok(Math.abs((g.start[1]+g.end[1])/2-50) < 1e-12);
      if (angle === 90) assert.ok(g.end[1] < g.start[1]);
    }
  });

  it('renders a real multi-stop SVG gradient and keeps compound holes transparent', async () => {
    const plan = prepareGradientFill(drawing().editor, settings());
    const svg = renderToStaticMarkup(React.createElement('svg', { xmlns:'http://www.w3.org/2000/svg', width:200, height:100 }, React.createElement(VectorArtwork, { id: 'gradient', ...plan })));
    assert.match(svg, /linearGradient/); assert.match(svg, /offset="0.25"/); assert.match(svg, /fill-rule="evenodd"/);
    const canvas = createCanvas(200,100), ctx = canvas.getContext('2d'); ctx.drawImage(await loadImage(Buffer.from(svg)),0,0);
    const pixel = (x: number,y: number) => [...ctx.getImageData(x,y,1,1).data];
    const red = pixel(3,15), green = pixel(50,15), blue = pixel(196,15);
    assert.ok(red[0] > 220 && red[1] < 35); assert.ok(green[1] > 245 && green[0] < 10 && green[2] < 10); assert.ok(blue[2] > 240 && blue[1] < 15);
    assert.equal(pixel(100,50)[3], 0);
  });

  it('renders a centred radial ellipse that reaches the last colour at the bounds', async () => {
    const input: GradientFillSettings = { ...settings(), type:'radial', stops:[{offset:0,color:'#ffffff'},{offset:1,color:'#000000'}] };
    const plan = prepareGradientFill(drawing(false).editor, input), g = plan.paint.gradient!;
    assert.deepEqual(g.matrix, [100,0,0,50,100,50]); assert.deepEqual(g.start, [0,0]); assert.deepEqual(g.end, [0,0]); assert.equal(g.r1,1);
    const svg = renderToStaticMarkup(React.createElement('svg', { xmlns:'http://www.w3.org/2000/svg', width:200, height:100 }, React.createElement(VectorArtwork, { id:'radial', ...plan })));
    const canvas=createCanvas(200,100), ctx=canvas.getContext('2d'); ctx.drawImage(await loadImage(Buffer.from(svg)),0,0);
    assert.ok(ctx.getImageData(100,50,1,1).data[0] > 245);
    assert.ok(ctx.getImageData(100,3,1,1).data[0] < 25);
    assert.ok(ctx.getImageData(196,50,1,1).data[0] < 15);
  });

  it('exports vector shading with colour-stop functions to PDF/EPS and reports EPS opacity', () => {
    for (const type of ['linear','radial'] as const) {
      const f=drawing(); f.only().opacity=1; f.only().meta.omsVectorPaint.strokeOpacity=1;
      assert.equal(applyGradientFill(f.editor,prepareGradientFill(f.editor,{...settings(),type})),true);
      for (const format of ['pdf','eps'] as const) {
        const out=prepareVectorExport(f.editor,DEFAULT_CAD_SETTINGS,'selected',format);
        assert.equal(out.omitted.length,0); assert.match(out.text,new RegExp(`/ShadingType ${type==='linear'?2:3}`));
        assert.match(out.text,/\/FunctionType 3/); assert.match(out.text,/\/Bounds \[0.25\]/); assert.doesNotMatch(out.text,/\/Subtype \/Image/);
      }
      applyGradientFill(f.editor,prepareGradientFill(f.editor,{...settings(),type,opacity:40}));
      assert.equal(prepareVectorExport(f.editor,DEFAULT_CAD_SETTINGS,'selected','pdf').omitted.length,0);
      assert.equal(prepareVectorExport(f.editor,DEFAULT_CAD_SETTINGS,'selected','eps').omitted.length,1);
    }
  });

  it('reads all imported stops and transformed direction, then explicitly refits imported mapping', () => {
    const f=drawing(), g=prepareGradientFill(f.editor,settings()).paint.gradient!;
    const stops=Array.from({length:256},(_,i)=>({offset:i/255,color:i%2?'#112233':'#aabbcc'}));
    f.only().meta.omsVectorPaint={...f.only().meta.omsVectorPaint,gradient:{...g,matrix:[0,-2,3,0,12,34],bounds:[0,0,200,100],stops}};
    const read=getGradientFillSettings(f.editor)!; assert.equal(read.angle,90); assert.deepEqual(read.stops,stops);
    const plan=prepareGradientFill(f.editor,read); assert.equal(plan.paint.gradient!.bounds,undefined); assert.deepEqual(plan.paint.gradient!.matrix,[1,0,0,1,0,0]);
    assert.equal(applyGradientFill(f.editor,plan),true);
    const transformed=transformAppearance(f.only().meta.omsVectorPaint,[2,0,0,3,0,0]); f.only().meta.omsVectorPaint=transformed;
    assert.equal(getGradientFillSettings(f.editor)!.angle,90);
  });

  it('replaces material fills without stale material settings and undo restores the material', () => {
    const f=drawing(), image={usage:'material',external:true,fileId:'12345678-1234-4234-8234-123456789abc',png:'/api/files/12345678-1234-4234-8234-123456789abc/download',width:10,height:10,hasAlpha:false,matrix:[200,0,0,100,0,0]};
    f.only().meta.omsVectorPaint.raster=image; f.only().meta.omsMaterialTexture={scale:150,angle:30,opacity:100}; const before=structuredClone(f.only());
    assert.equal(gradientFillSelection(f.editor)!.hasTexture,true);
    assert.equal(applyGradientFill(f.editor,prepareGradientFill(f.editor,settings())),true);
    assert.equal(f.only().meta.omsVectorPaint.raster,undefined); assert.equal(f.only().meta.omsMaterialTexture,null);
    f.editor.bailToMark(f.marks[0].id); assert.deepEqual(f.only(),before);
  });

  for (const fault of ['readonly','locked','ancestor-lock','protected','frame','open','clip','mask','binding','selection','document','move','paint','failed','partial','tamper']) it(`rejects ${fault} without partial changes`, () => {
    const f=drawing(), plan=prepareGradientFill(f.editor,settings());
    if(fault==='readonly')f.state.isReadonly=true;
    if(fault==='locked')f.only().isLocked=true;
    if(['ancestor-lock','protected','frame'].includes(fault)){f.editor.createShape({id:'shape:parent',type:fault==='protected'?'order-details':fault==='frame'?'frame':'group',isLocked:fault==='ancestor-lock'});f.only().parentId='shape:parent';}
    if(fault==='open')f.only().props.contours[0].closed=false;
    if(fault==='clip')f.only().meta.omsVectorPaint.clips=[{contours:[rect()],fillRule:'evenodd'}];
    if(fault==='mask')f.only().mask=[];
    if(fault==='binding')f.state.bindings=[{}];
    if(fault==='selection')f.editor.selectNone();
    if(fault==='document')f.editor.updatePage({meta:{omsCad:{...DEFAULT_CAD_SETTINGS,scale:10}}});
    if(fault==='move')f.only().x++;
    if(fault==='paint')f.only().meta.omsVectorPaint.stroke='#abcdef';
    if(fault==='failed')f.editor.updateShape=()=>{};
    if(fault==='partial'){const update=f.editor.updateShape;f.editor.updateShape=(patch:any)=>{update(patch);throw Error('interrupted update');};}
    if(fault==='tamper')plan.paint.strokeWidth++;
    const before=structuredClone([...f.shapes.values()]); assert.equal(applyGradientFill(f.editor,plan),false); assert.deepEqual([...f.shapes.values()],before); assert.equal(f.marks.length,0);
  });

  it('blocks invalid stop lists and geometry, and refuses page rasters as cutting curves', () => {
    const f=drawing();
    for(const patch of [{angle:NaN},{angle:361},{opacity:-1},{opacity:101},{type:'unknown'},{stops:[]},{stops:[{offset:0,color:'#ffffff'}]},{stops:[{offset:0,color:'#fff'},{offset:1,color:'#000000'}]},{stops:[{offset:0,color:'#ffffff'},{offset:0,color:'#000000'}]},{stops:[{offset:.1,color:'#ffffff'},{offset:1,color:'#000000'}]},{stops:[{offset:0,color:'#ffffff'},{offset:NaN,color:'#000000'}]},{stops:Array.from({length:257},(_,i)=>({offset:i/256,color:'#abcdef'}))}])assert.throws(()=>prepareGradientFill(f.editor,{...settings(),...patch} as any),/geometry/);
    f.only().meta.omsVectorPaint.raster={external:true,fileId:'12345678-1234-4234-8234-123456789abc',png:'/api/files/12345678-1234-4234-8234-123456789abc/download',width:10,height:10,hasAlpha:false,matrix:[200,0,0,100,0,0]};
    assert.equal(gradientFillSelection(f.editor),null); assert.equal(getGradientFillSettings(f.editor),null);
  });

  it('blocks save-budget growth but permits clearing an over-budget drawing', () => {
    const f=drawing(); applyGradientFill(f.editor,prepareGradientFill(f.editor,settings()));
    f.editor.store={getStoreSnapshot:()=>({shapes:[...f.shapes.values()],padding:'x'.repeat(1_900_000)})};
    assert.equal(removeGradientFill(f.editor),true); const before=structuredClone(f.only());
    assert.equal(applyGradientFill(f.editor,prepareGradientFill(f.editor,settings())),false); assert.deepEqual(f.only(),before);
  });
});
