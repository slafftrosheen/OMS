import React from 'react';
import {BaseBoxShapeUtil,HTMLContainer,useValue,type TLBaseShape} from '@tldraw/tldraw';
type Annotation=TLBaseShape<'order-annotation',{w:number;h:number;kind:string;icon:string;text:string}>;
export class OrderAnnotationShapeUtil extends BaseBoxShapeUtil<Annotation>{
 static override type='order-annotation' as const;
 override getDefaultProps(){return {w:300,h:200,kind:'comment',icon:'✎',text:''};}
 override component(shape:Annotation){
  const disabled=useValue('annotation permission',()=>this.editor.getInstanceState().isReadonly,[this.editor]);
  const update=(patch:Partial<Annotation['props']>)=>{if(!disabled)this.editor.updateShape({id:shape.id,type:shape.type,props:patch});};
  return <HTMLContainer id={shape.id} style={{width:shape.props.w,height:shape.props.h,pointerEvents:'all',background:'var(--bg-1)',border:`2px solid var(${shape.props.kind==='warning'?'--warning':'--border'})`,borderRadius:10,overflow:'hidden',display:'flex',flexDirection:'column'}}>
   <div style={{padding:8,display:'flex',gap:8,borderBottom:'1px solid var(--border)'}}>
    <input aria-label="Badge icon" value={shape.props.icon} maxLength={8} disabled={disabled} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onChange={e=>update({icon:e.target.value})} style={{width:42,fontSize:20,color:'var(--ink-primary)',background:'var(--bg-2)',border:0}}/>
    <select aria-label="Comment type" value={shape.props.kind} disabled={disabled} onPointerDown={e=>e.stopPropagation()} onChange={e=>update({kind:e.target.value,icon:e.target.value==='warning'?'⚠':e.target.value==='explanation'?'ℹ':'✎'})} style={{minWidth:0,flex:1,color:'var(--ink-primary)',background:'var(--bg-2)',border:0}}><option value="comment">Comment</option><option value="warning">Warning</option><option value="explanation">Explanation</option></select>
   </div>
   <textarea aria-label="Annotation" placeholder="Write a note or explain what needs attention…" value={shape.props.text} maxLength={4000} disabled={disabled} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onChange={e=>update({text:e.target.value})} style={{flex:1,resize:'none',border:0,padding:12,font:'inherit',color:'var(--ink-primary)',background:'transparent'}}/>
  </HTMLContainer>;
 }
 override indicator(shape:Annotation){return <rect width={shape.props.w} height={shape.props.h}/>;}
}
