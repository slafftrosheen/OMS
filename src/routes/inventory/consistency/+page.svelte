<script lang="ts">
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
        <div class="table-scroll">
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
      <div class="modal-backdrop">
        <form class="editor" onsubmit={e=>{e.preventDefault();void reconcile();}}>
          <h2>{$t('inventoryConsistency.reconcile')} · {target.sku??target.materialId}</h2>
          <p class="warning">{$t('inventoryConsistency.countFirst')}</p>
          <p>{$t('inventoryConsistency.canonical')}: {target.canonicalStock}
            · {$t('inventoryConsistency.legacy')}: {target.legacyStock}</p>
          <label>{$t('inventoryConsistency.physicalCount')}
            <input type="number" min="0" max="100000000" step="1"
              bind:value={physicalCount} disabled={saving}/></label>
          <label>{$t('inventoryConsistency.reason')}
            <textarea rows="3" maxlength="1000" bind:value={explanation}
              disabled={saving}/></label>
          {#if saveError}<p role="alert" class="warning">{saveError}</p>{/if}
          <div class="actions">
            <button type="button" disabled={saving} onclick={dismiss}>
              {$t('inventoryConsistency.cancel')}</button>
            <button type="submit" disabled={saving}>
              {$t('inventoryConsistency.confirm')}</button>
          </div>
          <p class="hint">{$t('inventoryConsistency.retry')}</p>
        </form>
      </div>
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
</style>
