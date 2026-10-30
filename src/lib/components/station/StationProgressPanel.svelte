<script lang="ts">
  import {t} from 'svelte-i18n';
  let {orderId,station,expectedUpdatedAt,onClose,onSaved,busy=$bindable(false)}:{
    orderId:string;station:string;expectedUpdatedAt:string;
    onClose:()=>void;onSaved:()=>void;busy?:boolean
  }=$props();
  type Entry={createdAt:string;actor:string|null;note:string;progressPercent:number|null};
  let note=$state('');
  let progressPercent=$state<number|undefined>(undefined);
  let history=$state<Entry[]>([]);
  let loading=$state(false);
  let errorMessage=$state('');
  let saved=$state(false);
  type Target={orderId:string;station:string;active:boolean};
  let target:Target|null=null;
  let historyRequest:AbortController|null=null;
  const isCurrent=(context:Target)=>context.active&&target===context&&
    context.orderId===orderId&&context.station===station;
  const endpoint=(context:Target)=>`/api/station/${encodeURIComponent(context.station)}/orders/${encodeURIComponent(context.orderId)}/progress`;
  async function loadHistory(context:Target){
    if(!isCurrent(context))return;
    historyRequest?.abort();
    const request=new AbortController();
    historyRequest=request;
    const current=()=>isCurrent(context)&&historyRequest===request&&!request.signal.aborted;
    loading=true;
    errorMessage='';
    try{
      const res=await fetch(endpoint(context),{cache:'no-store',signal:request.signal});
      if(!res.ok)throw new Error($t('productionFloor.historyFailed'));
      const body=await res.json();
      if(!Array.isArray(body))throw new Error($t('productionFloor.historyFailed'));
      if(current())history=body;
    }catch(e){
      if(current())errorMessage=e instanceof Error?e.message:$t('productionFloor.historyFailed');
    }finally{
      if(current()){loading=false;historyRequest=null;}
    }
  }
  async function save(){
    const context=target;
    if(busy||!context||!isCurrent(context))return;
    busy=true;errorMessage='';saved=false;
    try{
      const res=await fetch(endpoint(context),{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({note,progressPercent:progressPercent??null,expectedUpdatedAt})
      });
      const payload=await res.json().catch(()=>({}));
      if(!isCurrent(context))return;
      if(!res.ok)throw new Error(res.status===409?$t('productionFloor.staleStage'):
        payload.message??payload.error??$t('productionFloor.saveFailed'));
      note='';progressPercent=undefined;saved=true;
      onSaved();
      // The write is acknowledged. A slow history refresh must not prevent
      // closing the saved dialog or navigating back to the station queue.
      void loadHistory(context);
    }catch(e){
      if(isCurrent(context))errorMessage=e instanceof Error?e.message:$t('productionFloor.saveFailed');
    }finally{if(isCurrent(context))busy=false;}
  }
  $effect(()=>{
    const context:Target={orderId,station,active:true};
    target=context;
    note='';progressPercent=undefined;history=[];saved=false;busy=false;
    void loadHistory(context);
    return()=>{
      context.active=false;
      historyRequest?.abort();
      historyRequest=null;
      if(target===context)target=null;
    };
  });
</script>

<section class="progress-form">
  <header class="top">
    <h3>{$t('productionFloor.title')} · {station}</h3>
    <button type="button" onclick={onClose} disabled={busy} aria-label={$t('productionFloor.close')}>×</button>
  </header>
  <p class="hint">{$t('productionFloor.explanation')}</p>
  <label for="progress-percent">{$t('productionFloor.percentage')}</label>
  <input id="progress-percent" type="number" min="0" max="99" step="1"
    bind:value={progressPercent} disabled={busy}/>
  <label for="progress-note">{$t('productionFloor.note')}</label>
  <textarea id="progress-note" rows="3" maxlength="1000" bind:value={note} disabled={busy}></textarea>
  {#if errorMessage}<p role="alert" class="problem">{errorMessage}</p>{/if}
  {#if saved}<p role="status">{$t('productionFloor.saved')}</p>{/if}
  <div class="actions">
    <button type="button" onclick={onClose} disabled={busy}>{$t('productionFloor.close')}</button>
    <button type="button" onclick={save} disabled={busy||(!note.trim()&&progressPercent==null)}>
      {busy?$t('productionFloor.saving'):$t('productionFloor.save')}
    </button>
  </div>
  <h4>{$t('productionFloor.recent')}</h4>
  {#if loading}<p class="hint">{$t('productionFloor.loading')}</p>
  {:else if !history.length}<p class="hint">{$t('productionFloor.noHistory')}</p>
  {:else}
    <div class="entries">
      {#each history as entry,i (`${entry.createdAt}-${i}`)}
        <article>
          <time datetime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time>
          {#if entry.progressPercent!==null}<strong>{entry.progressPercent}%</strong>{/if}
          {#if entry.note}<p>{entry.note}</p>{/if}
          {#if entry.actor}<small>{entry.actor}</small>{/if}
        </article>
      {/each}
    </div>
  {/if}
</section>
<style>
  .progress-form{display:grid;gap:10px;min-width:min(500px,85vw);max-height:80vh;overflow:auto}
  .top,.actions{display:flex;justify-content:space-between;align-items:center;gap:10px}
  h3,h4{margin:0}button{cursor:pointer;padding:8px 12px}
  label,.hint,small{color:var(--ink-secondary);font-size:12px}
  input,textarea{width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;
    background:var(--bg-1);color:var(--ink-primary)}
  .entries{display:grid;gap:8px;max-height:190px;overflow:auto}
  .entries article{border:1px solid var(--border);padding:10px;border-radius:8px}
  .entries strong{margin-left:12px}.entries p{margin:6px 0;white-space:pre-wrap}
  .problem{color:var(--error,#c33)}button:disabled{opacity:.5;cursor:not-allowed}
</style>
