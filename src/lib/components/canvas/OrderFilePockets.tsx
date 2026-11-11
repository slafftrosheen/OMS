import React, {createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode} from 'react';
import {HTMLContainer, useEditor, useValue, type Editor, type TLFrameShape} from '@tldraw/tldraw';
import {locale} from 'svelte-i18n';
import {get} from 'svelte/store';
import {base} from '$app/paths';
import {fetchAllOrderFiles, watchOrderFilesChanged} from '$lib/order/order-files-client';
import {filePocket, frameFilePocket, PRODUCTION_FILE_POCKETS, type ProductionFilePocket, type CanvasOrderAttachment} from '$lib/order/file-pockets';
import {filePreviewCopy} from '$lib/order/file-preview-copy';
import {uploadOrderCanvasFiles} from './asset-uploader';
import {getOrderBridge} from './state-bridge';
import {arrangeProductionPocket} from './production-layout';
import {documentFilePocket} from './order-file-documents';

type PocketFile = {id:string; originalName:string; mimeType?:string; file_type?:string; url?:string};
const Context = createContext<{enabled:boolean;local:boolean;files:PocketFile[];loading:boolean;failed:boolean;refresh:()=>void}>({enabled:false,local:false,files:[],loading:false,failed:false,refresh:()=>{}});
export function OrderFilePocketsProvider({orderId,local,attachments=[],children}:{orderId?:string;local:boolean;attachments?:CanvasOrderAttachment[];children:ReactNode}) {
  const [files,setFiles]=useState<PocketFile[]>([]),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!orderId || local){setFiles([]);setLoading(false);setFailed(false);return;}
    const controller=new AbortController();let active=true;
    setFiles([]);setLoading(true);setFailed(false);
    void fetchAllOrderFiles<PocketFile>(orderId,(input,init)=>fetch(base+String(input),{...init,signal:controller.signal})).then(result=>{
      if(active)setFiles(result);
    }).catch(()=>{if(active)setFailed(true);}).finally(()=>{if(active)setLoading(false);});
    const unwatch=watchOrderFilesChanged(id=>{if(id===orderId)setRetry(value=>value+1);});
    return ()=>{active=false;controller.abort();unwatch();};
  },[orderId,local,retry]);
  return <Context.Provider value={{enabled:!!orderId,local,files:local?attachments:files,loading,failed,refresh:()=>setRetry(value=>value+1)}}>{children}</Context.Provider>;
}
const subscribe=(notify:()=>void)=>locale.subscribe(()=>notify());
const snapshot=()=>get(locale);
function PocketList({editor,shape,pocket}:{editor:Editor;shape?:TLFrameShape;pocket:ProductionFilePocket}) {
  const context=useContext(Context),copy=filePreviewCopy(useSyncExternalStore(subscribe,snapshot,snapshot));
  const input=useRef<HTMLInputElement>(null),list=useRef<HTMLElement>(null);
  const state=useValue('production pocket documents',()=>({
    readonly:!shape || editor.getInstanceState().isReadonly || editor.isShapeOrAncestorLocked(shape),
    documents:editor.getCurrentPageShapesSorted().filter(s=>s.type==='document' && (s.props as any).fileId)
  }),[editor,shape]);
  const assignment=new Map<string,string>();
  for(const doc of state.documents){
    const key=documentFilePocket(editor,doc);
    if(key)assignment.set((doc.props as any).fileId,String(key));
  }
  const files=context.files.filter(file=>(assignment.get(file.id) ?? filePocket(file.file_type))===pocket);
  const layoutKey=JSON.stringify(state.documents.map(s=>[s.id,s.parentId,s.x,s.y,s.rotation,s.isLocked,(s.props as any).w,(s.props as any).h,s.meta.omsAutoArrange]));
  useEffect(()=>{
    if(!shape||!list.current||state.readonly)return;
    const resize=()=>{
      const current=editor.getShape(shape.id);if(!current||editor.getInstanceState().isReadonly||editor.isShapeOrAncestorLocked(current))return;
      const height=Math.ceil(list.current?.offsetHeight??152)+12;
      editor.run(()=>{
        if(current.meta.omsPocketHeaderHeight!==height)editor.updateShape({id:current.id,type:current.type,meta:{...current.meta,omsPocketHeaderHeight:height}});
        arrangeProductionPocket(editor,shape.id,height);
      },{history:'ignore'});
    };
    const observer=new ResizeObserver(resize);observer.observe(list.current);resize();return ()=>observer.disconnect();
  },[editor,shape?.id,shape?.props.w,state.readonly,files.length,layoutKey]);
  if(!context.enabled)return null;
  const stop=(event:React.SyntheticEvent)=>event.stopPropagation();
  return <HTMLContainer style={{...(shape?{left:12,top:12,width:Math.max(120,shape.props.w-24)}:{position:'relative',width:'100%',marginBottom:8}),height:'auto',pointerEvents:'all',background:'var(--bg-1)',color:'var(--ink-primary,var(--text))',border:'1px solid var(--border)',borderRadius:6,overflow:'visible'}}>
    <section ref={list} data-testid={`production-pocket-${pocket}`} aria-label={`${copy.pocket}: ${copy[pocket]}`}
      onPointerDown={stop} onKeyDown={stop} onWheel={stop} onDoubleClick={stop} style={{padding:10,fontSize:13}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}>
        <strong>{copy[pocket]} · {files.length}</strong>
        <button type="button" disabled={state.readonly} onClick={()=>input.current?.click()}>{copy.add}</button>
        <input ref={input} hidden type="file" multiple onChange={event=>{
          const selected=Array.from(event.target.files??[]);event.target.value='';
          const id=getOrderBridge(editor)?.orderId;
          if(shape && !state.readonly && typeof id==='string'){
            const point=editor.getShapePageTransform(shape).applyToPoint({x:24,y:180});
            void uploadOrderCanvasFiles(editor,selected,id,point);
          }
        }}/>
      </div>
      {context.loading?<p role="status">…</p>:context.failed?<p role="alert">{copy.unavailable} <button type="button" onClick={context.refresh}>{copy.retry}</button></p>:
        !files.length?<p>{copy.empty}</p>:<ul style={{margin:'8px 0 0',paddingLeft:18}}>{files.map(file=><li key={file.id} style={{overflowWrap:'anywhere',padding:'3px 0'}}>
          <a href={context.local?file.url:`${base}/api/files/${encodeURIComponent(file.id)}/download`} download={file.originalName}
            aria-label={`${copy.download} ${file.originalName}`}>{file.originalName}</a>
        </li>)}</ul>}
    </section>
  </HTMLContainer>;
}
/** Overlay the existing frames without replacing their native schema or tools. */
export function OrderFilePocketOverlays() {
  const editor=useEditor();
  const frames=useValue('production file frame positions',()=>editor.getCurrentPageShapesSorted()
    .filter(shape=>frameFilePocket(shape)).map(shape=>({shape:shape as TLFrameShape,transform:editor.getShapePageTransform(shape).toCssString()})),[editor]);
  return <>{frames.map(({shape,transform})=><div key={shape.id} style={{position:'absolute',transform,transformOrigin:'0 0',zIndex:1000000,pointerEvents:'none'}}>
    <PocketList editor={editor} shape={shape} pocket={frameFilePocket(shape)!}/>
  </div>)}</>;
}
/** Readers can access attachments even when no canvas was ever saved. */
export function OrderFilePocketFallback() {
  const editor=useEditor(),context=useContext(Context);
  const present=useValue('existing production pockets',()=>new Set(editor.getCurrentPageShapesSorted().map(frameFilePocket)),[editor]);
  const missing=PRODUCTION_FILE_POCKETS.filter(pocket=>!present.has(pocket));
  if(!context.enabled || !missing.length)return null;
  return <div style={{position:'absolute',right:12,top:12,width:340,maxWidth:'calc(100% - 24px)',maxHeight:'calc(100% - 24px)',overflow:'auto',pointerEvents:'all',zIndex:500}}>
    {missing.map(pocket=><PocketList key={pocket} editor={editor} pocket={pocket}/>)}
  </div>;
}
