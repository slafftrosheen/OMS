import ClipperLib from 'clipper-lib';
import { createShapeId, getIndexBetween, type Editor, type TLShapeId } from '@tldraw/tldraw';
import { readOutlineSelection } from './drawing-outline';
import { drawingTransaction } from './drawing-commands';
import { cadRevision, assertCadEditable, CadOperationError } from './cad-plans';
import { cadMmPerPixel, validateCadSettings, type CadSettings, type CadPoint } from './cad-settings';
import { shapeCadContours } from './cad-editing';
import { flattenContours, mapContours, nodeAt, validContours, curveBounds, type CadContour } from './cad-curves';
import { VECTOR_DEFAULT_PAINT, validVectorPaint, type VectorPaint } from './cad-paint';
import { paintMetadata } from './cad-vector';

export interface OutlineToObjectOptions { toleranceMm: number; keepOriginal: boolean; }
export interface OutlineToObjectItem {
  sourceId: TLShapeId;
  contours: CadContour[];
  previewContours: CadContour[];
  paint: VectorPaint;
  retainSource: boolean;
  previewOpacity: number;
}
export interface OutlineToObjectPlan {
  revision: string;
  options: OutlineToObjectOptions;
  items: OutlineToObjectItem[];
  widthMm: number;
  heightMm: number;
  nodeCount: number;
  transparency: boolean;
}
const SCALE = 10000; // 0.0001 mm quantization, below the minimum flattening tolerance.
const MAX_VERTICES = 100000;
type Point = { X: number; Y: number };
type Polygon = Point[];
const cross = (a: CadPoint, b: CadPoint) => a.x * b.y - a.y * b.x;

/**
 * Union segment rectangles and explicit SVG join/cap regions. Clipper's jtSquare
 * is a square join, NOT SVG bevel, and its miter fallback is also square.
 * Constructing the regions avoids silently changing bevels and miter limits.
 */
export function expandOutlineContours(contours: CadContour[], paint: VectorPaint, mmPerPixel: number, toleranceMm: number): CadContour[] {
  if (!validContours(contours) || !validVectorPaint(paint) || !Number.isFinite(mmPerPixel) || mmPerPixel <= 0 ||
      !Number.isFinite(toleranceMm) || toleranceMm < .001 || toleranceMm > 1) throw new CadOperationError('invalid');
  if (paint.dash.length) throw new CadOperationError('dashed');
  if (paint.hairline) throw new CadOperationError('hairline');
  if (paint.stroke === 'none' || paint.strokeOpacity <= 0 || paint.strokeWidth <= 0) throw new CadOperationError('invisible');
  const radius = paint.strokeWidth * mmPerPixel / 2;
  if (radius < 2 / SCALE || radius > 1e7) throw new CadOperationError('geometry');
  const polygons: Polygon[] = [];
  let vertices = 0;
  const add = (points: CadPoint[]) => {
    const path = points.map(p => {
      const X = Math.round(p.x * SCALE), Y = Math.round(p.y * SCALE);
      if (++vertices > MAX_VERTICES) throw new CadOperationError('limit');
      if (![X,Y].every(v => Number.isSafeInteger(v) && Math.abs(v) <= 1e12)) throw new CadOperationError('geometry');
      return {X,Y};
    }).filter((p,i,a) => !i || p.X !== a[i-1].X || p.Y !== a[i-1].Y);
    if (path.length > 2 && path[0].X === path.at(-1)!.X && path[0].Y === path.at(-1)!.Y) path.pop();
    if (path.length < 3 || !ClipperLib.Clipper.Area(path)) return;
    if (!ClipperLib.Clipper.Orientation(path)) path.reverse();
    polygons.push(path);
  };
  const circle = (p: CadPoint) => {
    // Sagitta bounded by one quarter of the requested flattening tolerance.
    const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - Math.min(radius, toleranceMm / 4) / radius)));
    const count = Math.max(8, Math.ceil(2 * Math.PI / step));
    if (!Number.isFinite(count) || count + vertices > MAX_VERTICES) throw new CadOperationError('limit');
    add(Array.from({length:count},(_,i) => ({x:p.x + radius * Math.cos(i*2*Math.PI/count),y:p.y + radius * Math.sin(i*2*Math.PI/count)})));
  };
  let sampledCount=0;
  for (let ci = 0; ci < contours.length; ci++) {
    const {closed,nodes}=contours[ci];
    const isCorner=(i:number)=>{
      if(!closed&&(i===0||i===nodes.length-1))return true;
      const p=nodes[i],before=nodes[(i+nodes.length-1)%nodes.length],after=nodes[(i+1)%nodes.length];
      let a={x:-p.inX,y:-p.inY},b={x:p.outX,y:p.outY};
      if(!a.x&&!a.y)a={x:p.x-before.x-before.outX,y:p.y-before.y-before.outY};
      if(!a.x&&!a.y)a={x:p.x-before.x,y:p.y-before.y};
      if(!b.x&&!b.y)b={x:after.x+after.inX-p.x,y:after.y+after.inY-p.y};
      if(!b.x&&!b.y)b={x:after.x-p.x,y:after.y-p.y};
      const lengths=Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y);
      return !lengths||Math.abs(cross(a,b))/lengths>1e-9||a.x*b.x+a.y*b.y<=0;
    };
    const points:Array<CadPoint&{corner:boolean}>=[];
    for(let i=0;i<nodes.length-(closed?0:1);i++){
      const next=(i+1)%nodes.length;
      let samples:CadPoint[];
      try{samples=flattenContours([{closed:false,nodes:[nodes[i],nodes[next]]}],toleranceMm/mmPerPixel/4,10000-sampledCount)[0];}
      catch{throw new CadOperationError('limit');}
      sampledCount+=samples.length;
      if(sampledCount>10000)throw new CadOperationError('limit');
      for(let j=i?1:0;j<samples.length;j++){
        const p=samples[j],corner=j===0?isCorner(i):j===samples.length-1?isCorner(next):false;
        const point={x:p.x*mmPerPixel,y:p.y*mmPerPixel,corner};
        const previous=points.at(-1);
        if(previous&&previous.x===point.x&&previous.y===point.y){previous.corner ||= corner;continue;}
        points.push(point);
      }
    }
    if (closed && points.length > 1 && points[0].x === points.at(-1)!.x && points[0].y === points.at(-1)!.y) points.pop();
    if (points.length < 2) throw new CadOperationError('geometry');
    const segments = Array.from({length:points.length-(closed?0:1)},(_,i) => {
      const a=points[i],b=points[(i+1)%points.length],length=Math.hypot(b.x-a.x,b.y-a.y);
      if (length < 2/SCALE) throw new CadOperationError('geometry');
      const u={x:(b.x-a.x)/length,y:(b.y-a.y)/length},n={x:-u.y*radius,y:u.x*radius};
      add([{x:a.x+n.x,y:a.y+n.y},{x:a.x-n.x,y:a.y-n.y},{x:b.x-n.x,y:b.y-n.y},{x:b.x+n.x,y:b.y+n.y}]);
      return {a,b,u,n};
    });
    for (let i=closed?0:1;i<points.length-(closed?0:1);i++) {
      const before=segments[(i+segments.length-1)%segments.length],after=segments[i],p=points[i];
      const turn=cross(before.u,after.u);
      // SVG joins belong to authored corners. Flattening subdivisions and smooth
      // anchors use the round envelope, avoiding artificial wide-stroke spikes.
      if (!p.corner || paint.lineJoin==='round') { circle(p); continue; }
      if (Math.abs(turn)<1e-12) continue;
      const side=turn>0?-1:1;
      const a={x:p.x+side*before.n.x,y:p.y+side*before.n.y},b={x:p.x+side*after.n.x,y:p.y+side*after.n.y};
      const along=cross({x:b.x-a.x,y:b.y-a.y},after.u)/turn;
      const m={x:a.x+before.u.x*along,y:a.y+before.u.y*along};
      if (paint.lineJoin==='miter' && Math.hypot(m.x-p.x,m.y-p.y)/radius <= paint.miterLimit + 1e-10)
        add([p,a,m,b]);
      else add([p,a,b]);
    }
    if (!closed) {
      const first=segments[0],last=segments.at(-1)!;
      if (paint.lineCap==='round') { circle(first.a);circle(last.b); }
      else if (paint.lineCap==='square') for(const [segment,start] of [[first,true],[last,false]] as const) {
        const p=start?segment.a:segment.b,d=start?-radius:radius,n=segment.n,u=segment.u;
        add([{x:p.x+n.x,y:p.y+n.y},{x:p.x-n.x,y:p.y-n.y},
          {x:p.x+u.x*d-n.x,y:p.y+u.y*d-n.y},{x:p.x+u.x*d+n.x,y:p.y+u.y*d+n.y}]);
      }
    }
  }
  const engine = new ClipperLib.Clipper(), result: Polygon[] = [];
  engine.StrictlySimple = true;
  engine.AddPaths(polygons,ClipperLib.PolyType.ptSubject,true);
  if (!engine.Execute(ClipperLib.ClipType.ctUnion,result,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero))
    throw new CadOperationError('geometry');
  const output = result.filter(path => path.length>=3).map(path => ({closed:true,nodes:path.map(p=>nodeAt({x:p.X/SCALE/mmPerPixel,y:p.Y/SCALE/mmPerPixel}))}));
  if (!output.length) throw new CadOperationError('geometry');
  if (!validContours(output)) throw new CadOperationError('limit');
  return output;
}
function eligible(editor: Editor) {
  const source=readOutlineSelection(editor);
  const selected=[...editor.getSelectedShapeIds()];
  assertCadEditable(editor,selected);
  if(source.length>100)throw new CadOperationError('limit');
  for(const id of editor.getShapeAndDescendantIds(selected))
    if(editor.getBindingsInvolvingShape(id).length)throw new CadOperationError('bound');
  for(const {shape,paint} of source) {
    let parent=editor.getShape(shape.parentId as TLShapeId);
    while(parent){
      if(editor.getBindingsInvolvingShape(parent.id).length)throw new CadOperationError('bound');
      if(parent.opacity<=0)throw new CadOperationError('invisible');
      parent=editor.getShape(parent.parentId as TLShapeId);
    }
    if(editor.getShapeMask(shape.id)||paint.clips?.length||paint.raster&&paint.raster.usage!=='material')throw new CadOperationError('unsupported');
    if(paint.dash.length)throw new CadOperationError('dashed');
    if(paint.hairline)throw new CadOperationError('hairline');
    if(paint.stroke==='none'||paint.strokeWidth<=0||paint.strokeOpacity<=0||shape.opacity<=0)throw new CadOperationError('invisible');
  }
  return source;
}
function checkCapacity(editor: Editor, items: OutlineToObjectItem[]) {
  if(editor.getCurrentPageShapeIds().size+items.filter(item=>item.retainSource).length>editor.options.maxShapesPerPage)throw new CadOperationError('limit');
  const estimate=JSON.stringify(items.map(item=>item.contours)).length + items.length*1500 +
    items.reduce((n,item)=>n+JSON.stringify(editor.getShape(item.sourceId)!.meta).length-
      (item.retainSource?0:JSON.stringify(editor.getShape(item.sourceId)).length),0);
  if(editor.store&&JSON.stringify(editor.store.getStoreSnapshot()).length+estimate>1_900_000)throw new CadOperationError('limit');
}
export function prepareOutlineToObject(editor: Editor, settings: CadSettings, options: OutlineToObjectOptions): OutlineToObjectPlan {
  if(!validateCadSettings(settings)||!options||typeof options.keepOriginal!=='boolean'||
      !Number.isFinite(options.toleranceMm)||options.toleranceMm<.001||options.toleranceMm>1)throw new CadOperationError('invalid');
  const source=eligible(editor),factor=cadMmPerPixel(settings);
  const items=source.map(({shape,paint})=>{
    const local=mapContours(shapeCadContours(editor,shape,options.toleranceMm/factor/16),p=>editor.getPointInShapeSpace(shape,p));
    const contours=expandOutlineContours(local,paint,factor,options.toleranceMm);
    return {sourceId:shape.id,contours,previewContours:mapContours(contours,p=>editor.getShapePageTransform(shape).applyToPoint(p)),
      paint:{...VECTOR_DEFAULT_PAINT,fill:paint.stroke,fillOpacity:paint.strokeOpacity,stroke:'none',strokeWidth:0,dash:[]},
      retainSource:options.keepOriginal||paint.fill!=='none'||!!paint.gradient||!!paint.raster||!!shape.meta.omsMaterialTexture,
      previewOpacity:effectiveOpacity(editor,shape.id)};
  });
  const nodeCount=items.reduce((sum,item)=>sum+item.contours.reduce((n,c)=>n+c.nodes.length,0),0);
  if(nodeCount>20000)throw new CadOperationError('limit');
  checkCapacity(editor,items);
  const bounds=curveBounds(items.flatMap(item=>item.previewContours));
  return {revision:cadRevision(editor),options:{...options},items,nodeCount,widthMm:bounds.w*factor,heightMm:bounds.h*factor,
    transparency:source.some(({shape,paint})=>effectiveOpacity(editor,shape.id)<1||paint.strokeOpacity<1)};
}
function effectiveOpacity(editor:Editor,id:TLShapeId){
  let opacity=1,shape=editor.getShape(id);
  while(shape){opacity*=shape.opacity;shape=editor.getShape(shape.parentId as TLShapeId);}
  return opacity;
}
function plannedShape(editor:Editor,item:OutlineToObjectItem) {
  const source=editor.getShape(item.sourceId)!;
  const siblings=editor.getSortedChildIdsForParent(source.parentId).map(id=>editor.getShape(id)!).filter(Boolean);
  const next=siblings.find(shape=>shape.index>source.index);
  return {id:createShapeId(),type:'cad-bezier' as const,parentId:source.parentId,index:getIndexBetween(source.index,next?.index),
    x:source.x,y:source.y,rotation:source.rotation,opacity:source.opacity,
    props:{contours:item.contours,fillRule:'nonzero',color:(source.props as {color?:string}).color??'black'},
    meta:{...(!item.retainSource?source.meta:{}),omsObjectName:`${typeof source.meta.omsObjectName==='string'?source.meta.omsObjectName:source.type} · outline`,
      omsVectorPaint:paintMetadata(item.paint)}};
}
export function applyOutlineToObject(editor: Editor, plan: OutlineToObjectPlan): boolean {
  try {
    if(plan.revision!==cadRevision(editor))return false;
    editor.complete();editor.setCurrentTool('select');
    if(plan.revision!==cadRevision(editor))return false;
    const source=eligible(editor);
    if(plan.items.length!==source.length||plan.items.some(item=>!source.some(s=>s.shape.id===item.sourceId)||!validContours(item.contours)||!validVectorPaint(item.paint)))return false;
    checkCapacity(editor,plan.items);
    const output=plan.items.map(item=>plannedShape(editor,item));
    const retained=source.filter(({shape})=>plan.items.find(item=>item.sourceId===shape.id)!.retainSource);
    const updates=retained.map(({shape,paint})=>({id:shape.id,type:shape.type,meta:{...shape.meta,omsVectorPaint:paintMetadata({...paint,stroke:'none'})}}));
    const removeIds=plan.items.filter(item=>!item.retainSource).map(item=>item.sourceId);
    const oldProps=retained.map(({shape})=>JSON.stringify(shape.props));
    // tldraw 2.4.6 exposes atomic at runtime but trims @internal from its published
    // declarations. Keep the bridge narrow; replacement relies on deferred group cleanup.
    return drawingTransaction(editor,()=>(editor.store as unknown as { atomic: (change: () => void) => void }).atomic(()=>{
      // History batching alone does not defer native group cleanup. Keep the
      // remove/create sequence inside a store transaction so empty or singleton
      // groups are only evaluated after replacement siblings exist.
      editor.deleteShapes(removeIds);
      if(removeIds.some(id=>editor.getShape(id)))throw new CadOperationError('failed');
      for(const shape of output) {
        editor.createShape(shape as any);
        const actual=editor.getShape(shape.id);
        if(!actual||actual.parentId!==shape.parentId||actual.index!==shape.index||actual.opacity!==shape.opacity||
            Object.entries(shape.props).some(([key,value])=>JSON.stringify((actual.props as any)[key])!==JSON.stringify(value))||
            Object.entries(shape.meta).some(([key,value])=>JSON.stringify(actual.meta[key])!==JSON.stringify(value)))
          throw new CadOperationError('failed');
      }
      if(!plan.options.keepOriginal) {
        editor.updateShapes(updates);
        for(let i=0;i<updates.length;i++) {
          const actual=editor.getShape(updates[i].id);
          if(!actual||JSON.stringify(actual.meta)!==JSON.stringify(updates[i].meta)||JSON.stringify(actual.props)!==oldProps[i])
            throw new CadOperationError('failed');
        }
      }
      editor.setSelectedShapes(output.map(shape=>shape.id));
    }));
  } catch { return false; }
}
