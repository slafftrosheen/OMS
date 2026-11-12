import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { type VectorRaster } from './cad-appearance';
import { type VectorPaint, validVectorPaint } from './cad-paint';
import { vectorPaint, paintMetadata } from './cad-vector';
import { curveBounds, validContours, type CadContour } from './cad-curves';
import { assertCadEditable, cadRevision } from './cad-plans';
import { drawingTransaction } from './drawing-commands';
import { drawingObjectName } from './drawing-operations';
import { encodePdfRaster } from './cad-raster';
import { storeCanvasImage } from './cad-asset-store';

export interface MaterialTextureDraft { raster: Omit<VectorRaster, 'matrix'> }
export interface MaterialTextureSettings { scale: number; angle: number; opacity: number }
export interface MaterialTexturePlan {
  revision: string; shapeId: TLShapeId; paint: VectorPaint; contours: CadContour[];
  fillRule: 'evenodd'|'nonzero'; settings: MaterialTextureSettings;
}
function source(editor: Editor) {
  const shape=editor.getOnlySelectedShape();
  if(shape?.type!=='cad-bezier')throw new Error('material-selection');
  assertCadEditable(editor,[shape.id]);
  const p=shape.props as any,paint=vectorPaint(shape.meta,p.color);
  if(!validContours(p.contours)||shape.meta.omsVectorPaint&&!validVectorPaint(shape.meta.omsVectorPaint)||editor.getShapeMask(shape.id)||paint.clips?.length||
     paint.raster&&paint.raster.usage!=='material'||editor.getBindingsInvolvingShape(shape.id).length)throw new Error('material-selection');
  let parent=editor.getShape(shape.parentId as TLShapeId);const seen=new Set<string>();
  while(parent&&!seen.has(parent.id)){
    if(parent.type!=='group')throw new Error('material-selection');
    seen.add(parent.id);parent=editor.getShape(parent.parentId as TLShapeId);
  }
  return {shape,paint,contours:p.contours as CadContour[],fillRule:p.fillRule as 'evenodd'|'nonzero'};
}
export function materialTextureSelection(editor: Editor) {
  try {
    const {shape,paint,contours}=source(editor);
    if(!paint.raster&&contours.some(c=>!c.closed))return null;
    return {id:shape.id,name:drawingObjectName(shape),hasTexture:paint.raster?.usage==='material'};
  }catch{return null;}
}
export function getMaterialTextureDraft(editor: Editor): ({draft:MaterialTextureDraft}&MaterialTextureSettings)|null {
  try {
    const {shape,paint}=source(editor);
    if(paint.raster?.usage!=='material')return null;
    const {matrix,...raster}=paint.raster,stored=shape.meta.omsMaterialTexture as any;
    return {draft:{raster},scale:Number.isFinite(stored?.scale)&&stored.scale>=100&&stored.scale<=2000?stored.scale:100,
      angle:Number.isFinite(stored?.angle)&&Math.abs(stored.angle)<=360?stored.angle:0,opacity:paint.fillOpacity*100};
  }catch{return null;}
}
export async function readMaterialTexture(editor: Editor, file: File, signal: AbortSignal): Promise<MaterialTextureDraft> {
  if(signal.aborted||editor.getInstanceState().isReadonly)throw new Error('cancelled');
  if(!file.size||file.size>25*1024*1024)throw new Error('material-limit');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('material-image');
  let bitmap:ImageBitmap;
  try{bitmap=await createImageBitmap(file);}catch{throw new Error('material-image');}
  try {
    if(bitmap.width>16384||bitmap.height>16384||bitmap.width*bitmap.height>32*1024*1024)throw new Error('material-limit');
    const image={bitmap,width:bitmap.width,height:bitmap.height};
    let raster:Omit<VectorRaster,'matrix'>;
    try{raster=await encodePdfRaster(image);}catch(error){
      if((error as Error).message!=='asset-context')throw error;
      raster=await encodePdfRaster(image,{name:file.name.replace(/\.[^.]+$/, '')+'-material.png',store:f=>storeCanvasImage(editor,f,signal)});
    }
    if(signal.aborted||editor.getInstanceState().isReadonly)throw new Error('cancelled');
    return {raster:{...raster,usage:'material'}};
  }finally{bitmap.close();}
}
/** Cover the complete outline's bounds, preserving image aspect ratio even when
 * rotated. Scale is a centred zoom, not tiling or a physical material grain size. */
export function prepareMaterialTexture(editor: Editor,draft:MaterialTextureDraft,settings:MaterialTextureSettings):MaterialTexturePlan {
  const {shape,paint,contours,fillRule}=source(editor),{scale,angle,opacity}=settings;
  if(![scale,angle,opacity].every(Number.isFinite)||scale<100||scale>2000||Math.abs(angle)>360||opacity<0||opacity>100)throw new Error('geometry');
  if(contours.some(c=>!c.closed))throw new Error('material-selection');
  const bounds=curveBounds(contours);
  if(bounds.w<=0||bounds.h<=0)throw new Error('material-selection');
  const r=draft.raster,theta=-angle*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta);
  const factor=Math.max((Math.abs(c)*bounds.w+Math.abs(s)*bounds.h)/r.width,(Math.abs(s)*bounds.w+Math.abs(c)*bounds.h)/r.height)*scale/100;
  const w=r.width*factor,h=r.height*factor,a=c*w,b=s*w,cc=-s*h,d=c*h;
  const next:VectorPaint={...paint,gradient:undefined,fillOpacity:opacity/100,raster:{...r,usage:'material',matrix:[a,b,cc,d,bounds.x+bounds.w/2-(a+cc)/2,bounds.y+bounds.h/2-(b+d)/2]}};
  if(!validVectorPaint(next))throw new Error('geometry');
  return {revision:cadRevision(editor),shapeId:shape.id,paint:next,contours:structuredClone(contours),fillRule,settings:{...settings}};
}
function updatePaint(editor:Editor,id:TLShapeId,paint:VectorPaint,settings?:MaterialTextureSettings) {
  const shape=editor.getShape(id)!;
  const meta={...shape.meta,omsVectorPaint:paintMetadata(paint)} as Record<string,any>;
  // tldraw merges top-level metadata keys: omission does not remove a key.
  meta.omsMaterialTexture=settings?{...settings}:null;
  const encoded=JSON.stringify(meta),props=JSON.stringify(shape.props);
  const current=editor.store?JSON.stringify(editor.store.getStoreSnapshot()).length:JSON.stringify(shape.meta).length;
  const next=current-JSON.stringify(shape.meta).length+encoded.length;
  if(next>1_900_000&&next>=current)return false;
  return drawingTransaction(editor,()=>{
    editor.updateShape({id,type:shape.type,meta});
    const changed=editor.getShape(id);
    if(!changed||JSON.stringify(changed.meta)!==encoded||JSON.stringify(changed.props)!==props)throw new Error('material-failed');
  });
}
export function applyMaterialTexture(editor:Editor,plan:MaterialTexturePlan):boolean {
  try {
    if(plan.revision!==cadRevision(editor))return false;
    editor.complete();editor.setCurrentTool('select');
    if(plan.revision!==cadRevision(editor))return false;
    const {shape,contours}=source(editor);
    if(shape.id!==plan.shapeId||JSON.stringify(contours)!==JSON.stringify(plan.contours)||!plan.paint.raster)return false;
    const fresh=prepareMaterialTexture(editor,{raster:plan.paint.raster},plan.settings);
    if(JSON.stringify(fresh.paint)!==JSON.stringify(plan.paint))return false;
    return updatePaint(editor,shape.id,fresh.paint,plan.settings);
  }catch{return false;}
}
export function removeMaterialTexture(editor:Editor):boolean {
  try {
    editor.complete();editor.setCurrentTool('select');
    const {shape,paint}=source(editor);
    if(paint.raster?.usage!=='material')return false;
    delete paint.raster;
    return updatePaint(editor,shape.id,paint);
  }catch{return false;}
}
