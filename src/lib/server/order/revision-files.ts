/** OMS-R15: independently verify two persisted files are linked to one order
 * before sending bytes externally or recording a proposed change request.
 */
import { error } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import {
  readOrderStoredFile,matchesOrderFileSignature
} from '$lib/server/files/order-storage';
import {
  toolkitMediaKind,toolkitMediaLimit,toolkitMediaContent
} from '$lib/server/toolkit/media-analysis';

export interface RevisionSource {
  id:string; name:string; mime:string; kind:'image'|'pdf';
  sha256:string; content:Record<string,unknown>;
}
export async function loadRevisionFiles(locals:App.Locals,orderId:string,
  baselineFileId:string,revisedFileId:string):Promise<[RevisionSource,RevisionSource]> {
  if(baselineFileId===revisedFileId)throw error(400,'Select two distinct order files');
  const ids=[baselineFileId,revisedFileId];
  const {data:links,error:linksError}=await locals.supabase.from('order_files')
    .select('file_id').eq('draft_order_id',orderId).in('file_id',ids);
  if(linksError)throw error(503,'Order file links unavailable');
  if(!links || new Set(links.map(x=>x.file_id)).size!==2)
    throw error(404,'Both compared files must belong to this order');
  const {data:files,error:fileError}=await locals.supabase.from('files')
    .select('id,original_name,filename,mimetype,size,filepath,metadata').in('id',ids);
  if(fileError)throw error(503,'Order file records unavailable');
  if(!files || files.length!==2)throw error(404,'Compared file record not found');
  const sources:RevisionSource[]=[];
  let total=0;
  for(const fileId of ids){
    const file=files.find(item=>item.id===fileId);
    if(!file)throw error(404,'Compared file record not found');
    const kind=toolkitMediaKind(file.mimetype);
    if(!kind)throw error(415,'Revision comparison accepts PDF, JPG, PNG and WebP');
    if(!Number.isSafeInteger(file.size)||file.size<1||file.size>toolkitMediaLimit(kind))
      throw error(413,'Revision comparison file exceeds the analysis limit');
    total+=file.size;
    if(total>20*1024*1024)throw error(413,'Combined revision files exceed 20 MiB');
    const bytes=await readOrderStoredFile(locals,file,toolkitMediaLimit(kind));
    const extension=kind==='pdf'?'pdf':file.mimetype==='image/png'?'png':
      file.mimetype==='image/webp'?'webp':'jpg';
    if(bytes.length!==file.size||!matchesOrderFileSignature(extension,bytes.subarray(0,16)))
      throw error(422,'Compared file failed integrity check');
    const name=String(file.original_name||file.filename||'Order file').slice(0,160);
    sources.push({id:file.id,name,mime:file.mimetype,kind,
      sha256:createHash('sha256').update(bytes).digest('hex'),
      content:toolkitMediaContent(name,file.mimetype,bytes)});
  }
  return [sources[0],sources[1]];
}
