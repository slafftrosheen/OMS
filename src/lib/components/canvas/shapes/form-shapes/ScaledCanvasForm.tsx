import React,{useEffect,useRef,type ReactNode} from 'react';
import {HTMLContainer,useValue,type Editor,type TLShape} from '@tldraw/tldraw';
import {FORM_WIDTHS} from './form-layout';
import {validCadPoint} from '../../cad-settings';
/** The HTML sheet has an invariant layout width. Canvas resizing only changes
 * its visual scale, exactly as zooming a drawing does. No mobile breakpoints. */
export function ScaledCanvasForm({shape,editor,children}:{shape:TLShape;editor:Editor;children:ReactNode}){
 const content=useRef<HTMLDivElement>(null),naturalWidth=FORM_WIDTHS[shape.type];
 const editable=useValue('form layout permission',()=>!editor.getInstanceState().isReadonly&&!editor.isShapeOrAncestorLocked(shape.id),[editor,shape.id]);
 const props=shape.props as {w:number;h:number},scale=props.w/naturalWidth;
 useEffect(()=>{
  if(!content.current)return;
  const observer=new ResizeObserver(()=>{
   const current=editor.getShape(shape.id);if(!current||editor.getInstanceState().isReadonly||editor.isShapeOrAncestorLocked(current))return;
   const p=current.props as {w:number;h:number};
   const currentScale=p.w/naturalWidth;
   // Minimum, rounding and tolerance belong to the HTML layout, not the
   // document. A 6000 mm form may span only a few canvas units at 1:10000.
   const height=Math.max(80,Math.ceil(content.current!.offsetHeight))*currentScale;
   if(!Number.isFinite(height)||height<=0||!Number.isFinite(currentScale)||currentScale<=0)return;
   const transform=editor.getShapePageTransform(current);
   if(![{x:0,y:0},{x:p.w,y:0},{x:p.w,y:height},{x:0,y:height}].every(point=>validCadPoint(transform.applyToPoint(point))))return;
   if(Math.abs(height-p.h)>currentScale*(1+1e-8))editor.run(()=>editor.updateShape({id:current.id,type:current.type,props:{h:height}}),{history:'ignore'});
  });
  observer.observe(content.current);return ()=>observer.disconnect();
 },[editor,shape.id,naturalWidth,scale,editable]);
 return <HTMLContainer id={shape.id} className="canvas-form-sheet" style={{width:props.w,height:props.h,pointerEvents:'all',background:'var(--bg-1)',color:'var(--ink-primary)',border:`${scale}px solid var(--border)`,borderRadius:6*scale,overflow:'hidden'}}>
  <div ref={content} style={{width:naturalWidth,transform:`scale(${scale})`,transformOrigin:'top left',boxSizing:'border-box'}}>{children}</div>
 </HTMLContainer>;
}
