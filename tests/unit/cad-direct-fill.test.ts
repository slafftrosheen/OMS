import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { VECTOR_DEFAULT_PAINT } from '../../src/lib/components/canvas/cad-paint';
import { DEFAULT_CAD_SETTINGS, cadMmPerPixel } from '../../src/lib/components/canvas/cad-settings';
import { cadAnalyticPath } from '../../src/lib/components/canvas/cad-shape-appearance';
import { curveFillGeometry, updateCurveFill } from '../../src/lib/components/canvas/curve-fill';
import { prepareGradientFill, applyGradientFill, removeGradientFill, gradientFillSelection } from '../../src/lib/components/canvas/gradient-fill';
import { prepareMaterialTexture, applyMaterialTexture, removeMaterialTexture, getMaterialTextureDraft, materialTextureSelection } from '../../src/lib/components/canvas/material-texture';
import { drawingMaterialOptions, readDrawingMaterial } from '../../src/lib/components/canvas/material-library';
import { prepareMaterialAlignment, applyMaterialAlignment } from '../../src/lib/components/canvas/material-alignment';

const points = [{x:-20,y:10},{x:180,y:10},{x:180,y:110},{x:-20,y:110}];
const shape = (type: string, id = 'shape:one'): any => ({id,type,parentId:'page:one',x:17,y:31,rotation:.3,opacity:.7,isLocked:false,
  props:type==='cad-ellipse'?{w:200,h:100,color:'black'}:type==='cad-path'?{points:structuredClone(points),closed:true,color:'black'}:
  {contours:[{closed:true,nodes:points.map(nodeAt)}],fillRule:'evenodd',color:'black'},
  meta:{custom:'retained',omsVectorPaint:{...VECTOR_DEFAULT_PAINT,fill:'#eeeeee',stroke:'#123456',strokeWidth:3,dash:[4,2],fillOpacity:.8}}});
function fixture(items = [shape('cad-ellipse')]) {
  const shapes = new Map(items.map(s=>[s.id,structuredClone(s)])); let selected=items.map(s=>s.id);
  const state={isReadonly:false,bindings:[] as any[],brokenUpdate:false,budget:''};
  const page={id:'page:one',meta:{omsCad:{...DEFAULT_CAD_SETTINGS}}};
  const marks:any[]=[];
  const editor:any={
    getShape:(id:string)=>shapes.get(id),getOnlySelectedShape:()=>selected.length===1?shapes.get(selected[0]):null,
    getSelectedShapeIds:()=>selected,setSelectedShapes:(ids:string[])=>selected=ids,
    getCurrentPage:()=>page,getCurrentPageShapesSorted:()=>[...shapes.values()],getCurrentPageShapeIds:()=>new Set(shapes.keys()),
    getInstanceState:()=>state,getShapeAndDescendantIds:(ids:string[])=>new Set(ids),
    isShapeOrAncestorLocked:(s:any):boolean=>!!s&&(s.isLocked||editor.isShapeOrAncestorLocked(shapes.get(s.parentId))),
    getShapeMask:(id:string)=>shapes.get(id)?.mask,getBindingsInvolvingShape:()=>state.bindings,
    complete(){},setCurrentTool(){},mark:(id:string)=>marks.push({id,snapshot:structuredClone([...shapes])}),
    run:(fn:()=>void)=>fn(),bailToMark:(id:string)=>{const i=marks.findIndex(m=>m.id===id);shapes.clear();for(const [key,value]of marks[i].snapshot)shapes.set(key,value);marks.splice(i);},
    updateShape:(u:any)=>{const s=shapes.get(u.id);shapes.set(u.id,{...s,...u,props:{...s.props,...u.props},meta:{...s.meta,...u.meta,...(state.brokenUpdate?{bad:true}:{})}});},
    updateShapes:(updates:any[])=>updates.forEach(editor.updateShape),
    getShapePageTransform:(s:any)=>{const parent=shapes.get(s.parentId);const local=(p:any)=>({x:s.x+p.x*Math.cos(s.rotation)-p.y*Math.sin(s.rotation),y:s.y+p.x*Math.sin(s.rotation)+p.y*Math.cos(s.rotation)});return {applyToPoint:(p:any)=>parent?editor.getShapePageTransform(parent).applyToPoint(local(p)):local(p)};},
    store:{getStoreSnapshot:()=>({shapes:[...shapes.values()],padding:state.budget})},
  };
  return {editor,shapes,state,marks,page,only:()=>shapes.get(selected[0])};
}
const gradient={type:'linear' as const,angle:37,opacity:65,stops:[{offset:0,color:'#ff0000'},{offset:1,color:'#0000ff'}]};
const image={raster:{width:2,height:1,png:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAD91JpzAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',rgb:'eJz7z8AAAAMBAQA='}};
const texture={scale:130,angle:37,opacity:65};
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

describe('direct analytic CAD fills',()=>{
  it('fits gradients to exact ellipse and closed polyline bounds without changing geometry or object metadata',()=>{
    for(const type of ['cad-ellipse','cad-path','cad-bezier']){
      const f=fixture([shape(type)]),before=structuredClone(f.only()),plan=prepareGradientFill(f.editor,gradient);
      if(type==='cad-ellipse'){assert.equal(plan.data,'M0,50 A100,50 0 1 0 200,50 A100,50 0 1 0 0,50 Z');assert.deepEqual(plan.bounds,{x:0,y:0,w:200,h:100});}
      if(type==='cad-path')assert.equal(plan.data,cadAnalyticPath(before));
      assert.equal(applyGradientFill(f.editor,plan),true);assert.deepEqual(f.only().props,before.props);
      for(const key of ['type','x','y','rotation','opacity','parentId'])assert.equal(f.only()[key],before[key]);
      for(const key of ['stroke','strokeWidth','dash','fill'])assert.deepEqual(f.only().meta.omsVectorPaint[key],before.meta.omsVectorPaint[key]);
      assert.equal(f.only().meta.custom,'retained');assert.equal(f.marks.length,2);
      assert.equal(removeGradientFill(f.editor),true);assert.equal(f.only().meta.omsVectorPaint.gradient,undefined);
      f.editor.bailToMark(f.marks[0].id);assert.deepEqual(f.only(),before);
    }
  });
  it('fits radial ellipses and covers every material bounds corner without changing image proportions',()=>{
    const f=fixture(),g=prepareGradientFill(f.editor,{...gradient,type:'radial'});
    assert.deepEqual(g.paint.gradient!.matrix,[100,0,0,50,100,50]);
    for(const angle of [0,37,90,-173]){
      const p=prepareMaterialTexture(f.editor,image,{...texture,angle,scale:100});
      const [a,b,c,d,e,v]=p.paint.raster!.matrix,det=a*d-b*c;
      close(Math.hypot(a,b)/2,Math.hypot(c,d));
      for(const [x,y]of [[0,0],[200,0],[200,100],[0,100]]){
        const u=(d*(x-e)-c*(y-v))/det,w=(-b*(x-e)+a*(y-v))/det;
        assert.ok(u>=-1e-9&&u<=1+1e-9&&w>=-1e-9&&w<=1+1e-9);
      }
      assert.equal(p.data,cadAnalyticPath(f.only()));
    }
  });
  it('applies, reloads, reuses and removes analytic materials with one undo transaction and unchanged conics',()=>{
    const f=fixture(),before=structuredClone(f.only()),p=prepareMaterialTexture(f.editor,image,texture);
    assert.equal(applyMaterialTexture(f.editor,p),true);assert.deepEqual(f.only().props,before.props);
    assert.equal(materialTextureSelection(f.editor)!.hasTexture,true);assert.equal(f.marks.length,2);
    const saved=JSON.parse(JSON.stringify(f.only()));f.shapes.set(saved.id,saved);
    assert.equal(getMaterialTextureDraft(f.editor)!.angle,37);
    saved.isLocked=true;
    assert.deepEqual(drawingMaterialOptions(f.editor).map(s=>s.id),[saved.id]);
    assert.equal(readDrawingMaterial(f.editor,saved.id)!.scale,130);
    assert.equal(getMaterialTextureDraft(f.editor),null);
    saved.isLocked=false;assert.equal(removeMaterialTexture(f.editor),true);
    assert.deepEqual(f.only().props,before.props);assert.equal(f.only().meta.omsMaterialTexture,null);
    f.editor.bailToMark(f.marks[0].id);assert.deepEqual(f.only(),before);
  });
  it('preserves external asset references while alternating materials and gradients',()=>{
    const f=fixture([shape('cad-path')]),fileId='11111111-1111-1111-1111-111111111111';
    const draft={raster:{width:80,height:50,external:true,hasAlpha:true,fileId,png:`/api/files/${fileId}/download`}};
    assert.equal(applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,draft,texture)),true);
    const loaded=getMaterialTextureDraft(f.editor)!;assert.equal(loaded.draft.raster.fileId,fileId);
    assert.equal(applyGradientFill(f.editor,prepareGradientFill(f.editor,gradient)),true);
    assert.equal(f.only().meta.omsVectorPaint.raster,undefined);assert.equal(f.only().meta.omsMaterialTexture,null);
    assert.equal(applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,loaded.draft,texture)),true);
    assert.equal(f.only().meta.omsVectorPaint.gradient,undefined);assert.equal(f.only().meta.omsVectorPaint.raster.fileId,fileId);
  });
  it('rejects open analytic paths/arcs, degenerate shapes and invalid geometry without erasing latent paint',()=>{
    const open=shape('cad-path');open.props.closed=false;
    const arc={...shape('cad-arc'),props:{radius:80,startAngle:0,endAngle:180,color:'black'}};
    const flat=shape('cad-path');flat.props.points=[{x:0,y:0},{x:10,y:0}];
    const invalid=shape('cad-ellipse');invalid.props.w=NaN;
    for(const item of [open,arc,flat,invalid]){
      const f=fixture([item]),before=structuredClone(f.only());
      assert.equal(gradientFillSelection(f.editor),null);
      assert.throws(()=>prepareGradientFill(f.editor,gradient));
      assert.throws(()=>prepareMaterialTexture(f.editor,image,texture));
      assert.deepEqual(f.only(),before);assert.equal(f.marks.length,0);
    }
  });
  it('enforces readonly, parent locks, protected ancestry, masks, clipping and binding guards again on apply',()=>{
    const guards=[
      (f:any)=>{f.state.isReadonly=true;},
      (f:any)=>{f.only().isLocked=true;},
      (f:any)=>{f.only().mask=[{x:0,y:0}];},
      (f:any)=>{f.state.bindings=[{}];},
      (f:any)=>{f.only().meta.omsVectorPaint.clips=[{contours:[{closed:true,nodes:points.map(nodeAt)}],fillRule:'evenodd'}];},
      (f:any)=>{f.shapes.set('shape:parent',{...shape('group','shape:parent'),isLocked:true});f.only().parentId='shape:parent';},
      (f:any)=>{f.shapes.set('shape:parent',shape('order-details','shape:parent'));f.only().parentId='shape:parent';},
      (f:any)=>{f.shapes.set('shape:parent',shape('frame','shape:parent'));f.only().parentId='shape:parent';}
    ];
    for(const guard of guards){
      const f=fixture(),p=prepareGradientFill(f.editor,gradient);guard(f);const before=structuredClone([...f.shapes]);
      assert.equal(gradientFillSelection(f.editor),null);assert.equal(materialTextureSelection(f.editor),null);
      assert.equal(applyGradientFill(f.editor,p),false);
      assert.equal(updateCurveFill(f.editor,f.only().id,VECTOR_DEFAULT_PAINT,{}),false);
      assert.deepEqual([...f.shapes],before);assert.equal(f.marks.length,0);
    }
  });
  it('rejects stale selection, changed geometry, document scale and modified previews before writing',()=>{
    for(const kind of ['geometry','selection','document','path','paint','bounds']){
      const f=fixture(),p=prepareGradientFill(f.editor,gradient),m=prepareMaterialTexture(f.editor,image,texture);
      if(kind==='geometry')f.only().props.w=222;
      if(kind==='selection')f.editor.setSelectedShapes([]);
      if(kind==='document')f.page.meta.omsCad.scale=3;
      if(kind==='path'){p.data='M0,0';m.data='M0,0';}
      if(kind==='paint'){p.paint.stroke='#abcdef';m.paint.stroke='#abcdef';}
      if(kind==='bounds'){p.bounds.w++;m.bounds.w++;}
      assert.equal(applyGradientFill(f.editor,p),false);assert.equal(applyMaterialTexture(f.editor,m),false);assert.equal(f.marks.length,0);
    }
  });
  it('rolls back malformed paint writes and rejects increases above the snapshot budget',()=>{
    for(const operation of ['gradient','material']){
      const f=fixture(),before=structuredClone(f.only());
      const apply=()=>operation==='gradient'?applyGradientFill(f.editor,prepareGradientFill(f.editor,gradient)):applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,image,texture));
      f.state.brokenUpdate=true;assert.equal(apply(),false);assert.deepEqual(f.only(),before);assert.equal(f.marks.length,0);
      f.state.brokenUpdate=false;f.state.budget='x'.repeat(1_900_000);
      assert.equal(apply(),false);assert.deepEqual(f.only(),before);assert.equal(f.marks.length,0);
    }
  });
  it('reads tile dimensions in physical units and rejects excessive ellipse tile counts',()=>{
    const f=fixture(),s={...texture,mode:'tile' as const,tileWidthMm:20,offsetXmm:3,offsetYmm:-4};
    assert.equal(applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,image,s)),true);
    const loaded=getMaterialTextureDraft(f.editor)!;
    close(loaded.tileWidthMm!,20);close(loaded.offsetXmm!,3);close(loaded.offsetYmm!,-4);close(loaded.angle,37);
    close(Math.hypot(...f.only().meta.omsVectorPaint.raster.matrix.slice(0,2))*cadMmPerPixel(DEFAULT_CAD_SETTINGS),20);
    assert.throws(()=>prepareMaterialTexture(f.editor,image,{...s,tileWidthMm:.01}),/material-tiles/);
    assert.throws(()=>prepareMaterialTexture(f.editor,{raster:{...image.raster,png:'https://example.com/x.png'}},s),/geometry/);
  });
  it('aligns material across rotated grouped ellipses and paths while previewing exact local SVG paths',()=>{
    const a=shape('cad-ellipse','shape:a'),b=shape('cad-path','shape:b'),group={...shape('group','shape:group'),rotation:.6,x:71,y:-20,opacity:.5};
    a.parentId=group.id;b.x=311;b.rotation=-.4;
    const f=fixture([a,b,group]);f.editor.setSelectedShapes([a.id]);
    assert.equal(applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,image,{...texture,mode:'tile',tileWidthMm:30})),true);
    f.editor.setSelectedShapes([a.id,b.id]);const before=structuredClone([...f.shapes]),p=prepareMaterialAlignment(f.editor,a.id);
    assert.equal(p.paths[0].local.data,cadAnalyticPath(f.shapes.get(a.id)!));
    assert.equal(p.paths[1].local.data,cadAnalyticPath(f.shapes.get(b.id)!));
    close(p.paths[0].local.paint.fillOpacity,.65*.7*.5);
    const pagePixel=(id:string,m:number[],u:number,v:number)=>f.editor.getShapePageTransform(f.shapes.get(id)).applyToPoint({x:m[0]*u+m[2]*v+m[4],y:m[1]*u+m[3]*v+m[5]});
    assert.equal(applyMaterialAlignment(f.editor,p),true);
    for(const [id,old]of before)assert.deepEqual(f.shapes.get(id)!.props,old.props);
    const one=f.shapes.get(a.id)!.meta.omsVectorPaint.raster.matrix,two=f.shapes.get(b.id)!.meta.omsVectorPaint.raster.matrix;
    for(const [u,v]of [[0,0],[1,0],[0,1]]){const x=pagePixel(a.id,one,u,v),y=pagePixel(b.id,two,u,v);close(x.x,y.x);close(x.y,y.y);}
    assert.equal(applyMaterialAlignment(f.editor,p),false);
  });
  it('retains Bézier holes and explicit open-curve material removal compatibility',()=>{
    const s=shape('cad-bezier');s.props.contours.push({closed:true,nodes:[{x:0,y:30},{x:50,y:30},{x:50,y:60}].map(nodeAt)});
    const f=fixture([s]);const p=prepareGradientFill(f.editor,gradient);assert.equal(p.data.match(/M/g)!.length,2);
    assert.equal(applyGradientFill(f.editor,p),true);assert.equal(applyMaterialTexture(f.editor,prepareMaterialTexture(f.editor,image,texture)),true);
    f.only().props.contours[0].closed=false;assert.equal(removeMaterialTexture(f.editor),true);
    assert.equal(curveFillGeometry(f.only()).closed,false);
  });
});
