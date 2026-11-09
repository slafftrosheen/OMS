/** Canonical order uploads shared by the visible picker and drag/drop. */
import {createShapeId,type Editor} from '@tldraw/tldraw';
import {getOrderBridge} from './state-bridge';
import {announceOrderFilesChanged} from '$lib/order/order-files-client';
import {base} from '$app/paths';
export interface UploadedAsset{id:string;url:string;fileName:string;mime:string;kind:'image'|'pdf'|'file'}
const pending=new WeakSet<Editor>();
const lifetimes=new WeakMap<Editor,AbortController>();
export function cancelOrderCanvasUploads(editor:Editor){lifetimes.get(editor)?.abort();lifetimes.delete(editor);}
export async function uploadOrderCanvasFiles(editor:Editor,files:File[],orderId:string,position:{x:number;y:number},signal?:AbortSignal){
 if(editor.getInstanceState().isReadonly||pending.has(editor)||!files.length)return;
 let lifetime=lifetimes.get(editor);if(!lifetime){lifetime=new AbortController();lifetimes.set(editor,lifetime);}
 signal=signal?AbortSignal.any([signal,lifetime.signal]):lifetime.signal;
 const local=getOrderBridge(editor)?.onFilesUpload;
 pending.add(editor);
 const report=(message:string,busy:boolean)=>editor.getContainer().dispatchEvent(new CustomEvent('oms:canvas-upload',{detail:{message,busy}}));
 const failures:string[]=[];let completed=0;
 try{
  if(local){report(`Preparing ${files.length} file(s)…`,true);try{await local(files,position);completed=files.length;}catch(err){failures.push(err instanceof Error?err.message:'Could not attach files');}return;}
  for(const [index,file] of files.entries()){
   if(signal?.aborted||editor.getInstanceState().isReadonly)break;
   report(`Uploading ${index+1}/${files.length}: ${file.name}`,true);
   try{
    const body=new FormData();body.set('file',file);body.set('order_id',orderId);body.set('file_type','canvas-asset');
    const res=await fetch(base+'/api/files/upload',{method:'POST',body,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60_000)]):AbortSignal.timeout(60_000)});
    const result=await res.json().catch(()=>({}));
    if(!res.ok||typeof result.file?.id!=='string')throw new Error(result.message||result.error||'Upload failed');
    announceOrderFilesChanged(orderId);
    if(signal?.aborted||editor.getInstanceState().isReadonly)break;
    const f=result.file,mime=f.mimeType||f.mime_type||file.type;
    const kind=mime==='application/pdf'?'pdf':mime.startsWith('image/')?'image':'file';
    const url=`${base}/api/files/${encodeURIComponent(f.id)}/download`;
    editor.createShape({id:createShapeId(),type:'document',x:position.x+index*28,y:position.y+index*28,
     props:{w:kind==='image'?420:320,h:360,title:file.name,content:'',status:'ready',url,mime,kind,fileId:f.id}} as any);
    getOrderBridge(editor)?.onAssetUploaded?.(orderId,{url,fileName:file.name,kind});completed++;
   }catch(err){if(!signal?.aborted)failures.push(`${file.name}: ${err instanceof Error?err.message:'Upload failed'}`);}
  }
 }finally{pending.delete(editor);if(!signal?.aborted)report(failures.length?failures.join(' · '):`${completed} file(s) attached. Save Draft to keep their canvas placement.`,false);}
}
export function wireAssetDropHandler(container:HTMLElement,editor:Editor,getOrderId:()=>string|null){
 const controller=new AbortController();
 const drag=(event:DragEvent)=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();event.dataTransfer.dropEffect=editor.getInstanceState().isReadonly?'none':'copy';}};
 const drop=(event:DragEvent)=>{if(!event.dataTransfer?.files.length)return;event.preventDefault();event.stopPropagation();const id=getOrderId();if(id)void uploadOrderCanvasFiles(editor,Array.from(event.dataTransfer.files),id,editor.screenToPage({x:event.clientX,y:event.clientY}),controller.signal);};
 container.addEventListener('dragover',drag,true);container.addEventListener('drop',drop,true);
 return ()=>{controller.abort();container.removeEventListener('dragover',drag,true);container.removeEventListener('drop',drop,true);};
}
