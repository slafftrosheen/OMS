import React,{useEffect,useRef} from 'react';
import {mount,unmount} from 'svelte';
import DxfPreview from '$lib/order/DxfPreview.svelte';
export function DxfDocumentPreview({url,title}:{url:string;title:string}) {
  const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!host.current)return;
    const component=mount(DxfPreview,{target:host.current,props:{source:url,title}});
    return ()=>{void unmount(component);};
  },[url,title]);
  return <div ref={host} style={{flex:1,minHeight:0,overflow:'auto'}}/>;
}
