import {frameFilePocket,PRODUCTION_FILE_POCKETS,type ProductionFilePocket} from './file-pockets';
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
export function updateCreationCanvasPockets(snapshot:unknown,pockets:Record<string,ProductionFilePocket>){
 const copy=JSON.parse(JSON.stringify(snapshot)),store=copy?.document?.store??copy?.store??{};
 const frames=new Map<ProductionFilePocket,any>();
 for(const record of Object.values(store)){
  const frame=record as any,pocket=frame&&frameFilePocket(frame);if(pocket)frames.set(pocket,frame);
 }
 for(const record of Object.values(store)){
  const doc=record as any,pocket=pockets[doc?.props?.fileId];
  if(doc?.type!=='document'||!pocket)continue;
  doc.meta={...doc.meta,omsFilePocket:pocket};const frame=frames.get(pocket);
  if(frame&&doc.parentId!==frame.id){doc.parentId=frame.id;doc.x=24;doc.y=180;}
 }
 return copy;
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
