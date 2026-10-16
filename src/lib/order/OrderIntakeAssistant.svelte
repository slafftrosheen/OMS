<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { proposalsToPatch, proposalMatchesCurrent, type IntakeProposal, type IntakeResponse } from './intake-contract';
  import {fetchAllOrderFiles,watchOrderFilesChanged} from './order-files-client';

  type Analysis = IntakeResponse & { orderUpdatedAt:string; engine:string|null;profileIndex?:number|null };
  type OrderFile = {id:string; originalName?:string; file_name?:string;
    mimeType?:string; mime_type?:string; size?:number};
  let {orderId,editable,current,selectedFileId='',selectedProfileIndex=null,
    profileNames=[],dirty=false,orderUpdatedAt=null,onApply}:{
    orderId:string; editable:boolean; current:Record<string,unknown>;
    selectedFileId?:string; selectedProfileIndex?:number|null;
    profileNames?:string[]; dirty?:boolean; orderUpdatedAt?:string|null;
    onApply:(patch:Record<string,unknown>)=>void;
  }=$props();

  let files=$state<OrderFile[]>([]);
  let filesLoadVersion=0;
  let fileId=$state('');
  let profileChoice=$state('');
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
  $effect(()=>{
    if(selectedProfileIndex!==null && selectedProfileIndex>=0)
      profileChoice=String(selectedProfileIndex);
  });
  let profileIndex=$derived(profileChoice===''?null:Number(profileChoice));
  function isUnchanged(p:IntakeProposal){
    return proposalMatchesCurrent(p,current);
  }
  let analysisStale=$derived(!!analysis && (
    dirty || !orderUpdatedAt || analysis.orderUpdatedAt!==orderUpdatedAt ||
    JSON.stringify(current)!==baseState
  ));
  let acceptedCount=$derived(analysis?.proposals.filter((p,i)=>
    approvals[i]===true && !isUnchanged(p)).length??0);
  let sourceMatches=$derived(!analysis || (
    (analysis.fileId??'')===fileId &&
    (analysis.profileIndex??null)===profileIndex
  ));
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
    if(dirty||!orderUpdatedAt){problem=$t('orderIntake.saveFirst');return;}
    if(!fileId && !String(current.notes??'').trim()){
      problem=$t('orderIntake.noSource');return;
    }
    problem='';analysis=null;approvals={};applied=false;
    const ocr=includePaidOcr && !!fileId &&
      files.find(f=>f.id===fileId)?.mimeType==='application/pdf';
    if(ocr && !confirm($t('orderIntake.confirmPaidOcr')))return;
    analyzing=true;
    const capturedOrderId=orderId;
    const capturedProfileIndex=profileIndex;
    const capturedFileId=fileId;
    const capturedVersion=orderUpdatedAt;
    baseState=JSON.stringify(current);
    includePaidOcr=false;
    try{
      const res=await fetch('/api/ai/order-intake',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({orderId:capturedOrderId,
          fileId:capturedFileId||null,profileIndex:capturedProfileIndex,
          expectedUpdatedAt:capturedVersion,ocr:!!ocr,language:$t('orderIntake.locale')})
      });
      const body=await res.json().catch(()=>({}));
      if(orderId!==capturedOrderId)return;
      if(!res.ok)throw new Error(body.message||body.error||$t('orderIntake.analyzeError'));
      // A changed selection never silently binds provider output to a new file/profile.
      if(body.fileId!==(capturedFileId||null)||
         (body.profileIndex??null)!==capturedProfileIndex||
         body.orderUpdatedAt!==capturedVersion)
        throw new Error($t('orderIntake.changedOnServer'));
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
    if(!sourceMatches){
      problem=$t('orderIntake.sourceChanged');return;
    }
    if(analysisStale){
      problem=$t('orderIntake.saveFirst');return;
    }
    const accepted=analysis.proposals.filter((p:IntakeProposal,i:number)=>approvals[i]&&!isUnchanged(p));
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
      // File links can be removed without bumping draft_orders.updated_at.
      // Recheck the canonical linked-file list before approving old evidence.
      if(analysis.fileId){
        const linkedNow=await fetchAllOrderFiles<OrderFile>(orderId);
        if(!linkedNow.some(file=>file.id===analysis?.fileId))
          throw new Error($t('orderIntake.sourceChanged'));
      }
      if(!sourceMatches || analysisStale)throw new Error($t('orderIntake.changedLocally'));
      onApply(proposalsToPatch(accepted));
      applied=true;
    }catch(err){problem=err instanceof Error?err.message:$t('orderIntake.applyError');}
    finally{applying=false;}
  }
</script>

<section class="intake">
  <h3>{$t('orderIntake.title')}</h3>
  <p class="hint">{$t('orderIntake.description')}</p>
  {#if dirty}
    <p class="problem" role="status">{$t('orderIntake.saveFirst')}</p>
  {/if}
  <label>{$t('orderIntake.source')}
    <select bind:value={fileId} disabled={!editable||analyzing}>
      <option value="">{$t('orderIntake.notesOnly')}</option>
      {#each files as f (f.id)}
        <option value={f.id}>{f.originalName||f.file_name||f.id}</option>
      {/each}
    </select>
  </label>
  <label>{$t('orderIntake.profileFocus')}
    <select bind:value={profileChoice} disabled={!editable||analyzing}>
      <option value="">{$t('orderIntake.wholeOrder')}</option>
      {#each profileNames as name,i (i)}
        <option value={String(i)}>
          {$t('orderAssistant.profileNumber',{values:{number:i+1}})}{name?' — '+name:''}
        </option>
      {/each}
    </select>
  </label>
  <p class="hint">{$t('orderIntake.profileFocusHint')}</p>
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
    disabled={!editable||!consent||analyzing||dirty||!orderUpdatedAt}>
    {analyzing?$t('orderIntake.analyzing'):$t('orderIntake.analyze')}
  </button>
  {#if problem}<p role="alert" class="problem">{problem}</p>{/if}
  {#if analysis && !sourceMatches}
    <p class="problem" role="status">{$t('orderIntake.selectionChanged')}</p>
  {/if}
  {#if analysis && sourceMatches}
    {#if analysisStale}
      <p class="problem" role="status">{$t('orderIntake.analysisStale')}</p>
    {/if}
    <p class="hint">{$t('orderIntake.model')}: {analysis.model}</p>
    {#if analysis.profileIndex!==null && analysis.profileIndex!==undefined}
      <p class="hint">{$t('orderIntake.profileFocus')}: {$t('orderAssistant.profileNumber',{values:{number:analysis.profileIndex+1}})}</p>
    {/if}
    <p class="hint">{$t('orderIntake.source')}: {analysis.fileName??$t('orderIntake.notesOnly')}</p>
    <p class="hint">{$t('orderIntake.provenance')}</p>
    {#if analysis.proposals.length}
      <h4>{$t('orderIntake.proposals')} ({analysis.proposals.length})</h4>
      <div class="proposals">
        {#each analysis.proposals as p,i (`${p.field}-${i}`)}
          <label class="proposal">
            <span class="choice"><input type="checkbox" checked={approvals[i]===true}
              onchange={e=>approvals={...approvals,[i]:e.currentTarget.checked}}
              disabled={applied||!editable||analysisStale||isUnchanged(p)}/>
              <strong>{$t('orderAssistant.fieldNames.'+p.field)}</strong>
              <small>{$t('orderAssistant.confidence.'+p.confidence)}</small>
            </span>
            <span class="previous">{$t('orderIntake.current')}: {String(current[p.field]??'—')}</span>
            {#if isUnchanged(p)}
              <span class="hint">{$t('orderAssistant.noDifference')}</span>
            {/if}
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
          disabled={!editable||analysisStale||applying||acceptedCount===0}>
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
