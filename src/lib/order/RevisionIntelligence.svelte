<script lang="ts">
  import {onMount,untrack} from 'svelte';
  import {t} from 'svelte-i18n';
  import type {RevisionChange,RevisionModel} from './revision-contract';
  import {fetchAllOrderFiles,watchOrderFilesChanged} from './order-files-client';

  type FileOption={id:string;originalName?:string;file_name?:string;
    mimeType?:string;mime_type?:string;uploadedAt?:string};
  type FileRef={id:string;name:string;sha256:string};
  type Comparison=RevisionModel&{baseline:FileRef;revised:FileRef;
    orderUpdatedAt:string;model:string;provenance:'model-reported'};
  type ChangeRequest={id:string;title?:string;description?:string;
    status:string;proposed_diff?:Record<string,unknown>;proposed_by_user?:{
    display_name?:string;username?:string}|null;review_notes?:string|null;
    reviewed_at?:string|null;created_at?:string};

  let {orderId,canCompare,canReview,onRequestCreated}:{
    orderId:string;canCompare:boolean;canReview:boolean;
    onRequestCreated?:()=>void;
  }=$props();
  let files=$state<FileOption[]>([]);
  let fileLoadVersion=0;
  let baselineId=$state('');
  let revisedId=$state('');
  let consent=$state(false);
  let analyzing=$state(false);
  let submitting=$state(false);
  let loading=$state(false);
  let reviewingId=$state('');
  let errorMessage=$state('');
  let comparison=$state<Comparison|null>(null);
  let checked=$state<Record<number,boolean>>({});
  let created=$state(false);
  let history=$state<ChangeRequest[]>([]);

  // Initial load belongs to onMount; this marker handles subsequent navigation.
  let lastOrderId=$state(untrack(() => orderId));
  $effect(()=>{
    if(lastOrderId!==orderId){
      lastOrderId=orderId;files=[];baselineId='';revisedId='';
      consent=false;comparison=null;checked={};created=false;history=[];
      void loadFiles();void loadHistory();
    }
  });
  onMount(()=>{
    void loadFiles();void loadHistory();
    return watchOrderFilesChanged(changedId=>{if(changedId===orderId)void loadFiles();});
  });

  async function loadFiles(){
    if(!orderId)return;
    const id=orderId, version=++fileLoadVersion;
    loading=true;errorMessage='';
    try{
      const items=await fetchAllOrderFiles<FileOption>(id);
      if(id!==orderId || version!==fileLoadVersion)return;
      files=items.filter(f=>['application/pdf','image/png','image/jpeg','image/webp']
        .includes(f.mimeType??f.mime_type??''));
      const previousBaseline=baselineId,previousRevised=revisedId;
      if(!files.some(f=>f.id===revisedId)) revisedId=files[0]?.id??'';
      if(!files.some(f=>f.id===baselineId)||baselineId===revisedId)
        baselineId=files.find(f=>f.id!==revisedId)?.id??'';
      if(previousBaseline!==baselineId || previousRevised!==revisedId){
        comparison=null;checked={};created=false;
      }
    }catch(e){if(id===orderId && version===fileLoadVersion)
      errorMessage=e instanceof Error?e.message:$t('revisionIntelligence.fileError');}
    finally{if(id===orderId && version===fileLoadVersion)loading=false;}
  }
  async function loadHistory(){
    const id=orderId;
    try{
      const res=await fetch(`/api/draft-orders/${encodeURIComponent(id)}/change-requests`,
        {cache:'no-store'});
      if(!res.ok)return;
      const rows=await res.json();
      if(id===orderId)history=Array.isArray(rows)?rows.filter((cr:ChangeRequest)=>
        typeof cr.description==='string'&&
        cr.description.startsWith('AI-assisted customer file revision')):[];
    }catch{/* History is secondary; main comparison remains available. */}
  }
  async function compare(){
    if(!canCompare||!consent||analyzing||!baselineId||!revisedId||
      baselineId===revisedId)return;
    const id=orderId,oldFile=baselineId,newFile=revisedId;
    comparison=null;checked={};created=false;errorMessage='';analyzing=true;
    try{
      const res=await fetch('/api/ai/order-revisions',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({orderId:id,baselineFileId:oldFile,
          revisedFileId:newFile,consent:true})
      });
      const output=await res.json().catch(()=>({}));
      if(id!==orderId||oldFile!==baselineId||newFile!==revisedId)return;
      if(!res.ok)throw new Error(output.message||output.error||$t('revisionIntelligence.compareError'));
      comparison=output as Comparison;
      checked={};
    }catch(e){if(id===orderId)errorMessage=e instanceof Error?e.message:$t('revisionIntelligence.compareError');}
    finally{if(id===orderId)analyzing=false;}
  }
  async function propose(){
    if(!comparison||!canCompare||submitting||created)return;
    if(comparison.baseline.id!==baselineId||comparison.revised.id!==revisedId){
      errorMessage=$t('revisionIntelligence.sourceChanged');return;
    }
    const changes=comparison.changes.filter((_:RevisionChange,i:number)=>checked[i]);
    if(!changes.length)return;
    if(!confirm($t('revisionIntelligence.confirmCreate')))return;
    const id=orderId;
    submitting=true;errorMessage='';
    try{
      const res=await fetch('/api/orders/revision-change-request',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          orderId:id,baselineFileId:comparison.baseline.id,
          revisedFileId:comparison.revised.id,
          baselineSha256:comparison.baseline.sha256,
          revisedSha256:comparison.revised.sha256,
          orderUpdatedAt:comparison.orderUpdatedAt,
          summary:comparison.summary,
          changes,consent:true
        })
      });
      const payload=await res.json().catch(()=>({}));
      if(id!==orderId)return;
      if(!res.ok)throw new Error(payload.message||payload.error||$t('revisionIntelligence.createError'));
      created=true;
      await loadHistory();
      onRequestCreated?.();
    }catch(e){if(id===orderId)errorMessage=e instanceof Error?e.message:$t('revisionIntelligence.createError');}
    finally{if(id===orderId)submitting=false;}
  }
  async function reviewRequest(cr:ChangeRequest,decision:'approved'|'rejected'){
    if(!canReview||cr.status!=='pending'||reviewingId)return;
    const warning=decision==='approved'
      ?$t('revisionIntelligence.confirmApprove'):$t('revisionIntelligence.confirmReject');
    if(!confirm(warning))return;
    reviewingId=cr.id;errorMessage='';
    try{
      const res=await fetch(`/api/change-requests/${encodeURIComponent(cr.id)}/review`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({status:decision,
          comment:'Reviewed customer file revision evidence; no automatic order update'})
      });
      const payload=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(payload.message||payload.error||$t('revisionIntelligence.reviewError'));
      await loadHistory();
      onRequestCreated?.();
    }catch(e){errorMessage=e instanceof Error?e.message:$t('revisionIntelligence.reviewError');}
    finally{reviewingId='';}
  }
</script>

<section class="revision-panel">
  <h3>{$t('revisionIntelligence.title')}</h3>
  <p class="muted">{$t('revisionIntelligence.intro')}</p>
  <label>{$t('revisionIntelligence.baseline')}
    <select bind:value={baselineId} disabled={analyzing||!canCompare}>
      <option value="">{$t('revisionIntelligence.chooseFile')}</option>
      {#each files as file (file.id)}
        <option value={file.id}>{file.originalName||file.file_name||file.id}</option>
      {/each}
    </select>
  </label>
  <label>{$t('revisionIntelligence.revised')}
    <select bind:value={revisedId} disabled={analyzing||!canCompare}>
      <option value="">{$t('revisionIntelligence.chooseFile')}</option>
      {#each files as file (file.id)}
        <option value={file.id}>{file.originalName||file.file_name||file.id}</option>
      {/each}
    </select>
  </label>
  <button class="secondary" onclick={loadFiles} disabled={loading||analyzing}>
    {loading?$t('revisionIntelligence.loading'):$t('revisionIntelligence.refresh')}
  </button>
  <label class="consent">
    <input type="checkbox" bind:checked={consent} disabled={analyzing||!canCompare}/>
    {$t('revisionIntelligence.consent')}
  </label>
  <button class="primary" onclick={compare}
    disabled={!canCompare||!consent||analyzing||!baselineId||!revisedId||baselineId===revisedId}>
    {analyzing?$t('revisionIntelligence.comparing'):$t('revisionIntelligence.compare')}
  </button>
  {#if errorMessage}<p role="alert" class="problem">{errorMessage}</p>{/if}
  {#if files.length<2 && !loading}
    <p class="muted">{$t('revisionIntelligence.needTwo')}</p>
  {/if}
  {#if comparison}
    <h4>{$t('revisionIntelligence.result')}</h4>
    <p>{comparison.summary}</p>
    <p class="muted">{$t('revisionIntelligence.model')}: {comparison.model}</p>
    <p class="muted">{$t('revisionIntelligence.provenance')}</p>
    <div class="source">
      <strong>{$t('revisionIntelligence.baseline')}:</strong> {comparison.baseline.name}
      <small>SHA-256: {comparison.baseline.sha256}</small>
      <strong>{$t('revisionIntelligence.revised')}:</strong> {comparison.revised.name}
      <small>SHA-256: {comparison.revised.sha256}</small>
    </div>
    <h4>{$t('revisionIntelligence.fields')} ({comparison.changes.length})</h4>
    {#each comparison.changes as change,i (`${change.field}-${i}`)}
      <label class="change">
        <span class="checkline">
          <input type="checkbox" checked={checked[i]===true}
            onchange={e=>checked={...checked,[i]:e.currentTarget.checked}}
            disabled={created||!canCompare}/>
          <strong>{change.field}</strong>
          <small>{change.confidence}</small>
        </span>
        <span class="muted">{$t('revisionIntelligence.before')}: {change.before}</span>
        <span><strong>{$t('revisionIntelligence.after')}:</strong> {change.after}</span>
        <span class="muted">{$t('revisionIntelligence.evidenceOld')}: {change.oldEvidence}</span>
        <span class="muted">{$t('revisionIntelligence.evidenceNew')}: {change.newEvidence}</span>
      </label>
    {/each}
    {#if !comparison.changes.length}<p class="muted">{$t('revisionIntelligence.noFields')}</p>{/if}
    {#if comparison.risks.length}
      <h4>{$t('revisionIntelligence.risks')}</h4>
      <ul>{#each comparison.risks as risk,i (i)}<li>{risk}</li>{/each}</ul>
    {/if}
    {#if comparison.questions.length}
      <h4>{$t('revisionIntelligence.questions')}</h4>
      <ul>{#each comparison.questions as question,i (i)}<li>{question}</li>{/each}</ul>
    {/if}
    {#if created}
      <p role="status" class="success">{$t('revisionIntelligence.created')}</p>
    {:else}
      <button class="primary" onclick={propose}
        disabled={!canCompare||submitting||!Object.values(checked).some(Boolean)
          ||comparison.baseline.id!==baselineId||comparison.revised.id!==revisedId}>
        {submitting?$t('revisionIntelligence.saving'):$t('revisionIntelligence.createRequest')}
      </button>
    {/if}
    <p class="muted">{$t('revisionIntelligence.noApply')}</p>
  {/if}
  <h4>{$t('revisionIntelligence.history')} ({history.length})</h4>
  <button class="secondary" onclick={loadHistory}>{$t('revisionIntelligence.refreshHistory')}</button>
  {#each history as cr (cr.id)}
    <details class="history">
      <summary>{cr.status} · {cr.created_at ? new Date(cr.created_at).toLocaleString() : cr.id}</summary>
      <p class="muted">{cr.description}</p>
      <pre>{JSON.stringify(cr.proposed_diff??{},null,2)}</pre>
      {#if cr.review_notes}<p class="muted">{cr.review_notes}</p>{/if}
      {#if canReview && cr.status==='pending'}
        <div class="actions">
          <button onclick={()=>reviewRequest(cr,'approved')} disabled={!!reviewingId}>
            {$t('revisionIntelligence.approve')}
          </button>
          <button onclick={()=>reviewRequest(cr,'rejected')} disabled={!!reviewingId}>
            {$t('revisionIntelligence.reject')}
          </button>
        </div>
      {/if}
    </details>
  {/each}
  {#if !history.length}<p class="muted">{$t('revisionIntelligence.emptyHistory')}</p>{/if}
</section>

<style>
  .revision-panel{display:grid;gap:10px;padding:12px;max-height:100%;overflow-y:auto;font-size:12px}
  h3,h4{margin:0;font-size:14px}h4{margin-top:9px}
  .muted,small{font-size:11px;line-height:1.5;color:var(--ink-secondary);white-space:pre-wrap;overflow-wrap:anywhere}
  label:not(.consent):not(.change){display:grid;gap:5px}
  select,button{min-width:0;max-width:100%;padding:8px;border:1px solid var(--border);
    color:var(--ink);background:var(--bg-1);border-radius:8px}
  button{cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}
  button.primary{background:var(--brand);color:white}
  .consent,.checkline,.actions{display:flex;align-items:flex-start;gap:8px}
  .consent input,.checkline input{flex-shrink:0}
  .change,.source,.history{border:1px solid var(--border);border-radius:8px;padding:9px;display:grid;gap:6px}
  .change{overflow-wrap:anywhere}.source small{word-break:break-all}
  .problem{color:var(--error,#c43d3d)}.success{color:var(--success,#39855e)}
  ul{padding-left:20px;margin:0;display:grid;gap:6px}
  .history pre{white-space:pre-wrap;font-size:11px;overflow-wrap:anywhere}
  .actions{flex-wrap:wrap}
</style>
