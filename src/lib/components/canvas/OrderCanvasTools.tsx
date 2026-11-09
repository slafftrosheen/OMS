import React,{useEffect,useRef,useState} from 'react';
import {createShapeId,useEditor,useValue} from '@tldraw/tldraw';
import {getOrderBridge} from './state-bridge';
import {uploadOrderCanvasFiles} from './asset-uploader';
export function OrderCanvasTools(){
 const editor=useEditor();const input=useRef<HTMLInputElement>(null);
 const readonly=useValue('canvas permissions',()=>editor.getInstanceState().isReadonly,[editor]);
 const [status,setStatus]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{const container=editor.getContainer();const listen=(event:Event)=>{const detail=(event as CustomEvent).detail;setStatus(detail.message);setBusy(detail.busy);};container.addEventListener('oms:canvas-upload',listen);return()=>container.removeEventListener('oms:canvas-upload',listen);},[editor]);
 function add(kind:string){if(readonly)return;const center=editor.getViewportPageBounds().center;const id=createShapeId();editor.createShape({id,type:'order-annotation',x:center.x-150,y:center.y-100,props:{kind,icon:kind==='warning'?'⚠':kind==='explanation'?'ℹ':'✎',text:''}} as any);editor.select(id);editor.setCurrentTool('select');}
 async function upload(files:File[]){const form=editor.getCurrentPageShapes().find(s=>s.type==='order-details');const orderId=getOrderBridge(editor)?.orderId||(form?.props as any)?.orderId;if(!orderId)return;await uploadOrderCanvasFiles(editor,files,orderId,editor.getViewportPageBounds().center);}
 return <section aria-label="Order canvas tools" style={{position:'absolute',top:64,left:12,maxWidth:'calc(100% - 24px)',pointerEvents:'all',background:'var(--bg-1)',color:'var(--ink-primary)',border:'1px solid var(--border)',borderRadius:8,padding:10,fontSize:12}} onPointerDown={e=>e.stopPropagation()}>
  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
   <input ref={input} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.cdr,.dxf" hidden onChange={e=>{void upload(Array.from(e.target.files??[]));e.target.value='';}}/>
   {[["Upload files",()=>input.current?.click()],["Note",()=>add('comment')],["Warning",()=>add('warning')],["Explain",()=>add('explanation')],["Draw",()=>editor.setCurrentTool('draw')],["Mark",()=>editor.setCurrentTool('highlight')],["Arrow",()=>editor.setCurrentTool('arrow')],["Select",()=>editor.setCurrentTool('select')]].map(([label,action])=><button key={String(label)} type="button" disabled={readonly||busy} onClick={action as ()=>void} style={{minHeight:36,padding:'6px 10px',font:'inherit',background:'var(--bg-2)',color:'var(--ink-primary)',border:'1px solid var(--border)',borderRadius:5}}>{String(label)}</button>)}
  </div>
  <p style={{margin:'6px 0 0'}}>Upload or drop PDF drawings and images. Add notes, warning badges or marks beside the form. Save Draft keeps your changes.</p>
  {status&&<p role="status" style={{margin:'6px 0 0',overflowWrap:'anywhere'}}>{status}</p>}
 </section>;
}
