import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Box, Vec } from '@tldraw/tldraw';
import { CadPathShapeUtil, CadEllipseShapeUtil, CadArcShapeUtil } from '../../src/lib/components/canvas/shapes/CadShapes';
import { VectorArtwork, VectorPathArtwork } from '../../src/lib/components/canvas/VectorArtwork';
import { cadAnalyticPath, cadAppearanceGeometry, cadPaintClipTest, cadShapePaint } from '../../src/lib/components/canvas/cad-shape-appearance';
import { VECTOR_DEFAULT_PAINT } from '../../src/lib/components/canvas/cad-paint';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { prepareVectorExport } from '../../src/lib/components/canvas/cad-vector-export';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';

const rectangle = (x = 0, y = 0, w = 100, h = 80) => ({ closed: true, nodes: [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}].map(nodeAt) });
const gradient: any = { type:'linear',matrix:[1,0,0,1,0,0],start:[0,0],end:[100,80],r0:0,r1:1,stops:[{offset:0,color:'#ff0000'},{offset:1,color:'#0000ff'}] };
const shape = (type: string, props: any, paint: any = VECTOR_DEFAULT_PAINT): any =>
  ({ id:'shape:one',type,typeName:'shape',parentId:'page:one',index:'a1',x:0,y:0,rotation:0,opacity:1,isLocked:false,
     props:{color:'black',...props},meta:{custom:'keep',omsVectorPaint:structuredClone(paint)} });
const editor: any = {user:{getIsDarkMode:()=>false},getShapePageTransform:()=>({rotation:()=>0,applyToPoint:(p:any)=>p})};
const svg = (node: any) => renderToStaticMarkup(React.createElement('svg',null,node));
const near = (a: number,b: number) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);

describe('analytic CAD paint and geometry', () => {
  it('renders exact analytic SVG commands without converting saved ellipse or arc geometry', () => {
    const ellipse = shape('cad-ellipse',{w:100,h:80}), arc = shape('cad-arc',{radius:50,startAngle:0,endAngle:270});
    const before = structuredClone([ellipse,arc]);
    assert.equal(cadAnalyticPath(ellipse),'M0,40 A50,40 0 1 0 100,40 A50,40 0 1 0 0,40 Z');
    assert.match(cadAnalyticPath(arc),/ A50,50 0 1 0 /); assert.ok(!cadAnalyticPath(arc).includes('Z'));
    assert.deepEqual([ellipse,arc],before);
    const bounds=cadAppearanceGeometry(arc).bounds;near(bounds.x,-50);near(bounds.y,-50);near(bounds.w,100);near(bounds.h,100);
  });
  it('preserves legacy schema-valid arc rendering without throwing while reopening or exporting', () => {
    const util = new CadArcShapeUtil(editor);
    for (const [startAngle, endAngle] of [[0,0],[90,0],[0,360],[0,720]]) {
      const arc = shape('cad-arc', { radius:50,startAngle,endAngle }), before = structuredClone(arc);
      assert.throws(() => cadAppearanceGeometry(arc));
      assert.doesNotThrow(() => util.component(arc));
      const output = svg(util.toSvg(arc));
      assert.match(output, / A50,50 0 /);
      assert.deepEqual(arc,before);
    }
  });
  it('uses one full-paint renderer for exact analytic paths and ordinary Bézier artwork', () => {
    const paint:any={...VECTOR_DEFAULT_PAINT,fill:'#112233',stroke:'#445566',strokeWidth:7,fillOpacity:.3,strokeOpacity:.4,
      dash:[3,8],dashOffset:2,lineCap:'round',lineJoin:'bevel',miterLimit:12};
    const path='M0,0 L100,0 L100,80 L0,80 Z';
    const exact=svg(React.createElement(VectorPathArtwork,{id:'exact',data:path,fillRule:'evenodd',paint}));
    for(const attribute of ['fill="#112233"','stroke="#445566"','stroke-width="7"','fill-opacity="0.3"','stroke-opacity="0.4"','stroke-dasharray="3 8"','stroke-dashoffset="2"','stroke-linecap="round"','stroke-linejoin="bevel"','stroke-miterlimit="12"']) assert.ok(exact.includes(attribute),attribute);
    const bezier=svg(React.createElement(VectorArtwork,{id:'bezier',contours:[rectangle()],fillRule:'evenodd',paint}));
    assert.ok(bezier.includes('stroke-width="7"'));assert.ok(bezier.includes('fill="#112233"'));
    const ellipse=shape('cad-ellipse',{w:100,h:80},paint),util=new CadEllipseShapeUtil(editor);
    const exported=svg(util.toSvg(ellipse));assert.ok(exported.includes(cadAnalyticPath(ellipse)));assert.ok(exported.includes('stroke-width="7"'));
  });
  it('keeps arc/open-path fill invisible without destroying stored gradients or asset references', () => {
    for(const item of [shape('cad-arc',{radius:50,startAngle:10,endAngle:180},{...VECTOR_DEFAULT_PAINT,fill:'#ff0000',gradient}),
      shape('cad-path',{points:[{x:0,y:0},{x:100,y:30}],closed:false},{...VECTOR_DEFAULT_PAINT,gradient})]) {
      const before=structuredClone(item),paint=cadShapePaint(item);
      assert.equal(paint.fill,'none');assert.equal(paint.gradient,undefined);assert.equal(paint.raster,undefined);assert.deepEqual(item,before);
    }
    const arc=shape('cad-arc',{radius:50,startAngle:0,endAngle:90},{...VECTOR_DEFAULT_PAINT,fill:'#ff0000',gradient});
    assert.ok(!svg(new CadArcShapeUtil(editor).toSvg(arc)).includes('linearGradient'));
  });
  it('clips fills and keeps a copied gradient on exact ellipse geometry', () => {
    const paint:any={...VECTOR_DEFAULT_PAINT,gradient,clips:[{contours:[rectangle(0,0,50,80)],fillRule:'evenodd'}]};
    const ellipse=shape('cad-ellipse',{w:100,h:80},paint),util=new CadEllipseShapeUtil(editor);
    const markup=svg(util.toSvg(ellipse));assert.ok(markup.includes('linearGradient'));assert.ok(markup.includes('clipPath'));assert.ok(markup.includes(cadAnalyticPath(ellipse)));
    const geometry=util.getGeometry(ellipse);assert.equal(geometry.hitTestPoint(new Vec(25,40)),true);assert.equal(geometry.hitTestPoint(new Vec(75,40)),false);
    const clip=cadPaintClipTest({...paint,clips:[{contours:[rectangle(),rectangle(20,20,20,20)],fillRule:'evenodd'}]});
    assert.equal(clip({x:10,y:10}),true);assert.equal(clip({x:30,y:30}),false);
  });
  it('makes filled closed paths pickable inside while retaining outline-only open paths', () => {
    const filled=shape('cad-path',{points:rectangle().nodes.map(n=>({x:n.x,y:n.y})),closed:true},{...VECTOR_DEFAULT_PAINT,fill:'#ffaa00'});
    const util=new CadPathShapeUtil(editor);
    assert.equal(util.getGeometry(filled).hitTestPoint(new Vec(50,40)),true);
    assert.equal(util.getGeometry({...filled,props:{...filled.props,closed:false}}).hitTestPoint(new Vec(50,40)),false);
  });
  it('fits appearance to actual clamped ellipse dimensions and mirrors local paint with geometry', () => {
    const ellipse=shape('cad-ellipse',{w:100,h:80},{...VECTOR_DEFAULT_PAINT,gradient}),util=new CadEllipseShapeUtil(editor);
    const resized:any=util.onResize(ellipse,{newPoint:new Vec(0,0),handle:'bottom_right',mode:'scale_shape',scaleX:-2,scaleY:.5,initialBounds:new Box(0,0,100,80),initialShape:ellipse});
    assert.equal(resized.props.w,200);assert.equal(resized.props.h,40);
    assert.deepEqual(resized.meta.omsVectorPaint.gradient.matrix,[-2,0,0,.5,200,0]);assert.equal(resized.meta.custom,'keep');
    const clamped:any=util.onResize(ellipse,{newPoint:new Vec(0,0),handle:'bottom_right',mode:'scale_shape',scaleX:100000,scaleY:1,initialBounds:new Box(0,0,100,80),initialShape:ellipse});
    assert.equal(clamped.props.w,1_000_000);assert.equal(clamped.meta.omsVectorPaint.gradient.matrix[0],10000);
    assert.deepEqual(ellipse.meta.omsVectorPaint.gradient.matrix,[1,0,0,1,0,0]);
  });
  it('keeps path and arc paint in their signed local resize coordinate systems', () => {
    const path=shape('cad-path',{points:[{x:10,y:20},{x:100,y:80}],closed:false},{...VECTOR_DEFAULT_PAINT,gradient});
    const scaled:any=new CadPathShapeUtil(editor).onResize(path,{scaleX:-2,scaleY:3} as any);
    assert.deepEqual(scaled.props.points,[{x:-20,y:60},{x:-200,y:240}]);assert.deepEqual(scaled.meta.omsVectorPaint.gradient.matrix,[-2,0,0,3,0,0]);
    const arc=shape('cad-arc',{radius:50,startAngle:20,endAngle:100},{...VECTOR_DEFAULT_PAINT,gradient});
    const mirrored:any=new CadArcShapeUtil(editor).onResize(arc,{scaleX:-2,scaleY:2} as any);
    assert.equal(mirrored.props.radius,100);near(mirrored.props.endAngle-mirrored.props.startAngle,80);
    assert.deepEqual(mirrored.meta.omsVectorPaint.gradient.matrix,[-2,0,0,2,0,0]);
  });
  it('uses the same visible paint in PDF/EPS preparation as the SVG renderer', () => {
    const arc=shape('cad-arc',{radius:50,startAngle:0,endAngle:90},{...VECTOR_DEFAULT_PAINT,fill:'#ff0000',gradient,strokeWidth:5,dash:[3,4]});
    const exportEditor:any={...editor,getShapeAndDescendantIds:()=>new Set([arc.id]),getSelectedShapeIds:()=>[arc.id],
      getCurrentPageShapesSorted:()=>[arc],getCurrentPageShapeIds:()=>new Set([arc.id]),getShapeMask:()=>null,getShape:()=>undefined,
      getCurrentPage:()=>({id:'page:one',meta:{omsCad:DEFAULT_CAD_SETTINGS}}),getCurrentPageId:()=> 'page:one'};
    const result=prepareVectorExport(exportEditor,DEFAULT_CAD_SETTINGS,'selected','pdf',true);
    assert.deepEqual(result.omitted,[]);assert.equal(result.paths.length,1);assert.equal(result.paths[0].paint.fill,'none');assert.equal(result.paths[0].paint.gradient,undefined);
    assert.ok(result.paths[0].paint.strokeWidth>0);assert.equal(result.paths[0].paint.dash.length,2);
  });
});
