<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { proposalsToPatch, type IntakeProposal, type IntakeResponse } from './intake-contract';
  import {fetchAllOrderFiles,watchOrderFilesChanged} from './order-files-client';

  type Analysis = IntakeResponse & { orderUpdatedAt:string; engine:string|null };
  type OrderFile = {id:string; originalName?:string; file_name?:string;
    mimeType?:string; mime_type?:string; size?:number};
  let {orderId,editable,current,selectedFileId='',onApply}:{
    orderId:string; editable:boolean; current:Record<string,unknown>;
    selectedFileId?:string; onApply:(patch:Record<string,unknown>)=>void;
  }=$props();

  let files=$state<OrderFile[]>([]);
  let filesLoadVersion=0;
  let fileId=$state('');
  let includePaidOcr=$state(false);
  let consent=$state(false);
  let loading=$state(false);
  let analyzing=$state(false);
  let applying=$state(false);
  let problem=$state('');
  let analysis=$state<Analysis|null>(null);
  let approvals=$state<Record<number,boolean>>({});
  let baseState=$state('');
  let applied=$state(false);
  $effect(()=>{if(selectedFileId)fileId=selectedFileId;});
  onMount(()=>{
    void loadFiles();
    return watchOrderFilesChanged(changedId=>{if(changedId===orderId)void loadFiles();});
  });

  async function loadFiles(){
    const id=orderId,version=++filesLoadVersion;
    loading=true;problem='';
    try{
      const data=await fetchAllOrderFiles<OrderFile>(id);
      if(id!==orderId||version!==filesLoadVersion)return;
      files=data.filter(f=>['application/pdf','image/jpeg','image/png','image/webp']
        .includes(f.mimeType??f.mime_type??''));
      if(fileId && !files.some(f=>f.id===fileId)){
        fileId=files[0]?.id??'';
        analysis=null;approvals={};applied=false;
      }else if(!fileId && files.length)fileId=files[0].id;
    }catch(err){if(id===orderId && version===filesLoadVersion)
      problem=err instanceof Error?err.message:$t('orderIntake.filesError');}
    finally{if(id===orderId && version===filesLoadVersion)loading=false;}
  }
  async function analyze(){
    if(!editable||!consent||analyzing)return;
    if(!fileId && !String(current.notes??'').trim()){
      problem=$t('orderIntake.noSource');return;
    }
    problem='';analysis=null;approvals={};applied=false;
    const ocr=includePaidOcr && !!fileId &&
      files.find(f=>f.id===fileId)?.mimeType==='application/pdf';
    if(ocr && !confirm($t('orderIntake.confirmPaidOcr')))return;
    analyzing=true;
    const capturedOrderId=orderId;
    baseState=JSON.stringify(current);
    includePaidOcr=false;
    try{
      const res=await fetch('/api/ai/order-intake',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({orderId:capturedOrderId,
          fileId:fileId||null,ocr:!!ocr,language:$t('orderIntake.locale')})
      });
      const body=await res.json().catch(()=>({}));
      if(orderId!==capturedOrderId)return;
      if(!res.ok)throw new Error(body.message||body.error||$t('orderIntake.analyzeError'));
      analysis=body as Analysis;
      // No checkboxes are accepted by default. Every field is a deliberate
      // staff decision, including low-confidence suggestions.
      approvals={};
    }catch(err){if(orderId===capturedOrderId)
      problem=err instanceof Error?err.message:$t('orderIntake.analyzeError');
    }finally{if(orderId===capturedOrderId)analyzing=false;}
  }
  async function apply(){
    if(!analysis||!editable||applying||applied)return;
    if((analysis.fileId??'')!==fileId){
      problem=$t('orderIntake.sourceChanged');return;
    }
    const accepted=analysis.proposals.filter((_:IntakeProposal,i:number)=>approvals[i]);
    if(!accepted.length){problem=$t('orderIntake.selectOne');return;}
    if(JSON.stringify(current)!==baseState){
      problem=$t('orderIntake.changedLocally');return;
    }
    applying=true;problem='';
    try{
      // A parallel reviewer could have modified/confirmed the draft while the
      // model was working. Do not silently apply against a stale saved order.
      const res=await fetch(`/api/draft-orders/${encodeURIComponent(orderId)}`,
        {cache:'no-store'});
      if(!res.ok)throw new Error($t('orderIntake.changedOnServer'));
      const fresh=await res.json();
      if(fresh.updatedAt!==analysis.orderUpdatedAt ||
         !['DRAFT','draft','PENDING_REVIEW'].includes(fresh.status))
        throw new Error($t('orderIntake.changedOnServer'));
      onApply(proposalsToPatch(accepted));
      applied=true;
    }catch(err){problem=err instanceof Error?err.message:$t('orderIntake.applyError');}
    finally{applying=false;}
  }
</script>

<section class="intake">
  <h3>{$t('orderIntake.title')}</h3>
  <p class="hint">{$t('orderIntake.description')}</p>
  <label>{$t('orderIntake.source')}
    <select bind:value={fileId} disabled={!editable||analyzing}>
      <option value="">{$t('orderIntake.notesOnly')}</option>
      {#each files as f (f.id)}
        <option value={f.id}>{f.originalName||f.file_name||f.id}</option>
      {/each}
    </select>
  </label>
  <button class="minor" onclick={loadFiles} disabled={loading||analyzing}>
    {loading?$t('orderIntake.loading'):$t('orderIntake.refresh')}
  </button>
  {#if fileId && (files.find(f=>f.id===fileId)?.mimeType==='application/pdf')}
    <label class="check">
      <input type="checkbox" bind:checked={includePaidOcr} disabled={!editable||analyzing}/>
      {$t('orderIntake.ocrLabel')}
    </label>
    {#if includePaidOcr}<p class="hint">{$t('orderIntake.ocrCharge')}</p>{/if}
  {/if}
  <label class="check">
    <input type="checkbox" bind:checked={consent} disabled={!editable||analyzing}/>
    {$t('orderIntake.consent')}
  </label>
  <button class="primary" onclick={analyze}
    disabled={!editable||!consent||analyzing}>
    {analyzing?$t('orderIntake.analyzing'):$t('orderIntake.analyze')}
  </button>
  {#if problem}<p role="alert" class="problem">{problem}</p>{/if}
  {#if analysis}
    <p class="hint">{$t('orderIntake.model')}: {analysis.model}</p>
    <p class="hint">{$t('orderIntake.source')}: {analysis.fileName??$t('orderIntake.notesOnly')}</p>
    <p class="hint">{$t('orderIntake.provenance')}</p>
    {#if analysis.proposals.length}
      <h4>{$t('orderIntake.proposals')} ({analysis.proposals.length})</h4>
      <div class="proposals">
        {#each analysis.proposals as p,i (`${p.field}-${i}`)}
          <label class="proposal">
            <span class="choice"><input type="checkbox" checked={approvals[i]===true}
              onchange={e=>approvals={...approvals,[i]:e.currentTarget.checked}}
              disabled={applied||!editable}/>
              <strong>{p.field}</strong>
              <small>{p.confidence}</small>
            </span>
            <span class="previous">{$t('orderIntake.current')}: {String(current[p.field]??'—')}</span>
            <span class="proposed">{$t('orderIntake.proposed')}: {p.value}</span>
            <span class="evidence">{$t('orderIntake.evidence')}: {p.evidence}</span>
            {#if analysis.evidenceVerified[i]}
              <span class="hint">{$t('orderIntake.matchedText')}</span>
            {/if}
          </label>
        {/each}
      </div>
      {#if applied}
        <p role="status" class="success">{$t('orderIntake.applied')}</p>
      {:else}
        <button class="primary" onclick={apply}
          disabled={!editable||applying||!Object.values(approvals).some(Boolean)}>
          {applying?$t('orderIntake.checking'):$t('orderIntake.applySelected')}
        </button>
      {/if}
    {:else}<p class="hint">{$t('orderIntake.noProposals')}</p>{/if}
    {#if analysis.profileSuggestions.length}
      <h4>{$t('orderIntake.profiles')}</h4>
      {#each analysis.profileSuggestions as p,i (i)}
        <p class="hint"><strong>{p.name}</strong> × {p.quantity??'?'} — {p.details}</p>
      {/each}
      <p class="hint">{$t('orderIntake.profilesManual')}</p>
    {/if}
    {#if analysis.missing.length}
      <h4>{$t('orderIntake.missing')}</h4>
      <ul>{#each analysis.missing as m,i (i)}<li>{m}</li>{/each}</ul>
    {/if}
  {/if}
</section>

<style>
  .intake{display:grid;gap:10px;padding:12px;max-height:100%;overflow-y:auto;font-size:12px}
  h3,h4{margin:0;font-size:14px}h4{margin-top:8px}
  .hint,.previous,.evidence{font-size:11px;line-height:1.45;color:var(--ink-secondary);margin:0}
  label:not(.check):not(.proposal){display:grid;gap:5px}
  select,button{padding:8px;border:1px solid var(--border);border-radius:8px;
    background:var(--bg-1);color:var(--ink);max-width:100%;min-width:0}
  .check,.choice{display:flex;gap:8px;align-items:center}
  .check input,.choice input{flex-shrink:0}
  button{cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}
  button.primary{background:var(--brand);color:white}
  .proposals{display:grid;gap:8px}
  .proposal{display:grid;gap:5px;border:1px solid var(--border);
    border-radius:10px;padding:10px;overflow-wrap:anywhere}
  .choice small{margin-left:auto;color:var(--ink-tertiary)}
  .proposed{font-weight:650}.problem{color:var(--error);overflow-wrap:anywhere}
  .success{color:var(--ok)}ul{padding-left:20px;margin:0;display:grid;gap:6px}
</style>
