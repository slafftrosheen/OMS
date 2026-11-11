import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {fixture} from '../helpers/cad-editor';
import {threePointGeometry,cadConstruction} from '../../src/lib/components/canvas/cad-construction';
import {CadArcThreePointTool,CadCircleThreePointTool} from '../../src/lib/components/canvas/CadThreePointTool';
import {CadCircleTool} from '../../src/lib/components/canvas/CadTwoPointTool';
import {CadArcShapeUtil} from '../../src/lib/components/canvas/shapes/CadShapes';
import {cubicLength,measureCadSelection} from '../../src/lib/components/canvas/cad-measurements';
import {nodeAt} from '../../src/lib/components/canvas/cad-curves';
import {transformDrawingSelection} from '../../src/lib/components/canvas/drawing-commands';
import {transformCadSelection} from '../../src/lib/components/canvas/cad-geometry';
import {buildCadDxf} from '../../src/lib/components/canvas/cad-dxf';
import {DEFAULT_CAD_SETTINGS,canvasLengthToUnit} from '../../src/lib/components/canvas/cad-settings';

const close=(a:number,b:number,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const polar=(a:number)=>({x:100+50*Math.cos(a*Math.PI/180),y:200-50*Math.sin(a*Math.PI/180)});

describe('three-point CAD construction',()=>{
 it('retains minor and major arc loci for either click direction, including a zero-degree crossing',()=>{
  for(const [a,b,c,sweep] of [[0,45,90,90],[90,45,0,90],[10,180,350,340],[350,180,10,340],[350,0,10,20]]){
   const geometry=threePointGeometry('arc',polar(a),polar(b),polar(c))!;
   assert.equal(geometry.type,'cad-arc');close(geometry.x,100);close(geometry.y,200);
   close(geometry.props.radius!,50);close(geometry.props.endAngle!-geometry.props.startAngle!,sweep);
  }
 });
 it('constructs a circle accurately far from the origin and rejects degenerate or excessive geometry',()=>{
  const geometry=threePointGeometry('circle',{x:900010,y:900000},{x:900000,y:899990},{x:899990,y:900000})!;
  close(geometry.x,899990);close(geometry.y,899990);close(geometry.props.w!,20);
  for(const points of [[{x:0,y:0},{x:1,y:0},{x:2,y:0}],[{x:0,y:0},{x:0,y:0},{x:1,y:1}],[{x:0,y:0},{x:100,y:1e-10},{x:200,y:0}],[{x:NaN,y:0},{x:1,y:2},{x:3,y:0}]])
   assert.equal(threePointGeometry('arc',points[0],points[1],points[2]),null);
 });
 it('clears a stale preview for collinear points, supports Backspace, and cancels all construction state',()=>{
  const f=fixture(),tool=new CadArcThreePointTool(f.editor,undefined as any);tool.onEnter();
  const click=(x:number,y:number)=>{f.editor.inputs.currentPagePoint={x,y};tool.onPointerDown({button:0} as any);};
  click(0,0);click(50,-50);f.editor.inputs.currentPagePoint={x:100,y:0};tool.onPointerMove();assert.equal(f.shapes.size,1);
  f.editor.inputs.currentPagePoint={x:100,y:-100};tool.onPointerMove();assert.equal(f.shapes.size,0);
  tool.onKeyDown({key:'Enter'} as any);assert.equal(f.shapes.size,0);assert.equal(cadConstruction(f.editor).get()!.points.length,2);
  tool.onKeyDown({key:'Backspace'} as any);assert.equal(cadConstruction(f.editor).get()!.points.length,1);
  click(50,50);f.editor.inputs.currentPagePoint={x:100,y:0};tool.onPointerMove();assert.equal(f.shapes.size,1);
  tool.onKeyDown({key:'Escape'} as any);assert.equal(f.shapes.size,0);assert.equal(cadConstruction(f.editor).get(),null);
 });
 it('creates native analytic shapes that export as ARC/CIRCLE and leaves guides out of the document',()=>{
  for(const [Tool,entity] of [[CadArcThreePointTool,'ARC'],[CadCircleThreePointTool,'CIRCLE']] as const){
   const f=fixture(),tool=new Tool(f.editor,undefined as any);tool.onEnter();
   for(const angle of [0,45,90]){f.editor.inputs.currentPagePoint=polar(angle);tool.onPointerDown({button:0} as any);}
   assert.equal(f.shapes.size,1);assert.equal(cadConstruction(f.editor).get(),null);assert.equal(f.state.tool,'select');
   const result=buildCadDxf(f.editor,'selected',DEFAULT_CAD_SETTINGS);assert.equal(result.entities,1);assert.equal(result.omitted.length,0);
   const lines=result.text.split(/\r?\n/);assert.ok(lines.includes(entity));assert.ok(!lines.includes('SPLINE'));assert.ok(!lines.includes('LWPOLYLINE'));
  }
 });
 it('cancels both construction tools if permission becomes read-only before Enter',()=>{
  for(const Tool of [CadCircleTool,CadArcThreePointTool]){
   const f=fixture(),tool=new Tool(f.editor,undefined as any);tool.onEnter();
   f.editor.inputs.currentPagePoint={x:0,y:0};tool.onPointerDown({button:0} as any);
   if(Tool===CadArcThreePointTool){f.editor.inputs.currentPagePoint={x:50,y:-50};tool.onPointerDown({button:0} as any);}
   f.editor.inputs.currentPagePoint={x:100,y:0};tool.onPointerMove();assert.equal(f.shapes.size,1);
   f.state.isReadonly=true;tool.onKeyDown({key:'Enter'} as any);assert.equal(f.shapes.size,0);
  }
 });
 it('keeps numeric arc rotation available when corner targets are hidden',()=>{
  const f=fixture();f.editor.createShape({id:'shape:arc',type:'cad-arc'});f.editor.setSelectedShapes(['shape:arc']);
  assert.equal(transformDrawingSelection(f.editor,'rotation',45),true);close(f.editor.getShape('shape:arc').rotation,Math.PI/4);
  assert.equal(transformCadSelection(f.editor,'rotation',90,DEFAULT_CAD_SETTINGS,'bottom-left',true),true);close(Math.sin(f.editor.getShape('shape:arc').rotation),-1);
 });
 it('edits arc angles and radius through handles, retaining the other endpoint and respecting locks',()=>{
  const f=fixture();f.editor.createShape({id:'shape:arc',type:'cad-arc',props:{radius:50,startAngle:350,endAngle:450}});
  const shape=f.editor.getShape('shape:arc'),util=new CadArcShapeUtil(f.editor),handles=util.getHandles(shape);
  assert.deepEqual(handles.map(h=>h.id),['start','end','radius']);
  const update=util.onHandleDrag(shape,{handle:{...handles[1],x:50,y:0}} as any);assert.ok(update);close(update.props!.endAngle!,360);close(update.props!.startAngle!,350);
  const radius=util.onHandleDrag(shape,{handle:{...handles[2],x:30,y:40}} as any);assert.ok(radius);close(radius.props!.radius!,50);
  f.editor.inputs.shiftKey=true;
  const snapped=util.onHandleDrag(shape,{handle:{...handles[1],x:50*Math.cos(.5),y:-50*Math.sin(.5)}} as any);assert.ok(snapped);close(snapped.props!.endAngle!,390);
  f.editor.updateShape({id:shape.id,isLocked:true});assert.equal(util.onHandleDrag(f.editor.getShape(shape.id),{handle:handles[0]} as any),undefined);
 });
});

describe('geometry measurements',()=>{
 it('includes geometry inside a production frame and excludes partially clipped paths',()=>{
  const f=fixture();const mask=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
  f.editor.createShape({id:'shape:circle',type:'cad-ellipse',x:10,y:10,mask,props:{w:40,h:40}});f.editor.setSelectedShapes(['shape:circle']);
  close(measureCadSelection(f.editor,null).length,40*Math.PI);
  f.editor.updateShape({id:'shape:circle',x:80});assert.equal(measureCadSelection(f.editor,null).omitted,1);
 });
 it('bounds a quadratic-as-cubic length against its analytic integral, including backtracking controls',()=>{
  const length=cubicLength([{x:0,y:0},{x:1/3,y:0},{x:2/3,y:1/3},{x:1,y:1}],1e-8);
  close(length,Math.sqrt(5)/2+Math.asinh(2)/4,1e-8);
  close(cubicLength([{x:0,y:0},{x:10,y:0},{x:-10,y:0},{x:0,y:0}],1e-6),20/Math.sqrt(3),1e-6);
 });
 it('measures circle/arc radius, circumference and sweep independently of rotation and physical display scale',()=>{
  const f=fixture();f.editor.createShape({id:'shape:arc',type:'cad-arc',rotation:.7,props:{radius:50,startAngle:350,endAngle:450}});f.editor.setSelectedShapes(['shape:arc']);
  const settings={...DEFAULT_CAD_SETTINGS,scale:10};const m=measureCadSelection(f.editor,settings);
  close(m.length,50*100*Math.PI/180);assert.equal(m.radius,50);assert.equal(m.sweep,100);assert.equal(m.open,1);assert.equal(m.approximate,false);
  close(canvasLengthToUnit(m.length,settings),m.length*25.4/96*10);
 });
 it('sums hole and outer contour lengths once when a group and its child are both selected',()=>{
  const f=fixture();f.editor.createShape({id:'shape:group',type:'group',rotation:.5});
  f.editor.createShape({id:'shape:curve',type:'cad-bezier',parentId:'shape:group',props:{contours:[
   {closed:true,nodes:[[0,0],[4,0],[4,4],[0,4]].map(([x,y])=>nodeAt({x,y}))},
   {closed:true,nodes:[[1,1],[3,1],[3,3],[1,3]].map(([x,y])=>nodeAt({x,y}))}
  ]}});f.editor.setSelectedShapes(['shape:group','shape:curve']);
  const m=measureCadSelection(f.editor,null);close(m.length,24);assert.equal(m.closed,2);assert.equal(m.measured,1);assert.equal(m.omitted,0);
 });
 it('integrates an eccentric ellipse without converting stored geometry and discloses skipped objects',()=>{
  const f=fixture();f.editor.createShape({id:'shape:ellipse',type:'cad-ellipse',props:{w:20,h:10}});f.editor.createShape({id:'shape:note',type:'text',props:{text:'annotation'}});
  f.editor.setSelectedShapes(['shape:ellipse','shape:note']);const before=JSON.stringify([...f.shapes.values()]);f.state.isReadonly=true;
  const m=measureCadSelection(f.editor,DEFAULT_CAD_SETTINGS);close(m.length,48.44224110273838,.001);assert.equal(m.approximate,true);assert.equal(m.omitted,1);assert.equal(JSON.stringify([...f.shapes.values()]),before);
  f.editor.updateShape({id:'shape:ellipse',meta:{omsVectorPaint:{clips:[{}]}}});assert.equal(measureCadSelection(f.editor,null).measured,0);
 });
});
