import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {Editor,getIndices} from '@tldraw/tldraw';
import DxfParser from 'dxf-parser';
import {fixture} from '../helpers/cad-editor';
import {applyRadialPlan,prepareRadialPlan,type RadialOptions} from '../../src/lib/components/canvas/drawing-radial';
import {buildCadDxf} from '../../src/lib/components/canvas/cad-dxf';
import {DEFAULT_CAD_SETTINGS,cadPointToCanvas,unitLengthToCanvas} from '../../src/lib/components/canvas/cad-settings';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const base:RadialOptions={center:{x:0,y:0},angle:90,copies:0,rotateCopies:true};
function setup(){
  const f=fixture();let camera={x:12,y:34,z:1};
  Object.assign(f.editor,{
    getCamera:()=>camera,setCamera:(value:any)=>{camera=value;},
    store:{extractingChanges:(fn:()=>void)=>{fn();return {added:{},removed:{},updated:{}};},applyDiff:()=>{},getStoreSnapshot:()=>({shapes:[...f.shapes.values()]})},
    createShapes:(shapes:any[])=>shapes.forEach(s=>f.editor.createShape(s)),createBindings:()=>{},deleteBindings:()=>{},
    duplicateShapes:Editor.prototype.duplicateShapes
  });
  f.editor.createShape({id:'shape:line',type:'cad-path',index:getIndices(1)[0],x:100,y:0,props:{points:[{x:0,y:0},{x:20,y:0}],closed:false},meta:{omsObjectName:'Front',audit:'keep'}});
  f.editor.setSelectedShapes(['shape:line']);return f;
}
describe('precise rotation and circular copies',()=>{
  it('rotates around a custom physical pivot and independently verifies full-size DXF coordinates',()=>{
    const f=setup(),settings={...DEFAULT_CAD_SETTINGS,scale:10,unit:'in' as const,originX:300,originY:500};
    const origin=cadPointToCanvas({x:2,y:3},settings),pivot=cadPointToCanvas({x:1,y:3},settings);
    f.editor.updateShape({id:'shape:line',...origin,props:{points:[{x:0,y:0},{x:unitLengthToCanvas(1,settings),y:0}]}});
    assert.equal(applyRadialPlan(f.editor,prepareRadialPlan(f.editor,{...base,center:pivot})),true);
    const parsed=new DxfParser().parseSync(buildCadDxf(f.editor,'selected',settings).text)!;
    const vertices=(parsed.entities[0] as any).vertices;close(vertices[0].x,25.4);close(vertices[0].y,101.6);close(vertices[1].x,25.4);close(vertices[1].y,127);
    assert.equal(f.marks.length,2);assert.deepEqual(f.editor.getCamera(),{x:12,y:34,z:1});
  });
  it('uses native duplication for an eight-hole bolt pattern without creating a coincident ninth hole',()=>{
    const f=setup();f.editor.deleteShapes(['shape:line']);
    f.editor.createShape({id:'shape:hole',index:getIndices(1)[0],type:'cad-ellipse',x:95,y:-5,props:{w:10,h:10}});f.editor.setSelectedShapes(['shape:hole']);
    const plan=prepareRadialPlan(f.editor,{...base,angle:45,copies:7});assert.equal(plan.generated,7);
    assert.equal(applyRadialPlan(f.editor,plan),true);assert.equal(f.shapes.size,8);
    const parsed=new DxfParser().parseSync(buildCadDxf(f.editor,'selected',DEFAULT_CAD_SETTINGS).text)!;
    assert.equal(parsed.entities.length,8);const centres=new Set<string>();
    for(const entity of parsed.entities as any[]){assert.equal(entity.type,'CIRCLE');close(Math.hypot(entity.center.x,entity.center.y),100*25.4/96);close(entity.radius,5*25.4/96);centres.add(`${entity.center.x.toFixed(4)},${entity.center.y.toFixed(4)}`);}assert.equal(centres.size,8);
  });
  it('retains group ancestry, names and curves, counting selected descendants once',()=>{
    const f=setup(),indices=getIndices(3);f.editor.createShape({id:'shape:group',index:indices[0],type:'group',x:80,y:40,rotation:.4});
    f.editor.updateShape({id:'shape:line',parentId:'shape:group',index:indices[1]});
    f.editor.createShape({id:'shape:curve',index:indices[2],type:'cad-arc',parentId:'shape:group',x:140,y:30,props:{radius:20,startAngle:10,endAngle:120}});
    f.editor.setSelectedShapes(['shape:group','shape:line']);const original=structuredClone(f.editor.getShape('shape:line').props);
    const plan=prepareRadialPlan(f.editor,{...base,copies:2});assert.equal(plan.generated,6);assert.deepEqual(plan.roots,['shape:group']);assert.equal(applyRadialPlan(f.editor,plan),true);
    assert.equal(f.shapes.size,9);assert.equal(f.editor.getSelectedShapeIds().length,3);
    const lines=[...f.shapes.values()].filter(s=>s.type==='cad-path');assert.equal(lines.length,3);
    for(const line of lines){assert.deepEqual(line.props,original);assert.equal(line.meta.audit,'keep');assert.equal(f.editor.getShape(line.parentId).type,'group');}
  });
  it('preserves the orientation and spacing of an ungrouped motif when rotate copies is off',()=>{
    const f=setup();f.editor.createShape({id:'shape:b',index:getIndices(2)[1],type:'cad-path',x:100,y:40,rotation:.3});f.editor.setSelectedShapes(['shape:line','shape:b']);
    const original=f.editor.getSelectedShapes().map((s:any)=>({x:s.x,y:s.y,rotation:s.rotation}));
    const plan=prepareRadialPlan(f.editor,{...base,copies:1,rotateCopies:false});assert.equal(applyRadialPlan(f.editor,plan),true);
    const copies=f.editor.getSelectedShapes().filter((s:any)=>!['shape:line','shape:b'].includes(s.id));
    close(copies[1].x-copies[0].x,original[1].x-original[0].x);close(copies[1].y-copies[0].y,original[1].y-original[0].y);
    close(copies[0].rotation,original[0].rotation);close(copies[1].rotation,original[1].rotation);
    const dx=plan.placements[0][0].x-plan.sourceBox[0].x,dy=plan.placements[0][0].y-plan.sourceBox[0].y;close(copies[0].x-original[0].x,dx);close(copies[0].y-original[0].y,dy);
  });
  it('keeps page-space rotations exact for a selected child inside a rotated parent',()=>{
    const f=setup();f.editor.createShape({id:'shape:parent',index:getIndices(1)[0],type:'group',x:500,y:200,rotation:.65});f.editor.updateShape({id:'shape:line',parentId:'shape:parent'});
    const before=f.editor.getShapePageTransform(f.only()),p=before.point();
    assert.equal(applyRadialPlan(f.editor,prepareRadialPlan(f.editor,base)),true);const after=f.editor.getShapePageTransform(f.only()),a=after.point();
    close(a.x,p.y);close(a.y,-p.x);close(Math.sin(after.rotation()),Math.sin(before.rotation()-Math.PI/2));
  });
  it('refuses stale document, selection or permissions before mutating',()=>{
    for(const change of ['document','selection','readonly','locked']){
      const f=setup(),plan=prepareRadialPlan(f.editor,{...base,copies:1});
      if(change==='document')f.editor.updateShape({id:'shape:line',x:101});else if(change==='selection')f.editor.setSelectedShapes([]);else if(change==='readonly')f.state.isReadonly=true;else f.editor.updateShape({id:'shape:line',isLocked:true});
      assert.equal(applyRadialPlan(f.editor,plan),false);assert.equal(f.shapes.size,1);assert.equal(f.marks.length,0);
    }
  });
  it('rejects protected descendants, bindings, cropped frame content and excessive coordinates',()=>{
    for(const kind of ['form','lock','binding','clip','bounds']){
      const f=setup();if(kind==='form'){f.editor.createShape({id:'shape:group',type:'group'});f.editor.updateShape({id:'shape:line',parentId:'shape:group',type:'profile-7st'});f.editor.setSelectedShapes(['shape:group']);}
      if(kind==='lock')f.editor.updateShape({id:'shape:line',isLocked:true});if(kind==='binding')f.state.bindings=[{id:'binding:a'}];if(kind==='clip')f.editor.updateShape({id:'shape:line',mask:[{x:0,y:0}]});
      assert.throws(()=>prepareRadialPlan(f.editor,{...base,center:kind==='bounds'?{x:900000,y:900000}:base.center}));assert.equal(f.marks.length,0);
    }
  });
  it('rejects invalid counts, zero angles, duplicate full turns and page/payload capacity overflow',()=>{
    const f=setup();for(const patch of [{copies:-1},{copies:1.5},{copies:201},{angle:0},{angle:NaN},{angle:360},{angle:90,copies:4},{center:{x:Infinity,y:0}}])assert.throws(()=>prepareRadialPlan(f.editor,{...base,...patch}));
    f.editor.options.maxShapesPerPage=2;assert.throws(()=>prepareRadialPlan(f.editor,{...base,copies:2}),/radialLimit/);f.editor.options.maxShapesPerPage=4000;
    f.editor.store.getStoreSnapshot=()=>({data:'x'.repeat(1_850_000)});assert.throws(()=>prepareRadialPlan(f.editor,{...base,copies:1}),/radialLimit/);
  });
  it('refuses coincident upright copies instead of silently piling duplicates in place',()=>{
    const f=setup();assert.throws(()=>prepareRadialPlan(f.editor,{...base,center:{x:110,y:0},copies:1,rotateCopies:false}),/radialCoincident/);assert.equal(f.shapes.size,1);
  });
  it('rolls back native partial duplication and restores the original selection in one transaction',()=>{
    const f=setup(),plan=prepareRadialPlan(f.editor,{...base,copies:2});let call=0;
    f.editor.duplicateShapes=function(ids:any){if(++call===2)f.state.failCreation=true;return Editor.prototype.duplicateShapes.call(this,ids);};
    assert.equal(applyRadialPlan(f.editor,plan),false);assert.equal(f.shapes.size,1);assert.deepEqual(f.editor.getSelectedShapeIds(),['shape:line']);close(f.only().x,100);
  });
  it('does not rely on the native copy selection order to map individual objects',()=>{
    const f=setup();f.editor.createShape({id:'shape:b',index:getIndices(2)[1],type:'cad-path',x:200,y:30});f.editor.setSelectedShapes(['shape:line','shape:b']);
    const native=f.editor.duplicateShapes;f.editor.duplicateShapes=function(ids:any){native.call(this,ids);this.setSelectedShapes([...this.getSelectedShapeIds()].reverse());};
    assert.equal(applyRadialPlan(f.editor,prepareRadialPlan(f.editor,{...base,copies:1})),true);
    const result=f.editor.getSelectedShapes().filter((s:any)=>!['shape:line','shape:b'].includes(s.id)).map((s:any)=>[Math.round(s.x),Math.round(s.y)]).sort((a:any,b:any)=>a[0]-b[0]);assert.deepEqual(result,[[0,-100],[30,-200]]);
  });
});
