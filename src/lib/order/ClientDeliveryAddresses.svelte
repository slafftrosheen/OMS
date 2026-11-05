<script lang="ts">
 import {onDestroy} from 'svelte';
 import {t} from 'svelte-i18n';
 type Choice={id:string;address:string;contact:string|null;phone:string|null;email:string|null;last_used_at:string};
 let {clientName,current,editable=true,onSelect}:{clientName:string;
  current:{deliveryAddress:string;deliveryContact:string;deliveryPhone:string;deliveryEmail:string};
  editable?:boolean;onSelect:(patch:typeof current)=>void}=$props();
 let choices=$state<Choice[]>([]),selected=$state(''),loadedClient=$state('');
 let loading=$state(false),problem=$state(''),replace=$state(false);
 let controller:AbortController|undefined;
 let preview=$derived(choices.find(c=>c.id===selected));
 let patch=$derived(preview?{deliveryAddress:preview.address,deliveryContact:preview.contact??'',
  deliveryPhone:preview.phone??'',deliveryEmail:preview.email??''}:null);
 let replaces=$derived(patch&&Object.entries(patch).some(([field,value])=>
  current[field as keyof typeof current]!==''&&current[field as keyof typeof current]!==value));
 $effect(()=>{const name=clientName; if(name!==loadedClient){
  controller?.abort();choices=[];selected='';replace=false;problem='';loading=false;
 }});
 onDestroy(()=>controller?.abort());
 async function load(){
  controller?.abort();controller=new AbortController();const request=controller,name=clientName;
  loading=true;problem='';choices=[];selected='';replace=false;
  try{
   const res=await fetch(`/api/client-delivery-addresses?client=${encodeURIComponent(name)}`,
    {signal:AbortSignal.any([request.signal,AbortSignal.timeout(12000)]),cache:'no-store'});
   if(!res.ok)throw new Error($t('clientAddresses.error'));
   const rows=await res.json();
   if(request!==controller||request.signal.aborted||name!==clientName)return;
   choices=rows;loadedClient=name;
  }catch(err){if(!request.signal.aborted&&name===clientName)problem=$t('clientAddresses.error');}
  finally{if(request===controller)loading=false;}
 }
 function apply(){
  if(!editable||!patch||loadedClient!==clientName||(replaces&&!replace))return;
  onSelect(patch);selected='';replace=false;
 }
</script>
<div class="address-book">
 <button type="button" onclick={load} disabled={!editable||loading||!clientName.trim()}>
  {$t(loading?'clientAddresses.loading':'clientAddresses.load')}</button>
 {#if problem}<p role="alert">{problem}</p>{/if}
 {#if loadedClient===clientName&&!loading&&choices.length===0}<p>{$t('clientAddresses.empty')}</p>{/if}
 {#if choices.length}
  <label>{$t('clientAddresses.choose')}<select bind:value={selected} onchange={()=>replace=false} disabled={!editable}>
   <option value="">—</option>{#each choices as c (c.id)}<option value={c.id}>{c.address}</option>{/each}
  </select></label>
 {/if}
 {#if preview&&patch}
  <p>{preview.address}<br/>{preview.contact??'—'} · {preview.phone??'—'} · {preview.email??'—'}</p>
  {#if replaces}<label class="ack"><input type="checkbox" bind:checked={replace} disabled={!editable}/>{$t('clientAddresses.replace')}</label>{/if}
  <button type="button" onclick={apply} disabled={!editable||(replaces&&!replace)}>{$t('clientAddresses.use')}</button>
 {/if}
 <small>{$t('clientAddresses.savedHint')}</small>
</div>
<style>
 .address-book{display:grid;gap:8px;grid-column:1/-1;padding:12px;border:1px solid var(--border);border-radius:8px}
 label{display:grid;gap:6px}.ack{display:flex;align-items:flex-start;gap:8px}
 p,small{margin:0;line-height:1.5;overflow-wrap:anywhere;color:var(--ink-secondary)}
 button,select{font:inherit;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-1);color:var(--ink);max-width:100%}
 button{justify-self:start}button:disabled{opacity:.55}
</style>
