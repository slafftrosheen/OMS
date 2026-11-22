import React,{useEffect,useRef,useState} from 'react';
import {useEditor,useValue} from '@tldraw/tldraw';
import {PRODUCTION_FILE_POCKETS,type ProductionFilePocket} from '$lib/order/file-pockets';
import {getOrderBridge} from './state-bridge';
import {canSaveProductionExport,saveProductionExport} from './production-export';
import {useWorkbenchText} from './workbench-copy';
import type {CanvasDxfRelease} from '$lib/order/canvas-dxf-release';

export function ProductionSaveButton({extension,disabled=false,createFile,release,errorMessage,onStatus}:{extension:string;disabled?:boolean;createFile:(signal:AbortSignal)=>Blob|Promise<Blob>;release?:CanvasDxfRelease;errorMessage?:(error:unknown)=>string;onStatus?:(message:string)=>void}){
 const editor=useEditor(),t=useWorkbenchText();
 const [pocket,setPocket]=useState<ProductionFilePocket>(extension==='dxf'?'cnc':'visuals');
 const [name,setName]=useState('OMS-drawing'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(message)onStatus?.(message);},[message,onStatus]);
 const lifetime=useRef<AbortController>();const latest=useRef({disabled,createFile,release});latest.current={disabled,createFile,release};
 useEffect(()=>{const controller=new AbortController();lifetime.current=controller;return ()=>controller.abort();},[]);
 const allowed=useValue('save export permission',()=>canSaveProductionExport(editor,pocket),[editor,pocket]);
 if(!getOrderBridge(editor)?.orderId)return null;
 return <fieldset className="drawing-production-save" disabled={busy} data-testid="production-export">
  <label><span>{t('filename')}</span><input value={name} maxLength={150} onChange={e=>setName(e.target.value)} /></label>
  <label><span>{t('destination')}</span><select value={pocket} onChange={e=>setPocket(e.target.value as ProductionFilePocket)}>{PRODUCTION_FILE_POCKETS.map(p=><option key={p} value={p}>{t(p)}</option>)}</select></label>
  <button type="button" disabled={disabled||!allowed||!name.trim()||busy} onClick={()=>void (async()=>{
   if(latest.current.disabled||!canSaveProductionExport(editor,pocket))return;
   setBusy(true);setMessage(t('saving'));const controller=lifetime.current!;
   try{
    const reviewed=latest.current;
    const blob=await reviewed.createFile(controller.signal);
    if(controller.signal.aborted)return;
    if(latest.current.disabled || reviewed.release !== latest.current.release)throw new Error('changed');
    const filename=name.trim().replace(/[\\/\r\n\0<>]/g,'_').replace(new RegExp(`\\.${extension}$`,'i'),'')+'.'+extension;
    const result=await saveProductionExport(editor,new File([blob],filename,{type:blob.type}),pocket,controller.signal,reviewed.release);
    if(!controller.signal.aborted)setMessage(t(result.queued?'queued':'saved'));
   }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error&&['readOnly','changed'].includes(error.message)?t(error.message as 'readOnly'|'changed'):errorMessage?.(error)??t('saveFailed'));}
   finally{if(!controller.signal.aborted)setBusy(false);}
  })()}>{busy?t('saving'):`${t('saveInto')} ${t(pocket)} · ${extension.toUpperCase()}`}</button>
  {message&&<p role="status">{message}</p>}
 </fieldset>;
}
