/** Remove queued files that were deleted and replace local references after upload. */
export function prepareCreationCanvas(snapshot:unknown,localOrderId:string,orderId:string,fileLinks:Record<string,string>,removedIds:Set<string>,base=''){
 const copy=JSON.parse(JSON.stringify(snapshot));
 const removedShapes=new Set<string>();
 const visit=(value:any)=>{
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){
   if(child&&typeof child==='object'&&removedIds.has((child as any).props?.fileId)){
    removedShapes.add((child as any).id??key);delete value[key];continue;
   }
   visit(child);
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
 const store=copy?.document?.store??copy?.store;
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
