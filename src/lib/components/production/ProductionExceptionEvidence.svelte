<script lang="ts">
  import {onMount} from 'svelte';
  import {base} from '$app/paths';
  import {t} from 'svelte-i18n';

  type Movement={
    id:string;itemId:string|null;materialId:string|null;kind:string;
    quantity:number;performedBy:string|null;note:string|null;
    createdAt:string;stockBefore:number|null;stockAfter:number|null;
    stationMention:string|null;
  };
  type Evidence={
    asOf:string;
    review:{id:string;kind:string;station:string;orderId:string;updatedAt:string};
    order:{id:string;po_number:string|null;title:string|null;status:string};
    stage:{state:string;updated_at:string;started_at:string|null;completed_at:string|null;
      consumption_skipped:boolean|null;consumption_skipped_reason:string|null;
      actual_hours:number|null;estimated_hours:number|null;notes:string|null};
    orderMovements:Movement[];totalOrderMovements:number;
    movementsTruncated:boolean;evidenceIsOrderScoped:boolean;
    stageAttributionVerified:boolean;
  };
  let {reviewId,orderId,station,kind,selectedIds=[],onReference,onClose}:{
    reviewId:string;orderId:string;station:string;kind:string;
    selectedIds?:string[];onReference:(movementId:string)=>void;onClose:()=>void
  }=$props();
  let busy=$state(true);
  let issue=$state('');
  let evidence=$state<Evidence|null>(null);
  let sequence=0;
  async function reload(){
    const turn=++sequence;
    busy=true;issue='';evidence=null;
    try{
      const url=new URLSearchParams({reviewId});
      const response=await fetch(
        `${base}/api/production/exception-evidence?${url.toString()}`,
        {cache:'no-store'});
      if(!response.ok)throw Error($t('productionEvidence.loadFailed'));
      const data=await response.json();
      if(data?.review?.id!==reviewId ||
        data.review.orderId!==orderId || data.review.station!==station ||
        data.review.kind!==kind || data.order?.id!==orderId ||
        typeof data.asOf!=='string' || !Array.isArray(data.orderMovements) ||
        typeof data.totalOrderMovements!=='number' ||
        data.evidenceIsOrderScoped!==true || data.stageAttributionVerified!==false)
        throw Error($t('productionEvidence.loadFailed'));
      if(turn!==sequence)return;
      evidence=data;
    }catch{
      if(turn===sequence)issue=$t('productionEvidence.loadFailed');
    }finally{if(turn===sequence)busy=false;}
  }
  onMount(()=>{void reload();return()=>{sequence++;};});
  const formatted=(value:string|null|undefined)=>value?
    new Date(value).toLocaleString():'—';
</script>

<section class="evidence" aria-label={$t('productionEvidence.title')}>
  <header>
    <div>
      <h4>{$t('productionEvidence.title')}</h4>
      <p>{$t('productionEvidence.original')}</p>
    </div>
    <button type="button" onclick={onClose}>{$t('productionEvidence.close')}</button>
  </header>
  <button type="button" onclick={reload} disabled={busy}>{$t('productionEvidence.refresh')}</button>
  {#if busy}
    <p role="status">{$t('productionEvidence.loading')}</p>
  {:else if issue}
    <p role="alert" class="alert">{issue}</p>
  {:else if evidence}
    <dl class="facts">
      <div><dt>{$t('productionEvidence.stage')}</dt><dd>{station} · {evidence.stage.state}</dd></div>
      <div><dt>{$t('productionEvidence.stageUpdated')}</dt>
        <dd>{formatted(evidence.stage.updated_at)}</dd></div>
      <div><dt>{$t('productionEvidence.started')}</dt>
        <dd>{formatted(evidence.stage.started_at)}</dd></div>
      <div><dt>{$t('productionEvidence.completed')}</dt>
        <dd>{formatted(evidence.stage.completed_at)}</dd></div>
      <div><dt>{$t('productionEvidence.estimatedHours')}</dt>
        <dd>{evidence.stage.estimated_hours??'—'}</dd></div>
      <div><dt>{$t('productionEvidence.actualHours')}</dt>
        <dd>{evidence.stage.actual_hours??'—'}</dd></div>
      <div><dt>{$t('productionEvidence.materialSkipped')}</dt>
        <dd>{evidence.stage.consumption_skipped===true
          ?$t('productionEvidence.yes'):$t('productionEvidence.no')}</dd></div>
      {#if evidence.stage.consumption_skipped_reason}
        <div><dt>{$t('productionEvidence.reason')}</dt>
          <dd>{evidence.stage.consumption_skipped_reason}</dd></div>
      {/if}
      {#if evidence.stage.notes}
        <div><dt>{$t('productionEvidence.notes')}</dt><dd>{evidence.stage.notes}</dd></div>
      {/if}
    </dl>
    <h4>{$t('productionEvidence.movements',{
      values:{count:evidence.totalOrderMovements}})}</h4>
    <p class="caution" role="note">{$t('productionEvidence.orderScopeWarning')}</p>
    {#if evidence.movementsTruncated}
      <p class="caution" role="status">{$t('productionEvidence.truncated')}</p>
    {/if}
    {#if evidence.orderMovements.length===0}
      <p class="muted">{$t('productionEvidence.noMovements')}</p>
    {:else}
      <ul>
        {#each evidence.orderMovements as row (row.id)}
          <li>
            <div class="movement-title">
              <strong>{row.kind} · {row.quantity}</strong>
              <span>{formatted(row.createdAt)}</span>
            </div>
            <p class="muted">
              {$t('productionEvidence.movementId')}: <code>{row.id}</code>
            </p>
            <p class="muted">
              {$t('productionEvidence.materialId')}: {row.materialId??row.itemId??'—'}
            </p>
            <p class="muted">
              {$t('productionEvidence.performedBy')}: {row.performedBy??'—'}
            </p>
            {#if row.note}<p class="muted">{$t('productionEvidence.notes')}: {row.note}</p>{/if}
            {#if row.stockBefore!==null&&row.stockAfter!==null}
              <p class="muted">{$t('productionEvidence.stockChange')}:
                {row.stockBefore} → {row.stockAfter}</p>
            {/if}
            <button type="button" disabled={selectedIds.includes(row.id)}
              onclick={()=>onReference(row.id)}>
              {selectedIds.includes(row.id)
                ?$t('productionEvidence.selected'):$t('productionEvidence.citeMovement')}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>
<style>
  .evidence{display:grid;gap:.65rem;padding:.8rem;
    border:1px solid var(--border);border-radius:10px;
    background:var(--bg-2);min-width:0}
  .evidence header,.movement-title{display:flex;justify-content:space-between;
    gap:.6rem;align-items:flex-start;flex-wrap:wrap}
  .evidence h4{font-size:.91rem;margin:0}
  .evidence p{font-size:.8rem;margin:.2rem 0;overflow-wrap:anywhere}
  .evidence button{width:fit-content;min-height:36px;
    background:var(--bg-1);color:var(--text);border:1px solid var(--border);
    padding:.4rem .65rem;border-radius:7px;cursor:pointer}
  .evidence button:disabled{opacity:.55;cursor:default}
  .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
    gap:.5rem;margin:0}
  .facts>div{padding:.5rem;background:var(--bg-1);border-radius:7px}
  .facts dt{font-size:.75rem;color:var(--muted)}
  .facts dd{margin:.25rem 0;font-size:.83rem;overflow-wrap:anywhere}
  .evidence ul{list-style:none;display:grid;gap:.45rem;padding:0;margin:0;
    max-height:380px;overflow:auto}
  .evidence li{border:1px solid var(--border);padding:.6rem;
    border-radius:7px;overflow-wrap:anywhere}
  .evidence code{font-size:.73rem;overflow-wrap:anywhere}
  .muted{color:var(--muted)}
  .caution,.alert{color:var(--warn);font-size:.78rem}
</style>
