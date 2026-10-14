<script lang="ts">
  import {onMount} from 'svelte';
  import {t} from 'svelte-i18n';
  let {orderId,station,expectedUpdatedAt,onClose,onSaved}:{
    orderId:string;station:string;expectedUpdatedAt:string;
    onClose:()=>void;onSaved:()=>void
  }=$props();
  type Entry={createdAt:string;actor:string|null;note:string;progressPercent:number|null};
  let note=$state('');
  let progressPercent=$state<number|undefined>(undefined);
  let history=$state<Entry[]>([]);
  let loading=$state(false);
  let busy=$state(false);
  let errorMessage=$state('');
  let saved=$state(false);
  async function loadHistory(){
    loading=true;
    errorMessage='';
    try{
      const res=await fetch(`/api/station/${encodeURIComponent(station)}/orders/${encodeURIComponent(orderId)}/progress`,{cache:'no-store'});
      if(!res.ok)throw new Error($t('productionFloor.historyFailed'));
      const body=await res.json();
      if(!Array.isArray(body))throw new Error($t('productionFloor.historyFailed'));
      history=body;
    }catch(e){errorMessage=e instanceof Error?e.message:$t('productionFloor.historyFailed');}
    finally{loading=false;}
  }
  async function save(){
    if(busy)return;
    busy=true;errorMessage='';saved=false;
    try{
      const res=await fetch(`/api/station/${encodeURIComponent(station)}/orders/${encodeURIComponent(orderId)}/progress`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({note,progressPercent:progressPercent??null,expectedUpdatedAt})
      });
      const payload=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(res.status===409?$t('productionFloor.staleStage'):
        payload.message??payload.error??$t('productionFloor.saveFailed'));
      note='';progressPercent=undefined;saved=true;
      onSaved();
      await loadHistory();
    }catch(e){errorMessage=e instanceof Error?e.message:$t('productionFloor.saveFailed');}
    finally{busy=false;}
  }
  onMount(()=>{void loadHistory();});
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
