/** Remove queued files that were deleted and replace local references after upload. */
export function prepareCreationCanvas(snapshot:unknown,localOrderId:string,orderId:string,fileLinks:Record<string,string>,removedIds:Set<string>,base=''){
 const copy=JSON.parse(JSON.stringify(snapshot));
 const visit=(value:any)=>{
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){
   if(child&&typeof child==='object'&&removedIds.has((child as any).props?.fileId)){delete value[key];continue;}
   visit(child);
  }
  if(value.props){
   if(value.props.orderId===localOrderId)value.props.orderId=orderId;
   const file=fileLinks[value.props.fileId];
   if(file){value.props.fileId=file;value.props.url=`${base}/api/files/${encodeURIComponent(file)}/download`;}
   else if(typeof value.props.url==='string'&&value.props.url.startsWith('blob:'))throw new Error('A canvas file has not finished uploading. Retry Save.');
  }
 };
 visit(copy);return copy;
}
