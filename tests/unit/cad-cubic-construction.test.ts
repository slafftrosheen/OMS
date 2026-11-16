import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { cubicConstructionPoints, MAX_CUBIC_CONSTRUCTION_SOURCES } from '../../src/lib/components/canvas/cad-cubic-construction';
import { cubicAt, nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { findCadSnap, cadSnapIndicator } from '../../src/lib/components/canvas/cad-snap';
import { DEFAULT_CAD_SNAP_SETTINGS } from '../../src/lib/components/canvas/cad-snap-settings';
import { CadPolylineTool } from '../../src/lib/components/canvas/CadPolylineTool';
import { CadDimensionTool, CadCircleTool } from '../../src/lib/components/canvas/CadTwoPointTool';
import { polylineSession } from '../../src/lib/components/canvas/cad-polyline-draft';
import type { CadPoint } from '../../src/lib/components/canvas/cad-settings';

const parabola = [{x:-1,y:1},{x:-1/3,y:-1/3},{x:1/3,y:-1/3},{x:1,y:1}];
const inflection = [{x:-1,y:-1},{x:-1/3,y:1},{x:1/3,y:-1},{x:1,y:1}];
const near = (a:number,b:number,e=1e-8) => assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
function pointNear(a:CadPoint|undefined,b:CadPoint,e=1e-8){assert.ok(a);near(a.x,b.x,e);near(a.y,b.y,e);}
const scale = (p:CadPoint,n:number) => ({x:p.x*n,y:p.y*n});
function setup(points=parabola.map(p=>scale(p,100)),angle=0,origin={x:0,y:0}) {
  const shapes = new Map<string,any>(),state={zoom:1,snap:true,isReadonly:false,tool:'select'};
  const opts={...DEFAULT_CAD_SNAP_SETTINGS,endpoints:false,centers:false,quadrants:false,perpendicular:false,tangent:true};
  const matrix={rotation:()=>angle,applyToPoint:(p:CadPoint)=>({x:origin.x+p.x*Math.cos(angle)-p.y*Math.sin(angle),y:origin.y+p.x*Math.sin(angle)+p.y*Math.cos(angle)})};
  const make=(id:string,list:CadPoint[])=>({id,type:'cad-bezier',x:0,y:0,rotation:0,opacity:1,parentId:'page:one',meta:{},
    props:{contours:[{closed:false,nodes:[{...nodeAt(list[0]),outX:list[1].x-list[0].x,outY:list[1].y-list[0].y},
      {...nodeAt(list[3]),inX:list[2].x-list[3].x,inY:list[2].y-list[3].y}]}]}});
  shapes.set('shape:reference',make('shape:reference',points));let markers:any[]=[],selected:string[]=[];
  const snapshots=new Map<string,any>();
  const editor:any={
    user:{getIsSnapMode:()=>state.snap},inputs:{ctrlKey:false,shiftKey:false,currentPagePoint:{x:0,y:0}},
    getCurrentPage:()=>({id:'page:one',meta:{omsCadSnap:opts}}),getCurrentPageId:()=> 'page:one',
    getCurrentPageShapesSorted:()=>[...shapes.values()],getCurrentPageShapeIds:()=>new Set(shapes.keys()),
    getDocumentSettings:()=>({gridSize:10}),getZoomLevel:()=>state.zoom,getShapePageTransform:()=>matrix,
    getShapePageBounds:()=>null,getShapeMask:(id:string)=>shapes.get(id)?.mask,
    getShape:(id:string)=>shapes.get(id),getInstanceState:()=>state,getCurrentToolId:()=>state.tool,
    setCurrentTool:(v:string)=>state.tool=v,selectNone:()=>selected=[],setSelectedShapes:(v:string[])=>selected=v,
    getSelectedShapeIds:()=>selected,setCursor(){},getStyleForNextShape:()=> 'black',options:{maxShapesPerPage:4000},
    createShape:(s:any)=>shapes.set(s.id,{opacity:1,meta:{},...s}),
    updateShape:(p:any)=>{const s=shapes.get(p.id);shapes.set(p.id,{...s,...p,props:{...s.props,...p.props}});},
    mark:(id:string)=>snapshots.set(id,structuredClone([...shapes])),
    bailToMark:(id:string)=>{shapes.clear();for(const [key,value]of snapshots.get(id)??[])shapes.set(key,value);},
    snaps:{getIndicators:()=>markers,setIndicators:(v:any[])=>markers=v,clearIndicators:()=>markers=[]},
  };
  return {editor,shapes,state,opts,matrix,make};
}
function click(tool:any,f:ReturnType<typeof setup>,point:CadPoint){f.editor.inputs.currentPagePoint=point;tool.onPointerDown({button:0});}

describe('cubic construction geometry',()=>{
  it('finds both finite parabola tangents without tessellating',()=>{
    const results=cubicConstructionPoints({x:0,y:-.25},parabola,'tangent');
    assert.equal(results.length,2);pointNear(results[0],{x:-.5,y:.25});pointNear(results[1],{x:.5,y:.25});
  });
  it('retains all three perpendicular feet, including the central maximum',()=>{
    const results=cubicConstructionPoints({x:0,y:1},parabola,'perpendicular');
    assert.equal(results.length,3);
    pointNear(results[0],{x:-Math.SQRT1_2,y:.5});pointNear(results[1],{x:0,y:0});pointNear(results[2],{x:Math.SQRT1_2,y:.5});
  });
  it('finds an isolated even-multiplicity tangent at an inflection',()=>{
    const results=cubicConstructionPoints({x:1,y:0},inflection,'tangent');
    assert.equal(results.length,1);pointNear(results[0],{x:0,y:0});
  });
  it('does not invent tangency at a nearby noncontact critical point',()=>{
    for(const delta of [1e-5,1e-7,1e-9])assert.deepEqual(cubicConstructionPoints({x:1,y:-delta},inflection,'tangent'),[]);
    const results=cubicConstructionPoints({x:1,y:1e-7},inflection,'tangent');assert.equal(results.length,2);
    assert.ok(results[0].x<0&&results[1].x>0);
  });
  it('includes regular endpoint contacts and rejects roots outside the drawn segment',()=>{
    const results=cubicConstructionPoints({x:0,y:-1},parabola,'tangent');
    assert.equal(results.length,2);pointNear(results[0],parabola[0]);pointNear(results[1],parabola[3]);
    assert.deepEqual(cubicConstructionPoints({x:0,y:-4},parabola,'tangent'),[]);
    assert.deepEqual(cubicConstructionPoints({x:0,y:0},parabola,'tangent'),[]);
  });
  it('rejects stationary cusps, degenerate curves, invalid inputs and ambiguous collinear tangency',()=>{
    const cusp=[{x:0,y:0},{x:1,y:0},{x:1,y:0},{x:0,y:0}];
    assert.deepEqual(cubicConstructionPoints({x:.75,y:2},cusp,'perpendicular'),[]);
    assert.deepEqual(cubicConstructionPoints({x:3,y:3},Array(4).fill({x:2,y:2}),'tangent'),[]);
    assert.deepEqual(cubicConstructionPoints({x:Infinity,y:0},parabola,'tangent'),[]);
    assert.deepEqual(cubicConstructionPoints({x:0,y:0},parabola.slice(0,3),'tangent'),[]);
    const line=[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}];
    assert.deepEqual(cubicConstructionPoints({x:4,y:0},line,'tangent'),[]);
    pointNear(cubicConstructionPoints({x:2,y:4},line,'perpendicular')[0],{x:2,y:0});
  });
  it('is invariant under traversal reversal, translation, scale and rotation',()=>{
    for(const factor of [0.001,1,1000])for(const angle of [-.71,0,1.2]){
      const map=(p:CadPoint)=>({x:12345+factor*(p.x*Math.cos(angle)-p.y*Math.sin(angle)),y:-7890+factor*(p.x*Math.sin(angle)+p.y*Math.cos(angle))});
      for(const reversed of [false,true]){
        const points=parabola.map(map);if(reversed)points.reverse();
        const results=cubicConstructionPoints(map({x:0,y:-.25}),points,'tangent');
        assert.equal(results.length,2);for(const expected of [{x:-.5,y:.25},{x:.5,y:.25}].map(map))assert.ok(results.some(p=>Math.hypot(p.x-expected.x,p.y-expected.y)<Math.max(1e-7,factor*1e-9)));
      }
    }
  });
  it('verifies analytic normals and tangents across a nonquadratic cubic',()=>{
    const points=[{x:-100,y:40},{x:80,y:-120},{x:-90,y:180},{x:150,y:30}];
    for(const t of [.1,.23,.5,.79,.94]){
      const p=cubicAt(points,t),u=1-t;
      const d={x:3*u*u*(points[1].x-points[0].x)+6*u*t*(points[2].x-points[1].x)+3*t*t*(points[3].x-points[2].x),
        y:3*u*u*(points[1].y-points[0].y)+6*u*t*(points[2].y-points[1].y)+3*t*t*(points[3].y-points[2].y)};
      for(const kind of ['tangent','perpendicular'] as const){
        const v=kind==='tangent'?d:{x:-d.y,y:d.x},anchor={x:p.x+v.x*.3,y:p.y+v.y*.3};
        const found=cubicConstructionPoints(anchor,points,kind);
        assert.ok(found.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<1e-7));
      }
    }
  });
});

describe('cubic construction snap integration',()=>{
  it('offers page-space tangent and perpendicular candidates under independent toggles',()=>{
    const f=setup(undefined,.61,{x:250,y:-125}),map=f.matrix.applyToPoint;
    const expected=map({x:50,y:25}),anchor=map({x:0,y:-25}),query={x:expected.x+1,y:expected.y-1};
    const hit=findCadSnap(f.editor,query,null,anchor);assert.equal(hit?.kind,'tangent');pointNear(hit?.point,expected);
    f.opts.tangent=false;f.opts.perpendicular=true;
    const foot=map({x:Math.SQRT1_2*100,y:50});
    assert.equal(findCadSnap(f.editor,foot,null,map({x:0,y:100}))?.kind,'perpendicular');
  });
  it('keeps discrete construction above nearest/grid and respects missing anchors, modifiers, distance and masks',()=>{
    const f=setup(),expected={x:50,y:25},anchor={x:0,y:-25};
    f.opts.nearest=true;f.opts.grid=true;
    assert.equal(findCadSnap(f.editor,{x:51,y:24},null,anchor)?.kind,'tangent');
    f.opts.nearest=false;f.opts.grid=false;
    assert.equal(findCadSnap(f.editor,expected,null),null);
    f.editor.inputs.ctrlKey=true;assert.equal(findCadSnap(f.editor,expected,null,anchor),null);f.editor.inputs.ctrlKey=false;
    f.state.zoom=100;assert.equal(findCadSnap(f.editor,{x:51,y:24},null,anchor),null);f.state.zoom=1;
    assert.equal(findCadSnap(f.editor,expected,'shape:reference' as any,anchor),null);
    f.shapes.get('shape:reference').mask=[{x:0,y:0}];assert.equal(findCadSnap(f.editor,expected,null,anchor),null);
    delete f.shapes.get('shape:reference').mask;f.shapes.get('shape:reference').opacity=0;
    assert.equal(findCadSnap(f.editor,expected,null,anchor),null);
  });
  it('shares a fixed nearby-cubic workload cap and never manufactures a grid snap after exhaustion',()=>{
    const f=setup();f.shapes.clear();
    const points=parabola.map(p=>scale(p,100));
    for(let i=0;i<MAX_CUBIC_CONSTRUCTION_SOURCES;i++)f.shapes.set('shape:'+i,f.make('shape:'+i,points));
    f.shapes.set('shape:target',f.make('shape:target',points.map(p=>({x:p.x,y:p.y+50}))));
    assert.equal(findCadSnap(f.editor,{x:50,y:75},null,{x:0,y:25}),null);
    f.shapes.delete('shape:0');
    const hit=findCadSnap(f.editor,{x:50,y:75},null,{x:0,y:25});
    assert.equal(hit?.kind,'tangent');pointNear(hit?.point,{x:50,y:75});
  });
  it('keeps opt-in defaults unchanged and does not alter artwork while inspecting targets',()=>{
    assert.equal(DEFAULT_CAD_SNAP_SETTINGS.perpendicular,false);assert.equal(DEFAULT_CAD_SNAP_SETTINGS.tangent,false);
    const f=setup(),before=structuredClone([...f.shapes]);
    findCadSnap(f.editor,{x:50,y:25},null,{x:0,y:-25});assert.deepEqual([...f.shapes],before);
  });
  it('uses the actual polyline anchor, preserves exact numeric entry, and rolls back cancellation',()=>{
    const f=setup(),tool=new CadPolylineTool(f.editor,undefined as any);tool.onEnter();
    click(tool,f,{x:0,y:-25});click(tool,f,{x:51,y:24});
    pointNear(polylineSession(f.editor).state.get()!.points[1],{x:50,y:25});
    assert.equal(cadSnapIndicator(f.editor).get()?.kind,'tangent');
    polylineSession(f.editor).controller!.back();assert.equal(cadSnapIndicator(f.editor).get(),null);
    polylineSession(f.editor).controller!.add({x:51,y:24});
    pointNear(polylineSession(f.editor).state.get()!.points[1],{x:51,y:24});
    tool.onCancel();assert.equal(f.shapes.size,1);
  });
  it('uses first dimension point while circle radius and Shift constraints remain independent',()=>{
    for(const Tool of [CadDimensionTool,CadCircleTool]){
      const f=setup(),tool=new Tool(f.editor,undefined as any);tool.onEnter();click(tool,f,{x:0,y:-25});click(tool,f,{x:51,y:24});
      const result=[...f.shapes.values()].find(s=>s.id!=='shape:reference');assert.ok(result);
      if(Tool===CadDimensionTool)pointNear({x:result.x+result.props.endX,y:result.y+result.props.endY},{x:50,y:25});
      else near(result.props.w/2,Math.hypot(51,49));
    }
    const f=setup(),tool=new CadPolylineTool(f.editor,undefined as any);tool.onEnter();click(tool,f,{x:0,y:-25});
    f.editor.inputs.shiftKey=true;click(tool,f,{x:51,y:24});
    assert.ok(Math.hypot(polylineSession(f.editor).state.get()!.points[1].x-50,polylineSession(f.editor).state.get()!.points[1].y-25)>0.01);
    f.state.isReadonly=true;tool.onPointerMove();assert.equal(f.shapes.size,1);
  });
});
