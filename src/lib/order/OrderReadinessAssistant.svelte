<script lang="ts">
  import { t } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import type { ModelReadiness, ReadinessIssue, ReadinessEvidence } from './production-readiness';

  type Report={
    orderId:string;status:string;updatedAt:string|null;capturedAt:string;
    state:'blocked'|'needs-review'|'checklist-clear';
    issues:ReadinessIssue[];
    profiles:ReadinessEvidence['profiles'];
    materials:ReadinessEvidence['materials'];
    fileCount:number;stageCodes:string[];inventoryChecked:boolean;
    ai:ModelReadiness|null;aiWarning?:string|null;model?:string|null;
  };
  let {orderId,canRun,orderUpdatedAt}:{orderId:string;canRun:boolean;orderUpdatedAt?:string|null}=$props();
  let busy=$state(false);
  let error=$state('');
  let report=$state<Report|null>(null);
  let approval=$state(false);
  let lastOrderId=$state(orderId);
  $effect(()=>{
    if(lastOrderId!==orderId){lastOrderId=orderId;report=null;approval=false;error='';}
  });
  async function analyze(){
    if(!canRun||busy)return;
    busy=true;error='';report=null;
    const requestedId=orderId;
    try{
      const res=await fetch('/api/ai/order-readiness',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({orderId:requestedId})
      });
      const result=await res.json().catch(()=>({}));
      if(requestedId!==orderId)return;
      if(!res.ok)throw new Error(result.message||result.error||$t('productionReadiness.failed'));
      report=result as Report;
    }catch(err){
      if(requestedId===orderId)error=err instanceof Error?err.message:$t('productionReadiness.failed');
    }finally{if(requestedId===orderId)busy=false;}
  }
  const statusLabel=(status:Report['state'])=>{
    if(status==='blocked')return $t('productionReadiness.blocked');
    if(status==='needs-review')return $t('productionReadiness.review');
    return $t('productionReadiness.checklistClear');
  };
  const currentReport=$derived(!!report && (!orderUpdatedAt ||
    report.updatedAt===orderUpdatedAt));
</script>

<section class="readiness" aria-label={$t('productionReadiness.title')}>
  <h3>{$t('productionReadiness.title')}</h3>
  <p class="description">{$t('productionReadiness.intro')}</p>
  <button class="analyze" onclick={analyze} disabled={busy||!canRun}>
    {busy?$t('productionReadiness.checking'):$t('productionReadiness.run')}
  </button>
  {#if error}<p class="issue" role="alert">{error}</p>{/if}
  {#if report}
    <div class="summary">
      <strong>{statusLabel(report.state)}</strong>
      <small>{$t('productionReadiness.asOf')}: {new Date(report.capturedAt).toLocaleString()}</small>
    </div>
    {#if !currentReport}
      <p role="alert" class="issue">{$t('productionReadiness.stale')}</p>
    {/if}
    <p class="description">{$t('productionReadiness.noApproval')}</p>
    <h4>{$t('productionReadiness.checks')} ({report.issues.length})</h4>
    {#if !report.issues.length}
      <p class="description">{$t('productionReadiness.noIssues')}</p>
    {:else}
      <ul class="checks">
        {#each report.issues as issue,i (i)}
          <li class:critical={issue.severity==='blocker'}>
            <strong>{issue.severity}</strong> — {issue.message}
          </li>
        {/each}
      </ul>
    {/if}
    <h4>{$t('productionReadiness.materials')} ({report.materials.length})</h4>
    {#if !report.materials.length}
      <p class="description">{$t('productionReadiness.noMaterials')}</p>
    {:else}
      <div class="materials">
        {#each report.materials as material (material.orderMaterialId)}
          <div class="material">
            <strong>{material.materialType}</strong>
            <small>{material.match} · {material.status}</small>
            <div class="evidence">
              {$t('productionReadiness.required')}: {material.required??'—'} {material.unit}
               · {$t('productionReadiness.available')}: {material.available??'—'} {material.unit}
            </div>
            {#if material.sku}
              <small>{$t('productionReadiness.sku')}: {material.sku}</small>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    <h4>{$t('productionReadiness.profiles')} ({report.profiles.length})</h4>
    {#each report.profiles as profile (profile.id)}
      <p class="description">{profile.templateCode??'—'} ·
        {profile.templateName??$t('productionReadiness.unverified')} ·
        {profile.quantity1}+{profile.quantity2}+{profile.quantity3}+{profile.quantity4}
      </p>
    {/each}
    <p class="description">{$t('productionReadiness.linkedFiles')}: {report.fileCount}</p>
    {#if report.aiWarning}
      <p class="issue" role="alert">{report.aiWarning}</p>
    {/if}
    {#if report.ai}
      <h4>{$t('productionReadiness.advice')}</h4>
      <p>{report.ai.summary}</p>
      {#if report.model}<small>{$t('productionReadiness.model')}: {report.model}</small>{/if}
      <h4>{$t('productionReadiness.stations')}</h4>
      {#if !report.ai.recommendations.length}
        <p class="description">{$t('productionReadiness.noStations')}</p>
      {:else}
        <ul>
          {#each report.ai.recommendations as item (item.station)}
            <li><strong>{item.station}</strong> — {item.why}</li>
          {/each}
        </ul>
      {/if}
      {#if report.ai.risks.length}
        <h4>{$t('productionReadiness.risks')}</h4>
        <ul>{#each report.ai.risks as risk,i (i)}<li>{risk}</li>{/each}</ul>
      {/if}
      {#if report.ai.questions.length}
        <h4>{$t('productionReadiness.questions')}</h4>
        <ul>{#each report.ai.questions as question,i (i)}<li>{question}</li>{/each}</ul>
      {/if}
    {/if}
    <p class="description">{$t('productionReadiness.manual')}</p>
  {/if}
</section>

<style>
  .readiness{display:grid;gap:10px;padding:12px;max-height:100%;overflow-y:auto;font-size:12px}
  h3,h4{margin:0;font-size:14px} h4{margin-top:7px}
  .description,.evidence,small{font-size:11px;line-height:1.5;color:var(--ink-secondary);margin:0}
  .analyze{padding:9px;border-radius:8px;border:1px solid var(--brand);background:var(--brand);color:white;cursor:pointer}
  .analyze:disabled{opacity:.45;cursor:not-allowed}
  .summary,.material{padding:9px;border:1px solid var(--border);border-radius:9px;display:grid;gap:4px}
  .checks,.materials{display:grid;gap:7px;margin:0;padding:0}
  .checks{list-style:none}
  .checks li{padding:8px;border-radius:8px;border:1px solid var(--border)}
  .checks li.critical,.issue{color:var(--error,#d64444)}
  ul{padding-left:19px;display:grid;gap:6px;margin:0}
</style>
