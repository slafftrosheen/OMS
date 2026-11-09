import React, {useEffect,useRef} from 'react';
import {BaseBoxShapeUtil,HTMLContainer,useValue,type Editor,type TLBaseShape} from '@tldraw/tldraw';
import {mount,unmount} from 'svelte';
import {writable} from 'svelte/store';
import CanvasProfileForm from './CanvasProfileForm.svelte';
import {getOrderBridge} from '../../state-bridge';
export type Profile7stData=Record<string,any>;
export type Profile7stShapeProps={w:number;h:number;orderId:string;profileIndex:number;quantity:number;data:Profile7stData};
export type Profile7stShape=TLBaseShape<'profile-7st',Profile7stShapeProps>;
function NativeProfile({shape,editor}:{shape:Profile7stShape;editor:Editor}){
 const host=useRef<HTMLDivElement>(null);
 const latest=useRef(shape);latest.current=shape;
 const editable=useValue('profile edit permission',()=>!editor.getInstanceState().isReadonly,[editor]);
 const state=useRef(writable({configuration:shape.props.data,editable}));
 useEffect(()=>{state.current.set({configuration:shape.props.data,editable});},[shape.props.data,editable]);
 useEffect(()=>{
  if(!host.current)return;
  const component=mount(CanvasProfileForm,{target:host.current,props:{formState:state.current,onChange:(configuration:Record<string,unknown>)=>{
   if(editor.getInstanceState().isReadonly)return;
   const current=latest.current;
   editor.updateShape({id:current.id,type:current.type,props:{data:configuration}});
   getOrderBridge(editor)?.onProfileChange?.(current.props.orderId,current.props.profileIndex,configuration);
  }}});
  return ()=>{void unmount(component);};
 },[editor]);
 return <HTMLContainer id={shape.id} style={{width:shape.props.w,height:shape.props.h,pointerEvents:'all',background:'var(--bg-1)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',overflow:'auto'}}>
  <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',fontWeight:600}}>#{shape.props.profileIndex+1} · {String(shape.props.data.profileName||'Production profile')}
   <label style={{float:'right'}}>Qty <input aria-label="Profile quantity" type="number" min={1} max={1000} value={shape.props.quantity??1} disabled={!editable} style={{width:70}} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onChange={e=>{const quantity=Number(e.target.value);if(!Number.isInteger(quantity)||quantity<1||quantity>1000)return;editor.updateShape({id:shape.id,type:shape.type,props:{quantity}});getOrderBridge(editor)?.onProfileQuantityChange?.(shape.props.orderId,shape.props.profileIndex,quantity);}}/></label></div>
  <div ref={host} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} style={{padding:16}}/>
 </HTMLContainer>;
}
export class Profile7stShapeUtil extends BaseBoxShapeUtil<Profile7stShape>{
 static override type='profile-7st' as const;
 override getDefaultProps():Profile7stShapeProps{return {w:1000,h:1200,orderId:'',profileIndex:0,quantity:1,data:{}};}
 override component(shape:Profile7stShape){return <NativeProfile shape={shape} editor={this.editor}/>;}
 override indicator(shape:Profile7stShape){return <rect width={shape.props.w} height={shape.props.h}/>;}
}
