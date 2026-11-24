import {frameFilePocket,PRODUCTION_FILE_POCKETS,type ProductionFilePocket} from './file-pockets';
import {ORDER_CANVAS_SCALE_META_KEY,readOrderCanvasScale} from './canvas-layout-scale';
import {CAD_MAX_COORDINATE} from '../components/canvas/cad-limits';

/** Snapshot edits run before the lazy canvas editor is loaded. Use only stored
 * affine transforms here; a missing/cyclic shape parent cannot be guessed. */
function snapshotAncestors(store:Record<string,any>,shape:any):any[]|null{
 const result:any[]=[],seen=new Set<string>();let current=shape;
 while(current){
  if(current.isLocked||seen.has(current.id)||result.length>128)return null;
  seen.add(current.id);result.push(current);
  const parent=current.parentId;
  if(!parent||String(parent).startsWith('page:'))return result;
  current=store[parent];if(!current)return null;
  if(current.typeName==='page')return result;
 }
 return result;
}
function snapshotBoxInsideLimits(store:Record<string,any>,shape:any):boolean{
 const {w,h}=shape.props??{};
 if(![w,h].every(value=>Number.isFinite(value)&&value>0&&value<=CAD_MAX_COORDINATE))return false;
 const chain=snapshotAncestors(store,shape);if(!chain)return false;
 let corners=[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
 for(const record of chain){
  const x=record.x??0,y=record.y??0,rotation=record.rotation??0;
  if(![x,y,rotation].every(Number.isFinite)||Math.abs(x)>CAD_MAX_COORDINATE||Math.abs(y)>CAD_MAX_COORDINATE)return false;
  const c=Math.cos(rotation),s=Math.sin(rotation);
  corners=corners.map(p=>({x:x+p.x*c-p.y*s,y:y+p.x*s+p.y*c}));
 }
 return corners.every(point=>[point.x,point.y].every(value=>Number.isFinite(value)&&Math.abs(value)<=CAD_MAX_COORDINATE));
}
/** The active canvas owns placement; Form changes patch only the chosen file. */
export function creationCanvasFilePockets(snapshot:any):Record<string,ProductionFilePocket>{
 const store=snapshot?.document?.store??snapshot?.store??{},pockets:Record<string,ProductionFilePocket>={};
 for(const record of Object.values(store)){
  const doc=record as any;
  if(doc?.type!=='document'||!doc.props?.fileId)continue;
  let parent=store[doc.parentId],pocket:ProductionFilePocket|null=null;
  for(let depth=0;parent&&depth<32;depth++){pocket=frameFilePocket(parent);if(pocket)break;parent=store[parent.parentId];}
  if(!pocket&&PRODUCTION_FILE_POCKETS.includes(doc.meta?.omsFilePocket))pocket=doc.meta.omsFilePocket;
  if(pocket)pockets[doc.props.fileId]=pocket;
 }
 return pockets;
}
export function updateCreationCanvasPockets(snapshot:unknown,pockets:Record<string,ProductionFilePocket>,options:{requireAll?:boolean}={}){
 const copy=JSON.parse(JSON.stringify(snapshot)),store=copy?.document?.store??copy?.store??{};
 let refused=false;
 const frames=new Map<ProductionFilePocket,any>();
 for(const record of Object.values(store)){
  const frame=record as any,pocket=frame&&frameFilePocket(frame);if(pocket)frames.set(pocket,frame);
 }
 for(const [key,record] of Object.entries(store)){
  const doc=record as any,pocket=pockets[doc?.props?.fileId];
  if(doc?.type!=='document'||!pocket)continue;
  const source=snapshotAncestors(store,doc),frame=frames.get(pocket),target=frame?snapshotAncestors(store,frame):null;
  if(!source||frame&&!target){refused=true;continue;}
  const next={...doc,meta:{...doc.meta,omsFilePocket:pocket}};
  if(frame&&doc.parentId!==frame.id){
   // A document normally has no children. Refuse moving a container with real
   // artwork instead of silently shifting geometry this snapshot path cannot measure.
   if(Object.values(store).some((child:any)=>child?.parentId===doc.id)){refused=true;continue;}
   const scale=readOrderCanvasScale(frame);
   if(next.meta.omsAutoArrange===true){
    const ratio=scale/readOrderCanvasScale(doc);
    // Only generated attachment viewers follow a new pocket's scale. A hand-sized
    // viewer keeps its physical size when the Form tab changes its destination.
    next.props={...doc.props,w:doc.props.w*ratio,h:doc.props.h*ratio};
    next.meta={...next.meta,[ORDER_CANVAS_SCALE_META_KEY]:scale};
   }
   next.parentId=frame.id;next.x=24*scale;next.y=180*scale;
   next.rotation=source.reduce((sum,shape)=>sum+(shape.rotation??0),0)-target!.reduce((sum,shape)=>sum+(shape.rotation??0),0);
   if(!snapshotBoxInsideLimits(store,next)){refused=true;continue;}
  }
  store[key]=next;
 }
 return options.requireAll&&refused?null:copy;
}
/** Remove queued files that were deleted and replace local references after upload. */
export function prepareCreationCanvas(snapshot:unknown,localOrderId:string,orderId:string,fileLinks:Record<string,string>,removedIds:Set<string>,base=''){
 const copy=JSON.parse(JSON.stringify(snapshot));
 const store=copy?.document?.store??copy?.store;
 const removedShapes=new Set<string>();
 const visit=(value:any)=>{
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){
   if(child&&typeof child==='object'&&(removedIds.has((child as any).props?.fileId)||removedIds.has((child as any).meta?.omsVectorPaint?.raster?.fileId))){
    removedShapes.add((child as any).id??key);delete value[key];continue;
   }
   visit(child);
  }
  const raster=value.meta?.omsVectorPaint?.raster;
  if(raster?.external){
   const id=fileLinks[raster.fileId];
   if(id){raster.fileId=id;raster.png=`${base}/api/files/${encodeURIComponent(id)}/download`;}
   else if(typeof raster.png==='string'&&raster.png.startsWith('blob:'))throw new Error('A canvas image has not finished uploading. Retry Save.');
  }
  if(value.props){
   if(value.props.orderId===localOrderId)value.props.orderId=orderId;
   const file=fileLinks[value.props.fileId];
   if(file){value.props.fileId=file;value.props.url=`${base}/api/files/${encodeURIComponent(file)}/download`;}
   else if(typeof value.props.url==='string'&&value.props.url.startsWith('blob:'))throw new Error('A canvas file has not finished uploading. Retry Save.');
  }
 };
 visit(copy);
 // A hidden form view may still hold a snapshot from before a file deletion.
 // Remove bindings to its viewers as well, so reload cannot restore dangling
 // arrow connections to records which no longer exist.
 if(store&&typeof store==='object'){
  for(const [id,record] of Object.entries(store)){
   const value=record as any;
   if(value?.typeName==='binding'&&(removedShapes.has(value.fromId)||removedShapes.has(value.toId)))delete store[id];
  }
 }
 const pages=copy?.session?.pageStates;
 if(Array.isArray(pages))for(const page of pages){
  if(Array.isArray(page.selectedShapeIds))page.selectedShapeIds=page.selectedShapeIds.filter((id:string)=>!removedShapes.has(id));
  if(removedShapes.has(page.focusedGroupId))page.focusedGroupId=null;
 }
 return copy;
}
