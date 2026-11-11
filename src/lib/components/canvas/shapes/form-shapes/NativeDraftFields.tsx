import {ScaledCanvasForm} from './ScaledCanvasForm';
import React,{useEffect,useRef} from 'react';
import {useValue,type Editor} from '@tldraw/tldraw';
import {mount,unmount} from 'svelte';
import {writable} from 'svelte/store';
import CanvasDraftFields from './CanvasDraftFields.svelte';
import {getOrderBridge} from '../../state-bridge';
export function NativeDraftFields({shape,editor,section}:{shape:any;editor:Editor;section:'details'|'delivery'}){
 const host=useRef<HTMLDivElement>(null);const latest=useRef(shape);latest.current=shape;
 const editable=useValue('draft fields permission',()=>!editor.getInstanceState().isReadonly&&!editor.isShapeOrAncestorLocked(shape.id),[editor,shape.id]);
 const state=useRef(writable({data:shape.props,editable}));
 useEffect(()=>{state.current.set({data:shape.props,editable});},[shape.props,editable]);
 useEffect(()=>{
  if(!host.current)return;
  const component=mount(CanvasDraftFields,{target:host.current,props:{formState:state.current,section,idPrefix:shape.id+'-',onChange:(patch:Record<string,unknown>)=>{
   if(editor.getInstanceState().isReadonly||editor.isShapeOrAncestorLocked(latest.current.id))return;
   const current=latest.current;
   editor.updateShape({id:current.id,type:current.type,props:patch});
   getOrderBridge(editor)?.onOrderChange?.(current.props.orderId,patch);
  }}});return ()=>{void unmount(component);};
 },[editor,section]);
 return <ScaledCanvasForm shape={shape} editor={editor}>
  <div ref={host} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} style={{padding:16}}/>
 </ScaledCanvasForm>;
}
