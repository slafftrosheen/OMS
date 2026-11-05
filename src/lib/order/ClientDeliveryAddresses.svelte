<script lang="ts">
 import {onDestroy,untrack} from 'svelte';
 import {t,locale} from 'svelte-i18n';
 import {clientAddressChoicesSchema,clientAddressHistorySchema,filterClientAddresses,deliveryFingerprint,
  type ClientAddressChoice,type ClientAddressHistory,type DeliveryDetails} from './client-address-review';
 let {clientName,current,editable=true,onSelect}:{clientName:string;current:DeliveryDetails;
  editable?:boolean;onSelect:(patch:DeliveryDetails)=>void}=$props();
 let choices=$state<ClientAddressChoice[]>([]),selected=$state(''),loadedClient=$state<string|null>(null);
 let loading=$state(false),problem=$state(''),replace=$state(false),search=$state(''),notice=$state('');
 let replaceBaseline=$state('');
 let history=$state<ClientAddressHistory|null>(null),historyOpen=$state(false),historyLoading=$state(false),historyProblem=$state('');
 let controller:AbortController|undefined,historyController:AbortController|undefined;
 let disposed=false;
 let owner=untrack(()=>clientName);
 let preview=$derived(choices.find(c=>c.id===selected));
 let visibleChoices=$derived(filterClientAddresses(choices,search));
 let patch=$derived(preview?{deliveryAddress:preview.address,deliveryContact:preview.contact??'',
  deliveryPhone:preview.phone??'',deliveryEmail:preview.email??''}:null);
 let replaces=$derived(patch&&Object.entries(patch).some(([field,value])=>
  current[field as keyof DeliveryDetails]!==''&&current[field as keyof DeliveryDetails]!==value));
 let currentFingerprint=$derived(deliveryFingerprint(current));
 $effect(()=>{const name=clientName;if(name!==owner){
  owner=name;controller?.abort();historyController?.abort();choices=[];selected='';loadedClient=null;
  replace=false;problem='';notice='';loading=false;search='';history=null;historyOpen=false;historyProblem='';historyLoading=false;
 }});
 $effect(()=>{if(selected&&!visibleChoices.some(c=>c.id===selected))choose('');});
 $effect(()=>{if(replace&&replaceBaseline!==currentFingerprint){replace=false;notice=$t('clientAddresses.editsChanged');}});
 onDestroy(()=>{disposed=true;controller?.abort();historyController?.abort();});
 function date(value:string){return new Intl.DateTimeFormat($locale||'en',{dateStyle:'medium'}).format(new Date(value));}
 function choose(value:string){
  selected=value;replace=false;notice='';historyController?.abort();history=null;historyOpen=false;historyProblem='';historyLoading=false;
 }
 async function load(){
  controller?.abort();controller=new AbortController();const request=controller,name=clientName;
  loading=true;problem='';choices=[];choose('');search='';notice='';loadedClient=null;
  try{
   const res=await fetch(`/api/client-delivery-addresses?client=${encodeURIComponent(name)}`,
    {signal:AbortSignal.any([request.signal,AbortSignal.timeout(12000)]),cache:'no-store'});
   if(!res.ok)throw new Error();
   const rows=clientAddressChoicesSchema.parse(await res.json());
   if(disposed||request!==controller||request.signal.aborted||name!==clientName)return;
   choices=rows;loadedClient=name;
  }catch{if(!disposed&&!request.signal.aborted&&name===clientName)problem=$t('clientAddresses.error');}
  finally{if(!disposed&&request===controller)loading=false;}
 }
 async function loadHistory(offset=0){
  if(!selected||loadedClient!==clientName)return;
  historyController?.abort();historyController=new AbortController();
  const request=historyController,addressId=selected,name=clientName;
  historyOpen=true;historyLoading=true;historyProblem='';
  try{
   const res=await fetch(`/api/client-delivery-addresses/${encodeURIComponent(addressId)}/history?offset=${offset}`,
    {signal:AbortSignal.any([request.signal,AbortSignal.timeout(12000)]),cache:'no-store'});
   if(!res.ok)throw new Error();
   const page=clientAddressHistorySchema.parse(await res.json());
   if(disposed||request!==historyController||request.signal.aborted||selected!==addressId||clientName!==name)return;
   const items=offset?[...(history?.items??[]),...page.items]:page.items;
   if((offset&&history?.total!==page.total)||new Set(items.map(row=>row.id)).size!==items.length)
    throw new Error();
   history={...page,items};
  }catch{if(!disposed&&!request.signal.aborted&&selected===addressId)historyProblem=$t('clientAddresses.historyError');}
  finally{if(!disposed&&request===historyController)historyLoading=false;}
 }
 function apply(){
  if(!editable||!patch||loading||loadedClient!==clientName||(replaces&&(!replace||replaceBaseline!==currentFingerprint)))return;
  const approved=patch;choose('');onSelect(approved);notice=$t('clientAddresses.applied');
 }
</script>
<section class="address-book" aria-label={$t('clientAddresses.title')} aria-busy={loading}>
 <header><div><h3>{$t('clientAddresses.title')}</h3><p>{clientName||$t('clientAddresses.clientFirst')}</p></div>
  <button type="button" onclick={load} disabled={loading||!clientName.trim()}>
   {$t(loading?'clientAddresses.loading':problem?'clientAddresses.retry':'clientAddresses.load')}</button></header>
 <p class="hint">{$t('clientAddresses.savedHint')}</p>
 {#if !editable}<p class="hint">{$t('clientAddresses.readOnly')}</p>{/if}
 {#if loading}<p role="status">{$t('clientAddresses.loading')}</p>{/if}
 {#if problem}<p role="alert" class="problem">{problem}</p>{/if}
 {#if loadedClient===clientName&&!loading&&choices.length===0}<p class="empty">{$t('clientAddresses.empty')}</p>{/if}
 {#if choices.length}
  <label>{$t('clientAddresses.search')}<input type="search" bind:value={search} placeholder={$t('clientAddresses.searchPlaceholder')}/></label>
  <label>{$t('clientAddresses.choose')}<select value={selected} onchange={e=>choose(e.currentTarget.value)}>
   <option value="">{$t('clientAddresses.choosePlaceholder')}</option>
   {#each visibleChoices as c (c.id)}<option value={c.id}>{c.address}{c.contact?' · '+c.contact:''}</option>{/each}
  </select></label>
  {#if !visibleChoices.length}<p role="status">{$t('clientAddresses.noMatches')}</p>
   <button type="button" class="text-button" onclick={()=>search=''}>{$t('clientAddresses.clearSearch')}</button>{/if}
  <p class="hint">{$t('clientAddresses.resultCount',{count:visibleChoices.length})}</p>
 {/if}
 {#if preview&&patch}
  <div class="address-preview">
   <div class="comparison"><div><span class="caption">{$t('clientAddresses.current')}</span><p>{current.deliveryAddress||'—'}</p><p class="hint">{current.deliveryContact||'—'} · {current.deliveryPhone||'—'}</p><p class="hint">{current.deliveryEmail||'—'}</p></div>
    <div><span class="caption">{$t('clientAddresses.saved')}</span><p>{preview.address}</p><p class="hint">{preview.contact||'—'} · {preview.phone||'—'}</p><p class="hint">{preview.email||'—'}</p></div></div>
   <p class="hint">{$t('clientAddresses.lastUsed',{date:date(preview.last_used_at)})}</p>
   <button type="button" class="text-button" onclick={()=>{if(historyOpen)historyOpen=false;else void loadHistory();}} aria-expanded={historyOpen}>
    {$t(historyOpen?'clientAddresses.hideHistory':'clientAddresses.showHistory')}</button>
   {#if historyOpen}
    <div class="history" aria-busy={historyLoading}>
     {#if historyLoading}<p role="status">{$t('clientAddresses.historyLoading')}</p>{/if}
     {#if historyProblem}<p role="alert" class="problem">{historyProblem}</p><button type="button" onclick={()=>void loadHistory()}>{$t('clientAddresses.retry')}</button>{/if}
     {#if history&&!history.items.length&&!historyLoading}<p>{$t('clientAddresses.historyEmpty')}</p>{/if}
     {#if history?.items.length}
      <ol>{#each history.items as use (use.id)}<li><time datetime={use.used_at}>{date(use.used_at)}</time>
       <p>{use.raw_address}</p><p class="hint">{use.contact||'—'} · {use.phone||'—'} · {use.email||'—'}</p>
       {#if use.source_order_id}<a href={`/orders/${encodeURIComponent(use.source_order_id)}`}>{$t('clientAddresses.sourceOrder')}</a>{/if}
      </li>{/each}</ol>
      {#if history.nextOffset!==null&&!historyProblem}<button type="button" disabled={historyLoading} onclick={()=>void loadHistory(history!.nextOffset!)}>{$t('clientAddresses.moreHistory')}</button>{/if}
     {/if}
    </div>
   {/if}
   {#if replaces&&editable}<label class="ack"><input type="checkbox" checked={replace}
    onchange={e=>{replace=e.currentTarget.checked;replaceBaseline=currentFingerprint;notice='';}}/>{$t('clientAddresses.replace')}</label>{/if}
   <button type="button" class="primary" onclick={apply} disabled={!editable||loading||(replaces&&!replace)}>{$t('clientAddresses.use')}</button>
  </div>
 {/if}
 {#if notice}<p role="status" class="notice">{notice}</p>{/if}
</section>
<style>
 .address-book{display:grid;gap:var(--space-md);grid-column:1/-1;padding:var(--space-lg);border:1px solid var(--border);border-radius:var(--radius-md);background:var(--bg-1);min-width:0;font-size:var(--text-sm);line-height:1.5}
 header{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-sm);flex-wrap:wrap}header>div{min-width:0}
 h3{font-size:var(--text-md);font-weight:650;margin:0}p{margin:0;overflow-wrap:anywhere}
 .hint,.caption,header p,time{font-size:var(--text-xs);color:var(--ink-secondary)}
 label{display:grid;gap:var(--space-xs);font-weight:550}.ack{display:flex;align-items:flex-start;gap:var(--space-sm);font-weight:400}.ack input{flex-shrink:0;margin-top:4px}
 button,input,select{font:inherit;max-width:100%;min-width:0}button,select,input[type='search']{padding:var(--space-sm);border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-1);color:var(--ink-primary);min-height:40px}
 button{cursor:pointer;justify-self:start;font-weight:550}button:hover:not(:disabled){background:var(--bg-2)}button:disabled{opacity:.55;cursor:not-allowed}
 button.primary{background:var(--brand);border-color:var(--brand);color:var(--on-brand)}button.primary:hover:not(:disabled){background:var(--brand-hover,var(--brand))}
 .text-button{padding:4px 0;border:0;background:transparent;color:var(--link);text-align:left;min-height:36px;justify-self:start}
 :is(button,input,select,a):focus-visible{outline:2px solid var(--focus,var(--brand));outline-offset:3px}
 .address-preview{display:grid;gap:var(--space-md);padding-top:var(--space-md);border-top:1px solid var(--border)}
 .comparison{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:var(--space-md)}.comparison>div{min-width:0;display:grid;align-content:start;gap:var(--space-xs)}.caption{font-weight:600}
 .history{padding:var(--space-md) 0;border-block:1px solid var(--border);display:grid;gap:var(--space-sm)}ol{list-style:none;padding:0;margin:0;display:grid;gap:var(--space-md)}li{display:grid;gap:var(--space-xs)}li+li{padding-top:var(--space-md);border-top:1px solid var(--border)}a{color:var(--link);font-size:var(--text-xs);text-underline-offset:3px}
 .problem{color:var(--error)}.notice{font-weight:550}.empty{padding-block:var(--space-sm);color:var(--ink-secondary)}
</style>
