import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {fixture} from '../helpers/cad-editor';
import {arrangeProductionPocket,productionCardLayout,productionPocketHeaderHeight} from '../../src/lib/components/canvas/production-layout';
import {addOrderFileDocument} from '../../src/lib/components/canvas/order-file-documents';
import {DEFAULT_CAD_SETTINGS,cadMmPerPixel} from '../../src/lib/components/canvas/cad-settings';
import {defaultOrderCanvasScale} from '../../src/lib/components/canvas/shapes/form-shapes/form-layout';
import {ORDER_CANVAS_SCALE_META_KEY,readOrderCanvasScale} from '../../src/lib/order/canvas-layout-scale';

function close(actual:number,expected:number){assert.ok(Math.abs(actual-expected)<1e-7,`${actual} ≠ ${expected}`);}
function pocket(scale:number,marker=true){
 const f=fixture();
 f.editor.createShape({id:'shape:cnc',type:'frame',x:1000*scale,props:{w:800*scale,h:500*scale},meta:{omsFilePocket:'cnc',...(marker?{[ORDER_CANVAS_SCALE_META_KEY]:scale}:{})}});
 f.editor.createShape({id:'shape:bender',type:'frame',x:1000*scale,y:540*scale,props:{w:800*scale,h:500*scale},meta:{omsFilePocket:'bender',...(marker?{[ORDER_CANVAS_SCALE_META_KEY]:scale}:{})}});
 return f;
}

describe('physical order pocket layout',()=>{
 it('keeps attachment dimensions, columns, rows and margins proportional in mm and inches',()=>{
  const baseline=productionCardLayout(800,5,164);
  for(const settings of [DEFAULT_CAD_SETTINGS,{...DEFAULT_CAD_SETTINGS,unit:'in' as const},{...DEFAULT_CAD_SETTINGS,scale:10}]){
   const scale=defaultOrderCanvasScale(settings),cards=productionCardLayout(800*scale,5,164*scale,scale);
   cards.forEach((card,i)=>{for(const key of ['x','y','w','h'] as const)close(card[key],baseline[i][key]*scale);});
   close(cards[0].w*cadMmPerPixel(settings),1200);
   close((cards[1].x-cards[0].x-cards[0].w)*cadMmPerPixel(settings),80);
   assert.equal(cards[2].x,cards[0].x);
  }
 });
 it('grows scaled pockets and moves the following box with the same physical gap',()=>{
  const scale=defaultOrderCanvasScale(DEFAULT_CAD_SETTINGS),f=pocket(scale);
  for(let i=0;i<5;i++)addOrderFileDocument(f.editor,{id:String(i),originalName:`part${i}.dxf`,mimeType:'application/dxf',url:'/file'},{x:0,y:0},'cnc');
  const cards=f.editor.getCurrentPageShapesSorted().filter((s:any)=>s.type==='document');
  const cnc=f.editor.getShape('shape:cnc'),bender=f.editor.getShape('shape:bender');
  assert.equal(cards.length,5);close(cards[0].x,24*scale);close(cards[1].x,408*scale);
  close(cards[2].y-cards[0].y,304*scale);close(bender.y-cnc.props.h,40*scale);
  assert.ok(cnc.props.h>=cards[4].y+cards[4].props.h+24*scale-1e-7);
  for(const card of cards){close(readOrderCanvasScale(card),scale);close(card.props.w*cadMmPerPixel(DEFAULT_CAD_SETTINGS),1200);}
 });
 it('retains the saved content scale when the user widens a production frame',()=>{
  const scale=defaultOrderCanvasScale(DEFAULT_CAD_SETTINGS),f=pocket(scale);
  f.editor.updateShape({id:'shape:cnc',props:{w:1200*scale}});
  for(let i=0;i<4;i++)addOrderFileDocument(f.editor,{id:String(i),originalName:'drawing',mimeType:'application/pdf',url:'/file'},{x:0,y:0},'cnc');
  const cards=f.editor.getCurrentPageShapesSorted().filter((s:any)=>s.type==='document');
  close(cards[2].y,cards[0].y);close(cards[3].y-cards[0].y,304*scale);
  close(cards[0].props.w,360*scale);close(readOrderCanvasScale(cards[0]),scale);
 });
 it('keeps unmarked legacy frames at their original size even on calibrated pages',()=>{
  const f=pocket(1,false);f.editor.updatePage({meta:{omsCad:DEFAULT_CAD_SETTINGS}});
  addOrderFileDocument(f.editor,{id:'legacy',originalName:'legacy.dxf',mimeType:'application/dxf',url:'/file'},{x:0,y:0},'cnc');
  const card=f.editor.getCurrentPageShapesSorted().find((s:any)=>s.type==='document');
  assert.equal(card.props.w,360);assert.equal(card.props.h,280);assert.equal(card.x,24);assert.equal(card.y,188);
  for(const marker of [0,-1,NaN,Infinity,'12',1e20,1e-320])assert.equal(readOrderCanvasScale({meta:{[ORDER_CANVAS_SCALE_META_KEY]:marker}}),1);
 });
 it('leaves hand-placed artwork, manually sized cards and locked cards unchanged',()=>{
  const scale=defaultOrderCanvasScale(DEFAULT_CAD_SETTINGS),f=pocket(scale);
  f.editor.createShape({id:'shape:manual',type:'document',parentId:'shape:cnc',x:40,y:700,props:{w:300,h:200},meta:{retained:'manual'}});
  f.editor.createShape({id:'shape:cut',type:'cad-ellipse',parentId:'shape:cnc',x:25,y:60,props:{w:96,h:192}});
  f.editor.createShape({id:'shape:locked',type:'document',parentId:'shape:cnc',x:70,y:900,isLocked:true,props:{w:360,h:280},meta:{omsAutoArrange:true}});
  const ids=['shape:manual','shape:cut','shape:locked'];const before=ids.map(id=>structuredClone(f.editor.getShape(id)));
  arrangeProductionPocket(f.editor,'shape:cnc' as any);
  assert.deepEqual(ids.map(id=>f.editor.getShape(id)),before);
  f.state.isReadonly=true;const snapshot=structuredClone([...f.shapes.values()]);
  arrangeProductionPocket(f.editor,'shape:cnc' as any,10000);
  assert.deepEqual([...f.shapes.values()],snapshot);
 });
 it('uses a measured world-space header without multiplying it twice',()=>{
  const scale=defaultOrderCanvasScale(DEFAULT_CAD_SETTINGS),f=pocket(scale),height=240*scale;
  f.editor.updateShape({id:'shape:cnc',meta:{...f.editor.getShape('shape:cnc').meta,omsPocketHeaderHeight:height}});
  assert.equal(productionPocketHeaderHeight(f.editor.getShape('shape:cnc')),height);
  addOrderFileDocument(f.editor,{id:'file',originalName:'x.pdf',mimeType:'application/pdf',url:'/file'},{x:0,y:0},'cnc');
  const card=f.editor.getCurrentPageShapesSorted().find((s:any)=>s.type==='document');
  close(card.y,height+24*scale);
  assert.equal(productionPocketHeaderHeight({meta:{omsPocketHeaderHeight:-1,[ORDER_CANVAS_SCALE_META_KEY]:scale}}),164*scale);
 });
 it('settles after one layout pass without growing on repeated resize-observer notifications',()=>{
  for(const scale of [.2,1/3,defaultOrderCanvasScale(DEFAULT_CAD_SETTINGS),12.3456789]){
   const f=pocket(scale);
   for(let i=0;i<5;i++)addOrderFileDocument(f.editor,{id:String(i),originalName:'drawing',mimeType:'application/pdf',url:'/file'},{x:0,y:0},'cnc');
   const snapshot=structuredClone([...f.shapes.values()]);
   for(let i=0;i<10;i++)arrangeProductionPocket(f.editor,'shape:cnc' as any);
   assert.deepEqual([...f.shapes.values()],snapshot,`scale ${scale} must not drift`);
  }
 });
});

describe('production layout geometry limits and atomic writes',()=>{
 const file={id:'new',originalName:'drawing.pdf',mimeType:'application/pdf',url:'/file'};
 it('refuses valid document calibrations whose new card is outside the geometry envelope',()=>{
  for(const scale of [.001,1]){
   const f=fixture();f.editor.updatePage({meta:{omsCad:{...DEFAULT_CAD_SETTINGS,scale}}});
   const before=structuredClone([...f.shapes.values()]);
   assert.equal(addOrderFileDocument(f.editor,file,{x:scale===1?999000:0,y:0}),false);
   assert.deepEqual([...f.shapes.values()],before);
  }
  const legacy=fixture();assert.equal(addOrderFileDocument(legacy.editor,file,{x:999000,y:0}),true);
 });
 it('checks a rotated parent transform before creating a pocket card',()=>{
  const scale=defaultOrderCanvasScale(DEFAULT_CAD_SETTINGS),f=pocket(scale);
  f.editor.createShape({id:'shape:group',type:'group',x:0,y:999000,rotation:Math.PI/2});
  f.editor.updateShape({id:'shape:cnc',parentId:'shape:group',x:0,y:0});
  const before=structuredClone([...f.shapes.values()]);
  assert.equal(addOrderFileDocument(f.editor,file,{x:0,y:0},'cnc'),false);
  assert.deepEqual([...f.shapes.values()],before);
 });
 it('preflights downstream frames and their actual CAD descendants before growing a pocket',()=>{
  for(const problem of ['frame','descendant','locked-descendant']){
   const f=pocket(1);
   f.editor.updateShape({id:'shape:cnc',meta:{...f.editor.getShape('shape:cnc').meta,omsPocketHeaderHeight:400}});
   if(problem==='frame')f.editor.updateShape({id:'shape:bender',y:999400});
   else f.editor.createShape({id:'shape:cut',type:'cad-ellipse',parentId:'shape:bender',x:0,y:problem==='descendant'?999300:0,isLocked:problem==='locked-descendant',props:{w:100,h:100}});
   const before=structuredClone([...f.shapes.values()]);
   assert.equal(addOrderFileDocument(f.editor,file,{x:0,y:0},'cnc'),false,problem);
   assert.deepEqual([...f.shapes.values()],before,problem);
  }
 });
 it('rolls back creation, existing cards and frame growth if a downstream write is refused',()=>{
  const f=pocket(1);
  f.editor.createShape({id:'shape:existing',type:'document',parentId:'shape:cnc',x:10,y:20,props:{w:360,h:280},meta:{omsAutoArrange:true}});
  f.editor.updateShape({id:'shape:cnc',meta:{...f.editor.getShape('shape:cnc').meta,omsPocketHeaderHeight:400}});
  const before=structuredClone([...f.shapes.values()]),update=f.editor.updateShape;
  f.editor.updateShape=(patch:any)=>patch.id==='shape:bender'?undefined:update(patch);
  assert.equal(addOrderFileDocument(f.editor,file,{x:0,y:0},'cnc'),false);
  assert.deepEqual([...f.shapes.values()],before);
 });
 it('rolls back a changed source frame when a dependent CAD record is unexpectedly rewritten',()=>{
  const f=pocket(1);
  f.editor.createShape({id:'shape:cut',type:'cad-ellipse',parentId:'shape:cnc',x:20,y:20,props:{w:100,h:100}});
  const before=structuredClone([...f.shapes.values()]),update=f.editor.updateShape;
  f.editor.updateShape=(patch:any)=>{update(patch);if(patch.id==='shape:cnc')update({id:'shape:cut',x:123});};
  assert.equal(arrangeProductionPocket(f.editor,'shape:cnc' as any,700),false);
  assert.deepEqual([...f.shapes.values()],before);
 });
 it('verifies a created card after native defaults and refuses silently rewritten geometry',()=>{
  const f=fixture(),create=f.editor.createShape;
  f.editor.createShape=(shape:any)=>create({...shape,props:{fit:'contain',pdfPage:1,...shape.props}});
  assert.equal(addOrderFileDocument(f.editor,file,{x:0,y:0}),true);
  const card=f.editor.getCurrentPageShapesSorted()[0];assert.equal(card.props.fit,'contain');assert.equal(card.props.pdfPage,1);
  const before=structuredClone([...f.shapes.values()]);
  f.editor.createShape=(shape:any)=>create({...shape,x:999999});
  assert.equal(addOrderFileDocument(f.editor,{...file,id:'second'},{x:0,y:0}),false);
  assert.deepEqual([...f.shapes.values()],before);
 });
});
