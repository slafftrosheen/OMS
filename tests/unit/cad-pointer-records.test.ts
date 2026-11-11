import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {Vec} from '@tldraw/tldraw';
import {nodeAt,mapContours} from '../../src/lib/components/canvas/cad-curves';
import {CadBezierShapeUtil} from '../../src/lib/components/canvas/shapes/CadBezierShape';
import {CadBezierTool} from '../../src/lib/components/canvas/CadBezierTool';
import {fixture} from '../helpers/cad-editor';
import {snapCadPoint} from '../../src/lib/components/canvas/cad-snap';

describe('CAD pointer record boundary',()=>{
 it('returns plain 2D points after snapping to a transformed shape endpoint',()=>{
  const f=fixture();f.state.snap=true;
  f.editor.createShape({id:'shape:path',type:'cad-path',x:10,y:20,props:{points:[{x:0,y:0},{x:100,y:100}],closed:false}});
  assert.deepEqual(snapCadPoint(f.editor,new Vec(10.1,20.1,0.5),null),{x:10,y:20});
 });
 it('returns plain 2D points when snap is disabled',()=>{
  assert.deepEqual(snapCadPoint(fixture().editor,new Vec(12,34,0.5),null),{x:12,y:34});
 });
 it('stores a pointer vector as a valid 2D Bézier node',()=>{
  const node=nodeAt(new Vec(12,34,0.5));
  assert.deepEqual(node,{x:12,y:34,inX:0,inY:0,outX:0,outY:0,mode:'corner'});
  CadBezierShapeUtil.props.contours.validate([{closed:false,nodes:[node,nodeAt({x:40,y:50})]}]);
 });
 it('keeps transformed vectors and their pressure out of saved curve records',()=>{
  const mapped=mapContours([{closed:false,nodes:[nodeAt({x:0,y:0}),nodeAt({x:100,y:0})]}],p=>new Vec(p.x+10,p.y+20,0.5));
  CadBezierShapeUtil.props.contours.validate(mapped);
  assert.equal(mapped[0].nodes[1].x,110);
 });
 it('can start a Bézier gesture with the actual tldraw pointer type',()=>{
  const f=fixture(),create=f.editor.createShape;
  f.editor.createShape=(shape:any)=>{if(shape.type==='cad-bezier')CadBezierShapeUtil.props.contours.validate(shape.props.contours);return create(shape);};
  const tool=new CadBezierTool(f.editor);tool.onEnter();
  f.editor.inputs.currentPagePoint=new Vec(240,120,0.5);
  tool.onPointerDown({button:0} as any);
  assert.equal(f.shapes.size,1);
 });
});
