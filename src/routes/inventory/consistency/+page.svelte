<script lang="ts">
  import { modalDialog } from '$lib/ui/modal-dialog';
  import { scrollRegion } from '$lib/a11y/scroll-region';
  import {onMount} from 'svelte';
  import {base} from '$app/paths';
  import {t} from 'svelte-i18n';
  import {currentUser} from '$lib/auth/authState.svelte';
  import type {InventoryParity} from '$lib/inventory/consistency';

  type Snapshot={
    asOf:string;page:number;totalPages:number;totalMaterials:number;
    unmappedLegacyCount:number;divergentOnPage:number;
    ambiguousOnPage:number;rows:InventoryParity[]
  };
  let pageNumber=$state(1);
  let snapshot=$state<Snapshot|null>(null);
  let loading=$state(true);
  let errorText=$state('');
  let target=$state<InventoryParity|null>(null);
  let physicalCount=$state<number|null>(null);
  let explanation=$state('');
  let saving=$state(false);
  let receipt=$state('');
  let requestId=$state<string|null>(null);
  let attemptPayload=$state('');
  let saveError=$state('');
  let onlyExceptions=$state(true);
  const canManage=$derived(['RD','Boss','HeadOfProduction']
    .includes($currentUser?.role??''));
  let filtered=$derived((snapshot?.rows??[]).filter(row=>
    !onlyExceptions||!['MATCH','CANONICAL_ONLY'].includes(row.state)));
  const randomId=()=>{
    if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,ch=>
      (Number(ch)^crypto.getRandomValues(new Uint8Array(1))[0]&
       (15>>Number(ch)/4)).toString(16));
  };
  let generation=0;
  async function reload(next=pageNumber){
    const seq=++generation;
    loading=true;errorText='';snapshot=null;
    try{
      const response=await fetch(
        `${base}/api/inventory/consistency?page=${next}`,{cache:'no-store'});
      if(!response.ok)throw Error($t('inventoryConsistency.loadFailed'));
      const result=await response.json();
      if(!Array.isArray(result.rows)||!Number.isSafeInteger(result.totalPages)||
        typeof result.unmappedLegacyCount!=='number')
        throw Error($t('inventoryConsistency.loadFailed'));
      if(seq!==generation)return;
      snapshot=result;pageNumber=next;
    }catch(e){
      if(seq===generation)errorText=e instanceof Error?e.message:
        $t('inventoryConsistency.loadFailed');
    }finally{if(seq===generation)loading=false;}
  }
  onMount(()=>{void reload();return()=>{generation++;};});
  function begin(row:InventoryParity){
    if(row.state!=='DIVERGENT'||row.legacyStock===null||
      row.canonicalStock===null||row.linkedCount!==1)return;
    target=row;physicalCount=null;explanation='';saveError='';
    requestId=null;attemptPayload='';receipt='';
  }
  function dismiss(){
    if(saving)return;
    target=null;requestId=null;attemptPayload='';
  }
  async function reconcile(){
    if(!target||saving||!canManage)return;
    saveError='';receipt='';
    if(!Number.isSafeInteger(physicalCount)||physicalCount===null||
       physicalCount<0||explanation.trim().length<10){
      saveError=$t('inventoryConsistency.physicalRequired');return;
    }
    const body={
      materialId:target.materialId,
      physicalCount,
      expectedCanonicalStock:target.canonicalStock,
      expectedLegacyStock:target.legacyStock,
      reason:explanation.trim()
    };
    const fingerprint=JSON.stringify(body);
    if(requestId&&attemptPayload!==fingerprint){
      saveError=$t('inventoryConsistency.attemptLocked');return;
    }
    if(!requestId){requestId=randomId();attemptPayload=fingerprint;}
    saving=true;
    try{
      const response=await fetch(`${base}/api/inventory/consistency`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...body,requestId})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok){
        if(response.status===409){
          requestId=null;attemptPayload='';
          throw Error($t('inventoryConsistency.stale'));
        }
        throw Error(result.message??result.error??$t('inventoryConsistency.failed'));
      }
      if(!result.receipt?.id)throw Error($t('inventoryConsistency.uncertain'));
      receipt=String(result.receipt.id);
      target=null;requestId=null;attemptPayload='';
      await reload();
    }catch(e){
      saveError=e instanceof Error?e.message:$t('inventoryConsistency.failed');
    }finally{saving=false;}
  }
</script>

<svelte:head><title>{$t('inventoryConsistency.title')} · OMS</title></svelte:head>
<section class="consistency">
  <header>
    <div>
      <h1>{$t('inventoryConsistency.title')}</h1>
      <p>{$t('inventoryConsistency.subtitle')}</p>
    </div>
    <a href={`${base}/inventory`}>{$t('inventoryConsistency.back')}</a>
  </header>
  {#if !canManage}
    <p role="alert">{$t('inventoryConsistency.restricted')}</p>
  {:else}
    <p class="warning" role="note">{$t('inventoryConsistency.warning')}</p>
    <div class="controls">
      <button onclick={()=>reload()} disabled={loading}>{$t('inventoryConsistency.refresh')}</button>
      <label><input type="checkbox" bind:checked={onlyExceptions}/>
        {$t('inventoryConsistency.onlyProblems')}</label>
    </div>
    {#if loading}
      <p role="status">{$t('inventoryConsistency.loading')}</p>
    {:else if errorText}
      <p role="alert" class="warning">{errorText}</p>
    {:else if snapshot}
      <p class="counts">
        {$t('inventoryConsistency.pageCount',{values:{
          page:pageNumber,total:snapshot.totalPages,rows:snapshot.totalMaterials}})}
        · {$t('inventoryConsistency.unmapped',{
          values:{count:snapshot.unmappedLegacyCount}})}
      </p>
      {#if snapshot.unmappedLegacyCount>0}
        <p class="warning" role="status">{$t('inventoryConsistency.unmappedAction')}</p>
      {/if}
      {#if filtered.length===0}
        <p>{$t('inventoryConsistency.emptyPage')}</p>
      {:else}
        <div class="table-scroll" role="region" use:scrollRegion aria-label={$t('inventoryConsistency.title')}>
          <table>
            <thead><tr>
              <th>{$t('inventoryConsistency.material')}</th>
              <th>{$t('inventoryConsistency.canonical')}</th>
              <th>{$t('inventoryConsistency.legacy')}</th>
              <th>{$t('inventoryConsistency.state')}</th>
              <th>{$t('inventoryConsistency.action')}</th>
            </tr></thead>
            <tbody>
              {#each filtered as row (row.materialId)}
                <tr>
                  <td><strong>{row.sku??row.materialId}</strong>
                    <small>{row.name??'—'}</small></td>
                  <td>{row.canonicalStock??'—'}</td>
                  <td>{row.legacyStock??'—'}</td>
                  <td>{$t(`inventoryConsistency.states.${row.state}`)}</td>
                  <td>
                    {#if row.state==='DIVERGENT'&&row.linkedCount===1}
                      <button onclick={()=>begin(row)}>
                        {$t('inventoryConsistency.reconcile')}
                      </button>
                    {:else if row.state==='INVALID'||row.state==='AMBIGUOUS'}
                      <span class="warning">{$t('inventoryConsistency.inspect')}</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
      <div class="pager">
        <button disabled={pageNumber<=1} onclick={()=>reload(pageNumber-1)}>
          {$t('inventoryConsistency.previous')}</button>
        <button disabled={pageNumber>=snapshot.totalPages}
          onclick={()=>reload(pageNumber+1)}>
          {$t('inventoryConsistency.next')}</button>
      </div>
      <p class="hint">{$t('inventoryConsistency.partial')}</p>
    {/if}
    {#if receipt}
      <p role="status">{$t('inventoryConsistency.saved')}: <code>{receipt}</code></p>
    {/if}
    {#if target}
      <dialog class="modal-backdrop" aria-labelledby="reconcile-dialog-title"
         use:modalDialog={{ onClose: dismiss, closeOnEscape: !saving, closeOnBackdrop: !saving }}>
        <form class="editor" onsubmit={e=>{e.preventDefault();void reconcile();}}>
          <h2 id="reconcile-dialog-title">{$t('inventoryConsistency.reconcile')} · {target.sku??target.materialId}</h2>
          <p class="warning">{$t('inventoryConsistency.countFirst')}</p>
          <p>{$t('inventoryConsistency.canonical')}: {target.canonicalStock}
            · {$t('inventoryConsistency.legacy')}: {target.legacyStock}</p>
          <label>{$t('inventoryConsistency.physicalCount')}
            <input type="number" min="0" max="100000000" step="1"
              bind:value={physicalCount} disabled={saving}/></label>
          <label>{$t('inventoryConsistency.reason')}
            <textarea rows="3" maxlength="1000" bind:value={explanation}
              disabled={saving}></textarea></label>
          {#if saveError}<p role="alert" class="warning">{saveError}</p>{/if}
          <div class="actions">
            <button type="button" disabled={saving} onclick={dismiss}>
              {$t('inventoryConsistency.cancel')}</button>
            <button type="submit" disabled={saving}>
              {$t('inventoryConsistency.confirm')}</button>
          </div>
          <p class="hint">{$t('inventoryConsistency.retry')}</p>
        </form>
      </dialog>
    {/if}
  {/if}
</section>
<style>
  .consistency{display:grid;gap:1rem;padding:1rem;max-width:1200px;margin:auto}
  header,.controls,.pager,.actions{display:flex;gap:.75rem;align-items:center;
    justify-content:space-between;flex-wrap:wrap}
  h1{font-size:1.35rem;margin:0}h2{font-size:1rem}
  header p,.hint{color:var(--muted);font-size:.81rem}
  .warning{color:var(--warn);font-size:.85rem}
  .table-scroll{overflow:auto}
  table{border-collapse:collapse;width:100%}
  th,td{text-align:left;border-bottom:1px solid var(--border);
    padding:.65rem;font-size:.85rem}
  td small{display:block;color:var(--muted);font-size:.75rem}
  button{min-height:38px;border:1px solid var(--border);
    color:var(--text);background:var(--bg-2);border-radius:7px;
    padding:.5rem .8rem;cursor:pointer}
  button:disabled{opacity:.5;cursor:default}
  .modal-backdrop{position:fixed;inset:0;display:flex;align-items:center;
    justify-content:center;background:#0008;padding:1rem;z-index:120}
  .editor{display:grid;gap:.8rem;width:min(540px,100%);
    max-height:95vh;overflow:auto;padding:1rem;background:var(--bg-1);
    color:var(--text);border-radius:12px}
  .editor label{display:grid;gap:.3rem}
  .editor input,.editor textarea{min-height:40px;padding:.5rem;
    border:1px solid var(--border);border-radius:7px;
    background:var(--bg-2);color:var(--text)}

  /* Reconciliation is high-stakes: preserve numbers and physical-count evidence. */
  .consistency {max-width:1380px;padding:var(--space-lg) 0 var(--space-2xl);gap:var(--space-lg);}
  .consistency > header {position:relative;padding:var(--space-lg) 0;
    border-bottom:1px solid var(--divider);gap:var(--space-md);}
  .consistency > header::before {content:'';position:absolute;left:0;top:0;height:2px;width:92px;
    background:linear-gradient(90deg,var(--brand),var(--brand-2),transparent);}
  .consistency h1 {font-size:clamp(1.5rem,2.5vw,2rem);letter-spacing:var(--tracking-tight);}
  .consistency h2 {font-size:var(--text-lg);font-weight:750;}
  .consistency header p,.consistency .hint {font-size:var(--text-sm);color:var(--ink-secondary);}
  .consistency .warning {color:var(--warn);line-height:1.55;}
  .consistency > .warning {border:1px solid color-mix(in oklab,var(--warn) 35%,var(--border));
    border-radius:var(--radius-md);padding:var(--space-md);background:var(--bg-1);}
  .consistency .counts {padding:var(--space-sm) var(--space-md);
    background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-md);
    font-variant-numeric:tabular-nums;}
  .consistency .controls {justify-content:flex-start;gap:var(--space-md);}
  .consistency .controls label {display:flex;align-items:center;gap:var(--space-xs);}
  .consistency input[type='checkbox'] {accent-color:var(--brand);}
  .consistency button,.consistency header a {min-height:42px;display:inline-flex;
    align-items:center;justify-content:center;gap:var(--space-xs);padding:9px 13px;
    color:var(--ink-primary);border:1px solid var(--border);background:var(--bg-1);
    border-radius:var(--radius-sm);text-decoration:none;font-weight:650;}
  .consistency button:hover:not(:disabled),.consistency header a:hover {background:var(--bg-2);}
  .table-scroll {border:1px solid var(--glass-border);border-radius:var(--radius-lg);
    background:var(--glass-bg-strong);max-width:100%;overflow:auto;scrollbar-width:thin;}
  .table-scroll table {min-width:710px;font-variant-numeric:tabular-nums;}
  .table-scroll th {background:var(--bg-1);position:sticky;top:0;z-index:1;font-size:var(--text-xs);
    color:var(--ink-tertiary);}
  .table-scroll th,.table-scroll td {padding:11px 13px;border-bottom:1px solid var(--divider);}
  .table-scroll tbody tr:hover {background:var(--bg-2);}
  .table-scroll td:first-child {min-width:180px;}
  .editor {border:1px solid var(--border);border-radius:var(--radius-lg);
    padding:var(--space-xl);max-height:calc(100dvh - 32px);box-shadow:var(--glass-shadow-lg);}
  .editor label {font-size:var(--text-sm);font-weight:650;color:var(--ink-secondary);}
  .editor input,.editor textarea {background:var(--bg-2);color:var(--ink-primary);
    min-height:44px;border-radius:var(--radius-sm);}
  .editor .actions {justify-content:flex-end;}
  .editor button[type='submit'] {background:var(--brand);color:var(--on-brand);border-color:var(--brand);}
  .editor button[type='submit']:hover:not(:disabled) {background:var(--brand-2);}
  .table-scroll:focus-visible,.consistency button:focus-visible,
  .consistency header a:focus-visible,.editor input:focus-visible,.editor textarea:focus-visible {
    outline:2px solid var(--focus);outline-offset:2px;}
  @media(max-width:700px){.consistency{padding:var(--space-sm) 0 var(--space-xl);}
    .consistency > header{align-items:stretch;}.editor{padding:var(--space-md);}}
  @media(prefers-reduced-transparency:reduce){.table-scroll{background:var(--bg-1);}}

  dialog.modal-backdrop { margin:0;width:100%;height:100%;max-width:none;max-height:none;border:0;color:inherit;box-sizing:border-box; }
  dialog.modal-backdrop:not([open]) { display:none; }
  dialog.modal-backdrop::backdrop { background:transparent; }
</style>
