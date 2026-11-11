import type {Editor} from '@tldraw/tldraw';
import {base} from '$app/paths';
import {frameFilePocket,type ProductionFilePocket} from '$lib/order/file-pockets';
import {announceOrderFilesChanged} from '$lib/order/order-files-client';
import {getOrderBridge} from './state-bridge';
import {addOrderFileDocument} from './order-file-documents';

const pending=new WeakSet<Editor>();
export function canSaveProductionExport(editor:Editor,pocket:ProductionFilePocket){
 const bridge=getOrderBridge(editor);
 const frame=editor.getCurrentPageShapesSorted().find(s=>frameFilePocket(s)===pocket);
 return !!bridge?.orderId && !!frame && !editor.getInstanceState().isReadonly && !editor.isShapeOrAncestorLocked(frame);
}
/** Both persisted orders and unsaved drafts use the same canonical pocket type. */
export async function saveProductionExport(editor:Editor,file:File,pocket:ProductionFilePocket,signal?:AbortSignal){
 if(!canSaveProductionExport(editor,pocket)||pending.has(editor))throw new Error('readOnly');
 const bridge=getOrderBridge(editor)!,orderId=bridge.orderId!,pageId=editor.getCurrentPageId();
 pending.add(editor);
 try{
  let stored:{id:string;url:string};
  const queued=!!bridge.onFilesUpload;
  if(queued){
   if(!bridge.onStoreCanvasFile)throw new Error('saveFailed');
   stored=await bridge.onStoreCanvasFile(file,pocket);
  }else{
   const body=new FormData();body.set('file',file);body.set('order_id',orderId);body.set('file_type',pocket);
   const response=await fetch(base+'/api/files/upload',{method:'POST',body,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60_000)]):AbortSignal.timeout(60_000)});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||typeof result.file?.id!=='string')throw new Error('saveFailed');
   stored={id:result.file.id,url:`${base}/api/files/${encodeURIComponent(result.file.id)}/download`};
   announceOrderFilesChanged(orderId);
  }
  // A successful upload remains an attachment if the editor closed or became read-only.
  if(!signal?.aborted && editor.getCurrentPageId()===pageId && getOrderBridge(editor)?.orderId===orderId && canSaveProductionExport(editor,pocket)){
   editor.mark('save-production-export');
   addOrderFileDocument(editor,{...stored,originalName:file.name,mimeType:file.type},{x:0,y:0},pocket);
   editor.mark('save-production-export-complete');
  }
  return {queued,...stored};
 }finally{pending.delete(editor);}
}
