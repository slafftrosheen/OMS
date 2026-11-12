import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { assertCadEditable, CadOperationError } from './cad-plans';
import { shapeCadContours } from './cad-editing';
import { contourSegments, cubicAt, splitCubic, validContours, type CadContour } from './cad-curves';
import { cubicLength } from './cad-measurements';
import { cadMmPerPixel, type CadPoint, type CadSettings } from './cad-settings';
import { validVectorPaint } from './cad-paint';

export interface CadTextGuide { shapeId: string; offset: number; distance: number; reverse: boolean }
export interface TextGuide {
  length: number; closed: boolean;
  sample: (distance: number) => { point: CadPoint; tangent: CadPoint };
}
const distance = (a: CadPoint, b: CadPoint) => Math.hypot(a.x-b.x,a.y-b.y);
/** Length integration and inversion are bounded. Glyph positions are evaluated
 * on the original cubic, never on a flattened cutting outline. */
export function buildTextGuide(contour: CadContour, tolerance = 0.001): TextGuide {
  if (!validContours([contour]) || !Number.isFinite(tolerance) || tolerance <= 0) throw new CadOperationError('guide-selection');
  const budget={remaining:1_000_000}, raw=[...contourSegments(contour)];
  const segments: Array<{points:CadPoint[];start:number;length:number;line:boolean}>=[];
  let length=0;
  try {
    for(const points of raw) {
      const line=distance(points[0],points[1])===0&&distance(points[2],points[3])===0;
      const size=line?distance(points[0],points[3]):cubicLength(points,tolerance/Math.max(1,raw.length),budget);
      if(size>1e-12){segments.push({points,start:length,length:size,line});length+=size;}
    }
  } catch { throw new CadOperationError('guide-limit'); }
  if(!Number.isFinite(length)||length<=1e-12)throw new CadOperationError('guide-selection');
  const sample=(value:number)=>{
    if(!Number.isFinite(value)||value < -1e-9||value>length+1e-9)throw new CadOperationError('guide-fit');
    value=Math.max(0,Math.min(length,value));
    // At an interior corner the outgoing segment defines the orientation.
    const segment=segments.find(s=>value<s.start+s.length)??segments.at(-1)!;
    const p=segment.points, local=Math.max(0,Math.min(segment.length,value-segment.start));
    let point:CadPoint,t:number;
    if(segment.line) {
      const fraction=local/segment.length;
      point={x:p[0].x+(p[3].x-p[0].x)*fraction,y:p[0].y+(p[3].y-p[0].y)*fraction};
      return {point,tangent:{x:(p[3].x-p[0].x)/segment.length,y:(p[3].y-p[0].y)/segment.length}};
    }
    if(local===0)t=0;
    else if(local===segment.length)t=1;
    else {
      let current=p,remaining=local,span=segment.length,lo=0,hi=1;
      try {
        for(let depth=0;;depth++) {
          if(span<=tolerance/4){t=(lo+hi)/2;break;}
          if(depth>=40)throw new Error('limit');
          const [a,b]=splitCubic(current),middle=(lo+hi)/2;
          const left=cubicLength(a,tolerance/128,budget);
          if(remaining<=left){current=a;hi=middle;span=left;}
          else{remaining-=left;current=b;lo=middle;span=cubicLength(b,tolerance/128,budget);}
        }
      } catch {throw new CadOperationError('guide-limit');}
    }
    point=cubicAt(p,t);
    let dx=3*((1-t)**2*(p[1].x-p[0].x)+2*(1-t)*t*(p[2].x-p[1].x)+t*t*(p[3].x-p[2].x));
    let dy=3*((1-t)**2*(p[1].y-p[0].y)+2*(1-t)*t*(p[2].y-p[1].y)+t*t*(p[3].y-p[2].y));
    if(Math.hypot(dx,dy)<=1e-12&&(t===0||t===1)) {
      const origin=t===0?p[0]:p[3],candidates=t===0?p.slice(1):p.slice(0,3).reverse();
      const target=candidates.find(q=>distance(q,origin)>1e-12);
      if(target){const sign=t===0?1:-1;dx=(target.x-origin.x)*sign;dy=(target.y-origin.y)*sign;}
    }
    const size=Math.hypot(dx,dy);
    if(size<=1e-12||!Number.isFinite(size))throw new CadOperationError('guide-tangent');
    return {point,tangent:{x:dx/size,y:dy/size}};
  };
  return {length,closed:contour.closed,sample};
}
export function selectedTextGuide(editor: Editor, settings: CadSettings, shapeId: string): TextGuide {
  const ids=editor.getSelectedShapeIds(),shape=editor.getShape(shapeId as TLShapeId);
  if(ids.length!==1||ids[0]!==shapeId||!shape||!['cad-path','cad-bezier','line'].includes(shape.type))throw new CadOperationError('guide-selection');
  assertCadEditable(editor,[shape.id]);
  const paint=shape.meta.omsVectorPaint as any;
  if(editor.getShapeMask(shape.id)||paint?.clips?.length||paint?.raster&&!(shape.type==='cad-bezier'&&paint.raster.usage==='material'&&validVectorPaint(paint))||editor.getBindingsInvolvingShape(shape.id).length)throw new CadOperationError('guide-source');
  let parent=editor.getShape(shape.parentId as TLShapeId);const seen=new Set<string>();
  while(parent&&!seen.has(parent.id)){
    if(parent.type!=='group')throw new CadOperationError('guide-source');
    seen.add(parent.id);parent=editor.getShape(parent.parentId as TLShapeId);
  }
  const contours=shapeCadContours(editor,shape);
  if(contours.length!==1)throw new CadOperationError('guide-selection');
  return buildTextGuide(contours[0],0.001/cadMmPerPixel(settings));
}
