<script lang="ts">
 import {onMount} from 'svelte';
 import {base} from '$app/paths';
 import {t} from 'svelte-i18n';
 import {currentUser} from '$lib/auth/authState.svelte';
 import type {ReplenishmentCandidate,ReplenishmentRequest} from '$lib/inventory/replenishment';

 type Snapshot={
   asOf:string;candidateCount:number;totalMaterials:number;
   invalidBalanceCount:number;noThresholdCount:number;
   candidates:ReplenishmentCandidate[];
   requests:ReplenishmentRequest[];
   requestMaterials:{id:string;sku:string;name:string;unit:string|null;stock:number|null}[];
   stockIsCanonical:boolean;
   physicalCountVerified:boolean;supplierOrderingAutomated:boolean;
   receiptsAffectStock:boolean
 };
 type Action='create'|'update'|'order'|'close'|'cancel';
 type Event={id:string;action:string;previous_status:string|null;
   next_status:string;actor_id:string;note:string;occurred_at:string};
 let canManage=$derived(['RD','Boss','HeadOfProduction'].includes($currentUser?.role??''));
 let snapshot=$state<Snapshot|null>(null),loading=$state(true);
 let failure=$state(''),notice=$state('');
 let onlyUnplanned=$state(false),showClosed=$state(false);
 let query=$state('');
 let candidates=$derived((snapshot?.candidates??[]).filter(x=>
   (!onlyUnplanned||!x.activeRequest)&&
   [x.sku,x.name,x.preferredSupplier??''].join(' ').toLowerCase()
     .includes(query.trim().toLowerCase())));
 let active=$derived((snapshot?.requests??[])
   .filter(x=>x.status==='OPEN'||x.status==='ORDERED')
   .sort((a,b)=>b.updated_at.localeCompare(a.updated_at)));
 let requestMaterials=$derived(new Map((snapshot?.requestMaterials??[])
   .map(item=>[item.id,item])));
 let finished=$derived((snapshot?.requests??[])
   .filter(x=>x.status==='CLOSED'||x.status==='CANCELLED')
   .sort((a,b)=>b.updated_at.localeCompare(a.updated_at)));
 let selectedCandidate=$state<ReplenishmentCandidate|null>(null);
 let selectedRequest=$state<ReplenishmentRequest|null>(null);
 let action=$state<Action>('create'),editorOpen=$state(false);
 let quantity=$state<number|null>(null),supplier=$state('');
 let externalReference=$state(''),note=$state('');
 let saving=$state(false),actionError=$state('');
 let createId=$state<string|null>(null);
 let selectedHistoryId=$state<string|null>(null);
 let historyLoading=$state(false),historyFailure=$state('');
 let history=$state<Event[]>([]),historyTotal=$state(0),historyTruncated=$state(false);
 let loadSequence=0,historySequence=0;
 const newUuid=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():
   '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,ch=>
     (Number(ch)^crypto.getRandomValues(new Uint8Array(1))[0]&
       (15>>Number(ch)/4)).toString(16));
 const formatDate=(value:string|null)=>value?new Date(value).toLocaleString():'—';

 async function reload(){
   const turn=++loadSequence;loading=true;failure='';snapshot=null;
   try{
     const response=await fetch(`${base}/api/inventory/replenishment`,{cache:'no-store'});
     if(!response.ok)throw Error($t('inventoryReplenishment.loadFailed'));
     const value=await response.json();
     if(!Array.isArray(value.candidates)||!Array.isArray(value.requests)||
       !Array.isArray(value.requestMaterials)||
       !Number.isInteger(value.invalidBalanceCount)||
       !Number.isInteger(value.noThresholdCount)||
       value.stockIsCanonical!==true||value.physicalCountVerified!==false||
       value.supplierOrderingAutomated!==false||value.receiptsAffectStock!==false)
       throw Error($t('inventoryReplenishment.loadFailed'));
     if(turn!==loadSequence)return;
     snapshot=value;
   }catch(e){if(turn===loadSequence)failure=e instanceof Error?e.message:
     $t('inventoryReplenishment.loadFailed');}
   finally{if(turn===loadSequence)loading=false;}
 }
 onMount(()=>{
   // The auth store may still be resolving when this page mounts.
   // Start private procurement reads only after manager role is known.
   let started=false;
   const stop=currentUser.subscribe(user=>{
     if(!started && user && ['RD','Boss','HeadOfProduction'].includes(user.role)){
       started=true;void reload();
     }
   });
   return()=>{stop();loadSequence++;historySequence++;};
 });
 function closeEditor(){if(saving)return;editorOpen=false;createId=null;}
 function prepareCreate(candidate:ReplenishmentCandidate){
   if(!canManage||candidate.activeRequest)return;
   selectedCandidate=candidate;selectedRequest=null;action='create';
   // A minimum threshold is a signal, NOT evidence of the required order
   // quantity. Leave blank until management chooses a genuine quantity.
   quantity=null;supplier=candidate.preferredSupplier??'';
   externalReference='';note='';actionError='';createId=null;editorOpen=true;
 }
 function prepareExisting(row:ReplenishmentRequest,next:Action){
   if(!canManage||loading)return;
   selectedCandidate=null;selectedRequest=row;action=next;
   quantity=row.quantity;supplier=row.supplier_label??'';
   externalReference='';note=next==='update'?row.note:'';
   actionError='';createId=null;editorOpen=true;
 }
 async function submit(){
   if(saving||!canManage||!editorOpen)return;
   actionError='';
   if(['create','update'].includes(action)&&
      (!Number.isSafeInteger(quantity)||quantity===null||quantity<1||quantity>100000000)){
     actionError=$t('inventoryReplenishment.quantityRequired');return;
   }
   if(action==='order'&&!externalReference.trim()){
     actionError=$t('inventoryReplenishment.referenceRequired');return;
   }
   if(['close','cancel'].includes(action)&&note.trim().length<5){
     actionError=$t('inventoryReplenishment.reasonRequired');return;
   }
   if(action==='create'&&!createId)createId=newUuid();
   const requestId=action==='create'?createId:selectedRequest?.id;
   if(!requestId)return;
   const body={
     action,requestId,
     materialId:action==='create'?selectedCandidate?.materialId:null,
     expectedUpdatedAt:action==='create'?null:selectedRequest?.updated_at,
     quantity:['create','update'].includes(action)?quantity:null,
     supplierLabel:['create','update'].includes(action)?supplier.trim()||null:null,
     supplierReference:action==='order'?externalReference.trim():null,
     note:note.trim()
   };
   saving=true;
   try{
     const response=await fetch(`${base}/api/inventory/replenishment`,{
       method:'POST',headers:{'Content-Type':'application/json'},
       body:JSON.stringify(body)
     });
     if(!response.ok){
       if(response.status===409)throw Error($t('inventoryReplenishment.stale'));
       if(response.status===503)throw Error($t('inventoryReplenishment.uncertain'));
       throw Error($t('inventoryReplenishment.saveFailed'));
     }
     const result=await response.json();
     if(!result?.request?.id)throw Error($t('inventoryReplenishment.uncertain'));
     editorOpen=false;createId=null;
     notice=$t('inventoryReplenishment.saved');
     await reload();
   }catch(e){actionError=e instanceof Error?e.message:$t('inventoryReplenishment.saveFailed');}
   finally{saving=false;}
 }
 async function showHistory(id:string){
   if(selectedHistoryId===id){historySequence++;selectedHistoryId=null;return;}
   selectedHistoryId=id;history=[];historyFailure='';historyLoading=true;
   const turn=++historySequence;
   try{
     const params=new URLSearchParams({requestId:id});
     const response=await fetch(
       `${base}/api/inventory/replenishment/events?${params.toString()}`,
       {cache:'no-store'});
     if(!response.ok)throw Error($t('inventoryReplenishment.historyUnavailable'));
     const data=await response.json();
     if(!Array.isArray(data.events))throw Error($t('inventoryReplenishment.historyUnavailable'));
     if(turn!==historySequence)return;
     history=data.events;historyTotal=data.total;historyTruncated=data.truncated;
   }catch{if(turn===historySequence)historyFailure=$t('inventoryReplenishment.historyUnavailable');}
   finally{if(turn===historySequence)historyLoading=false;}
 }
</script>

<svelte:head><title>{$t('inventoryReplenishment.title')} · OMS</title></svelte:head>
<section class="replenishment">
 <header class="heading">
   <div><h1>{$t('inventoryReplenishment.title')}</h1>
     <p>{$t('inventoryReplenishment.subtitle')}</p></div>
   <a href={`${base}/inventory`}>{$t('inventoryReplenishment.back')}</a>
 </header>
 {#if !canManage}
   <p role="alert">{$t('inventoryReplenishment.restricted')}</p>
 {:else}
   <p class="caution" role="note">{$t('inventoryReplenishment.stockCaveat')}</p>
   <p class="caution" role="note">{$t('inventoryReplenishment.workflowCaveat')}</p>
   <div class="toolbar">
     <button disabled={loading||saving} onclick={()=>void reload()}>
       {$t('inventoryReplenishment.refresh')}</button>
     <a href={`${base}/inventory/consistency`}>
       {$t('inventoryConsistency.open')}</a>
     <a href={`${base}/inventory/movements`}>
       {$t('inventory.movements')}</a>
   </div>
   {#if notice}<p role="status">{notice}</p>{/if}
   {#if loading}<p role="status">{$t('inventoryReplenishment.loading')}</p>
   {:else if failure}<p class="caution" role="alert">{failure}</p>
   {:else if snapshot}
     <div class="summary">
       <div><strong>{snapshot.candidateCount}</strong><span>{$t('inventoryReplenishment.thresholdCount')}</span></div>
       <div><strong>{active.length}</strong><span>{$t('inventoryReplenishment.activeCount')}</span></div>
       <div><strong>{active.filter(x=>x.status==='ORDERED').length}</strong>
         <span>{$t('inventoryReplenishment.orderedCount')}</span></div>
     </div>
     {#if snapshot.invalidBalanceCount>0}
       <p class="caution" role="alert">
         {$t('inventoryReplenishment.invalidBalances',
           {values:{count:snapshot.invalidBalanceCount}})}
       </p>
     {/if}
     {#if snapshot.noThresholdCount>0}
       <p class="small" role="note">
         {$t('inventoryReplenishment.unsetThresholds',
           {values:{count:snapshot.noThresholdCount}})}
       </p>
     {/if}
     <h2>{$t('inventoryReplenishment.reviewCandidates')}</h2>
     <p class="small">{$t('inventoryReplenishment.minimumRule')}</p>
     <div class="toolbar">
       <input aria-label={$t('inventoryReplenishment.search')} type="search"
         placeholder={$t('inventoryReplenishment.search')} bind:value={query}/>
       <label><input type="checkbox" bind:checked={onlyUnplanned}/>
         {$t('inventoryReplenishment.unplannedOnly')}</label>
     </div>
     {#if candidates.length===0}
       <p>{$t('inventoryReplenishment.noCandidates')}</p>
     {:else}
       <div class="table-wrap"><table>
         <thead><tr>
           <th>{$t('inventoryReplenishment.material')}</th>
           <th>{$t('inventoryReplenishment.stock')}</th>
           <th>{$t('inventoryReplenishment.minimum')}</th>
           <th>{$t('inventoryReplenishment.planningTarget')}</th>
           <th>{$t('inventoryReplenishment.supplier')}</th>
           <th>{$t('inventoryReplenishment.action')}</th>
         </tr></thead>
         <tbody>
           {#each candidates as candidate (candidate.materialId)}
             <tr>
               <td><a href={`${base}/inventory/${encodeURIComponent(candidate.materialId)}`}>
                 <strong>{candidate.sku}</strong></a>
                 <small>{candidate.name} · {candidate.unit}</small></td>
               <td>{candidate.stock}</td><td>{candidate.minimum}</td>
               <td>{candidate.targetQuantity??'—'}
                 <small>{$t('inventoryReplenishment.targetNotOrder')}</small></td>
               <td>{candidate.preferredSupplier??'—'}</td>
               <td>{#if candidate.activeRequest}
                   <span>{$t(`inventoryReplenishment.status.${candidate.activeRequest.status}`)}</span>
                 {:else}
                   <button onclick={()=>prepareCreate(candidate)}>
                     {$t('inventoryReplenishment.prepare')}</button>
                 {/if}
               </td>
             </tr>
           {/each}
         </tbody>
       </table></div>
     {/if}
     <h2>{$t('inventoryReplenishment.activeRequests')}</h2>
     {#if active.length===0}<p>{$t('inventoryReplenishment.noActive')}</p>
     {:else}
       <div class="table-wrap"><table>
         <thead><tr>
           <th>{$t('inventoryReplenishment.material')}</th>
           <th>{$t('inventoryReplenishment.quantity')}</th>
           <th>{$t('inventoryReplenishment.supplier')}</th>
           <th>{$t('inventoryReplenishment.statusLabel')}</th>
           <th>{$t('inventoryReplenishment.actions')}</th>
         </tr></thead>
         <tbody>
           {#each active as req (req.id)}
             <tr>
               <td><a href={`${base}/inventory/${encodeURIComponent(req.material_id)}`}>
                 {requestMaterials.get(req.material_id)?.sku??req.material_id}</a>
                 <small>{requestMaterials.get(req.material_id)?.name??''}</small>
                 <small>{$t('inventoryReplenishment.createdStock')}: {req.stock_at_request}
                   · {$t('inventoryReplenishment.minimum')}: {req.minimum_at_request}
                 </small></td>
               <td>{req.quantity} {req.unit}</td>
               <td>{req.supplier_label??'—'}
                 {#if req.supplier_reference}<small>{req.supplier_reference}</small>{/if}
               </td>
               <td>{$t(`inventoryReplenishment.status.${req.status}`)}</td>
               <td><div class="row-actions">
                 {#if req.status==='OPEN'}
                   <button onclick={()=>prepareExisting(req,'update')}>{$t('inventoryReplenishment.edit')}</button>
                   {#if req.supplier_label}
                     <button onclick={()=>prepareExisting(req,'order')}>{$t('inventoryReplenishment.markOrdered')}</button>
                   {:else}
                     <small>{$t('inventoryReplenishment.supplierBeforeOrder')}</small>
                   {/if}
                 {:else}
                   <button onclick={()=>prepareExisting(req,'close')}>{$t('inventoryReplenishment.close')}</button>
                 {/if}
                 <button onclick={()=>prepareExisting(req,'cancel')}>{$t('inventoryReplenishment.cancel')}</button>
                 <button onclick={()=>void showHistory(req.id)}>{$t('inventoryReplenishment.history')}</button>
               </div>
               {#if selectedHistoryId===req.id}
                 {#if historyLoading}<p>{$t('inventoryReplenishment.loading')}</p>
                 {:else if historyFailure}<p role="alert">{historyFailure}</p>
                 {:else}
                   {#if historyTruncated}<p class="caution">{$t('inventoryReplenishment.historyPartial')}</p>{/if}
                   <ul class="events">
                     {#each history as ev (ev.id)}
                       <li>{formatDate(ev.occurred_at)} · {ev.action} · {ev.actor_id}
                         {#if ev.note}<small>{ev.note}</small>{/if}</li>
                     {/each}
                   </ul>
                 {/if}
               {/if}
               </td>
             </tr>
           {/each}
         </tbody>
       </table></div>
     {/if}
     <label class="history-switch"><input type="checkbox" bind:checked={showClosed}/>
       {$t('inventoryReplenishment.showHistory')}</label>
     {#if showClosed}
       <h2>{$t('inventoryReplenishment.closedRequests')}</h2>
       {#if finished.length===0}<p>{$t('inventoryReplenishment.noClosed')}</p>
       {:else}
         <div class="table-wrap"><table><tbody>
           {#each finished as req (req.id)}
             <tr><td>{requestMaterials.get(req.material_id)?.sku??req.material_id}</td>
               <td>{req.quantity} {req.unit}</td>
               <td>{$t(`inventoryReplenishment.status.${req.status}`)}</td>
               <td>{formatDate(req.closed_at)}</td>
               <td><button onclick={()=>void showHistory(req.id)}>
                 {$t('inventoryReplenishment.history')}</button>
                 {#if selectedHistoryId===req.id}
                   {#if historyLoading}<span>{$t('inventoryReplenishment.loading')}</span>
                   {:else if historyFailure}<span role="alert">{historyFailure}</span>
                   {:else}
                     {#if historyTruncated}<p class="caution">{$t('inventoryReplenishment.historyPartial')}</p>{/if}
                     <ul class="events">{#each history as ev (ev.id)}
                       <li>{formatDate(ev.occurred_at)} · {ev.action}
                         {#if ev.note}<small>{ev.note}</small>{/if}</li>
                     {/each}</ul>
                   {/if}
                 {/if}
               </td></tr>
           {/each}
         </tbody></table></div>
       {/if}
     {/if}
   {/if}
   {#if editorOpen}
     <div class="scrim">
       <form class="editor" onsubmit={e=>{e.preventDefault();void submit();}}>
         <h2>{$t(`inventoryReplenishment.actionsByKind.${action}`)}</h2>
         <p class="small">{$t('inventoryReplenishment.editingWarning')}</p>
         {#if selectedCandidate}
           <p><strong>{selectedCandidate.sku}</strong> · {selectedCandidate.name}
             · {selectedCandidate.stock} {selectedCandidate.unit}</p>
         {:else if selectedRequest}
           <p>{selectedRequest.material_id} · {selectedRequest.quantity} {selectedRequest.unit}
             · {$t(`inventoryReplenishment.status.${selectedRequest.status}`)}</p>
         {/if}
         {#if action==='create'||action==='update'}
           <label>{$t('inventoryReplenishment.quantity')}
             <input type="number" min="1" max="100000000" step="1" required
               bind:value={quantity} disabled={saving}/></label>
           <label>{$t('inventoryReplenishment.supplier')}
             <input maxlength="200" bind:value={supplier} disabled={saving}/></label>
         {:else if action==='order'}
           <p>{$t('inventoryReplenishment.selectedSupplier')}: {selectedRequest?.supplier_label??'—'}</p>
           <label>{$t('inventoryReplenishment.externalReference')}
             <input maxlength="200" bind:value={externalReference} required disabled={saving}/></label>
         {/if}
         <label>{$t('inventoryReplenishment.note')}
           <textarea rows="3" maxlength="1000" bind:value={note}
             required={action==='close'||action==='cancel'} disabled={saving}></textarea></label>
         {#if actionError}<p role="alert" class="caution">{actionError}</p>{/if}
         <div class="toolbar">
           <button type="button" disabled={saving} onclick={closeEditor}>
             {$t('inventoryReplenishment.dismiss')}</button>
           <button type="submit" disabled={saving}>
             {$t('inventoryReplenishment.confirm')}</button>
         </div>
       </form>
     </div>
   {/if}
 {/if}
</section>
<style>
 .replenishment{display:grid;gap:1rem;max-width:1220px;margin:auto;padding:1rem}
 .heading,.toolbar,.row-actions{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap}
 .heading{justify-content:space-between}h1{font-size:1.45rem;margin:0}h2{font-size:1.05rem;margin:.6rem 0}
 p{font-size:.87rem;margin:.2rem 0}.small,small{font-size:.77rem;color:var(--muted)}
 small{display:block;margin-top:.25rem;overflow-wrap:anywhere}.caution{color:var(--warn)}
 .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem}
 .summary>div{display:grid;gap:.3rem;padding:.9rem;border:1px solid var(--border);border-radius:10px}
 .summary strong{font-size:1.3rem}.summary span{font-size:.78rem;color:var(--muted)}
 .table-wrap{max-width:100%;overflow-x:auto}
 table{width:100%;border-collapse:collapse;font-size:.84rem}
 th,td{text-align:left;padding:.6rem;vertical-align:top;border-bottom:1px solid var(--border)}
 th{font-size:.73rem;color:var(--muted)} td{overflow-wrap:anywhere}
 button,.toolbar a{min-height:36px;padding:.4rem .65rem;border:1px solid var(--border);
   color:var(--text);background:var(--bg-2);border-radius:7px;cursor:pointer;text-decoration:none}
 button:disabled{opacity:.5;cursor:default}
 input,textarea{padding:.5rem;border:1px solid var(--border);border-radius:7px;
   color:var(--text);background:var(--bg-1)}
 input[type='search']{min-width:180px;max-width:300px}
 .history-switch{font-size:.85rem}
 .scrim{position:fixed;inset:0;z-index:120;padding:1rem;background:#0008;
   display:grid;place-items:center}
 .editor{display:grid;gap:.8rem;max-height:95vh;overflow-y:auto;width:min(510px,100%);
   padding:1rem;background:var(--bg-1);color:var(--text);border-radius:12px}
 .editor label{display:grid;gap:.3rem;font-size:.84rem}
 .events{padding-left:1rem;font-size:.75rem;max-height:220px;overflow:auto}
</style>
