<script lang="ts">
  import {t,locale} from 'svelte-i18n';
  import {base} from '$app/paths';
  import {proposalsToPatch,proposalMatchesCurrent,type IntakeProposal} from './intake-contract';
  import type {OrderAssistantTurn} from './assistant-contract';
  import type {OrderTechnicalChecks,TechnicalIssue} from './technical-evidence';

  type AssistantReply={
    reply:string;model:string;orderUpdatedAt:string;
    mode:'chat'|'propose';proposals:IntakeProposal[];missing:string[];
    provenance:'model-reported'
  };
  let {orderId,orderUpdatedAt,editable,canAsk,current,dirty,
    suggestedPrompt='',promptRevision=0,onOpenIntake,onOpenProfiles,onApply}:{
    orderId:string;orderUpdatedAt:string|null;editable:boolean;canAsk:boolean;
    current:Record<string,unknown>;dirty:boolean;
    suggestedPrompt?:string;promptRevision?:number;
    onOpenIntake?:()=>void;onOpenProfiles?:()=>void;
    onApply:(patch:Record<string,unknown>)=>void
  }=$props();
  let consent=$state(false),question=$state('');
  let mode=$state<'chat'|'propose'>('chat');
  let busy=$state(false),applying=$state(false),problem=$state('');
  let turns=$state<OrderAssistantTurn[]>([]);
  let proposals=$state<IntakeProposal[]>([]),missing=$state<string[]>([]);
  let approvals=$state<Record<number,boolean>>({});
  let proposalVersion=$state(''),proposalsBase=$state('');
  let model=$state(''),lastMode=$state<'chat'|'propose'>('chat');
  let applied=$state(false);
  let technical=$state<OrderTechnicalChecks|null>(null);
  let technicalBusy=$state(false),technicalError=$state('');
  let technicalVersion=$state<string|null>(null);
  let showAllTechnical=$state(false),technicalSequence=0;
  let requestSerial=0;
  let lastPrefillRevision=0;
  // A workflow tip prepares a question but never sends it or grants consent.
  $effect(()=>{
    if(promptRevision>lastPrefillRevision&&!busy&&suggestedPrompt){
      lastPrefillRevision=promptRevision;
      mode='chat';
      question=suggestedPrompt;
    }
  });
  const samples=['questions','gaps','materials','dimensions','fabrication'] as const;
  // Local deterministic checks: GET under the editor's session, NO OpenRouter.
  async function checkTechnical(){
    if(!canAsk||technicalBusy)return;
    const checkedId=orderId,sequence=++technicalSequence;
    technicalBusy=true;technicalError='';showAllTechnical=false;
    try{
      const response=await fetch(`${base}/api/orders/${encodeURIComponent(checkedId)}/technical-checks`,
        {method:'GET',cache:'no-store'});
      if(!response.ok)throw new Error($t('orderAssistant.technicalUnavailable'));
      const result=await response.json();
      if(checkedId!==orderId||sequence!==technicalSequence)return;
      if(result?.orderId!==checkedId||
         result.checks?.kind!=='deterministic-technical-evidence'||
         typeof result.orderUpdatedAt!=='string')
        throw new Error($t('orderAssistant.technicalUnavailable'));
      technical=result.checks;technicalVersion=result.orderUpdatedAt;
    }catch(err){
      if(checkedId===orderId&&sequence===technicalSequence)
        technicalError=err instanceof Error?err.message:$t('orderAssistant.technicalUnavailable');
    }finally{if(checkedId===orderId&&sequence===technicalSequence)technicalBusy=false;}
  }
  $effect(()=>{
    if(technicalVersion!==null&&orderUpdatedAt!==technicalVersion){
      technical=null;technicalVersion=null;
    }
  });
  function prepareTechnicalQuestion(){
    mode='chat';
    question=$t('orderAssistant.suggest.technical');
  }
  const techIssueLabel=(issue:TechnicalIssue)=>$t(`orderAssistant.technicalIssue.${issue.code}`);
  const displayMetric=(n:number|null)=>n===null?$t('orderAssistant.notVerified'):
    n.toLocaleString(undefined,{maximumFractionDigits:5});
  let proposalsStale=$derived(!!proposals.length &&
    (dirty||!proposalVersion||orderUpdatedAt!==proposalVersion||
      JSON.stringify(current)!==proposalsBase));
  let hasAccepted=$derived(!proposalsStale && proposals.some((p,i)=>
    approvals[i]===true && !isUnchanged(p)));
  function isUnchanged(p:IntakeProposal){
    return proposalMatchesCurrent(p,current);
  }
  function fieldName(field:string){
    return $t('orderAssistant.fieldNames.'+field);
  }
  function resetProposals(){
    proposals=[];missing=[];approvals={};applied=false;proposalVersion='';proposalsBase='';
  }
  async function ask(){
    if(busy||!canAsk||!consent||!question.trim()||!orderId)return;
    const text=question.trim();
    if(text.length>2500){problem=$t('orderAssistant.tooLong');return;}
    if(mode==='propose' && dirty){problem=$t('orderAssistant.saveBeforePropose');return;}
    const requestedMode=mode;
    const questionOrder=orderId;
    const prior=turns.slice(-8).map(x=>({role:x.role,content:x.content.slice(0,1600)}));
    const capturedCurrent=JSON.stringify(current);
    const capturedVersion=orderUpdatedAt;
    const serial=++requestSerial;
    problem='';busy=true;question='';resetProposals();
    try{
      const response=await fetch(`${base}/api/ai/order-assistant`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({orderId:questionOrder,question:text,mode:requestedMode,
          consent:true,language:$locale||'en',history:prior,
          ...(capturedVersion?{expectedUpdatedAt:capturedVersion}:{})})
      });
      const body=await response.json().catch(()=>({}));
      if(questionOrder!==orderId||serial!==requestSerial)return;
      if(!response.ok)throw Error(response.status===409?$t('orderAssistant.stale'):
        body.message??body.error??$t('orderAssistant.failed'));
      if(typeof body.reply!=='string'||!body.reply.trim()||
         typeof body.orderUpdatedAt!=='string'||!Array.isArray(body.proposals)||
         !Array.isArray(body.missing))throw Error($t('orderAssistant.failed'));
      if(capturedVersion && body.orderUpdatedAt!==capturedVersion)
        throw Error($t('orderAssistant.stale'));
      if(requestedMode==='propose' && (dirty || JSON.stringify(current)!==capturedCurrent))
        throw Error($t('orderAssistant.localChanged'));
      // Never allow a response against an older form to silently apply fields.
      turns=[...turns,{role:'user' as const,content:text},{role:'assistant' as const,content:body.reply}].slice(-16);
      model=body.model??'';lastMode=requestedMode;
      if(body.technicalChecks?.kind==='deterministic-technical-evidence'){
        technical=body.technicalChecks;
        technicalVersion=body.orderUpdatedAt;
      }
      if(requestedMode==='propose'){
        proposals=body.proposals;
        missing=body.missing;
        proposalVersion=body.orderUpdatedAt;
        proposalsBase=capturedCurrent;
        approvals={};applied=false;
      }
    }catch(err){
      if(questionOrder===orderId&&serial===requestSerial){
        question=text;problem=err instanceof Error?err.message:$t('orderAssistant.failed');
      }
    }finally{if(questionOrder===orderId&&serial===requestSerial)busy=false;}
  }
  async function apply(){
    if(!editable||applying||busy||applied||!hasAccepted)return;
    problem='';
    if(proposalsStale || !proposalVersion){
      problem=$t('orderAssistant.localChanged');return;
    }
    applying=true;
    try{
      const response=await fetch(`${base}/api/draft-orders/${encodeURIComponent(orderId)}`,
        {cache:'no-store'});
      if(!response.ok)throw Error($t('orderAssistant.stale'));
      const latest=await response.json();
      if(latest.updatedAt!==proposalVersion||!
        ['DRAFT','draft','PENDING_REVIEW'].includes(latest.status))
        throw Error($t('orderAssistant.stale'));
      if(proposalsStale)throw Error($t('orderAssistant.localChanged'));
      // Proposal normalizer validates types/field names again; only explicitly
      // selected (unchecked-by-default) fields are copied to LOCAL form state.
      onApply(proposalsToPatch(proposals.filter((_,i)=>approvals[i]===true)));
      applied=true;approvals={};
    }catch(err){problem=err instanceof Error?err.message:$t('orderAssistant.applyFailed');}
    finally{applying=false;}
  }
  function resetConversation(){
    requestSerial++;turns=[];question='';problem='';resetProposals();model='';
  }
</script>

<section class="assistant" aria-label={$t('orderAssistant.title')}>
  <header class="intro">
    <h3>{$t('orderAssistant.title')}</h3>
    <button type="button" class="secondary" onclick={resetConversation} disabled={busy}>
      {$t('orderAssistant.clear')}
    </button>
  </header>
  <p class="hint">{$t('orderAssistant.description')}</p>
  <p class="hint">{$t('orderAssistant.savedOnly')}</p>
  <div class="source-actions">
    {#if onOpenProfiles}
      <button type="button" class="secondary" onclick={onOpenProfiles}>
        {$t('orderAssistant.openProfiles')}
      </button>
    {/if}
    {#if onOpenIntake}
      <button type="button" class="secondary" onclick={onOpenIntake}>
        {$t('orderAssistant.openFileAnalysis')}
      </button>
    {/if}
  </div>
  <p class="hint">{$t('orderAssistant.fileIntakeHint')}</p>
  {#if dirty}<p class="warning" role="status">{$t('orderAssistant.unsaved')}</p>{/if}
  <label class="consent">
    <input type="checkbox" bind:checked={consent} disabled={busy||!canAsk}/>
    {$t('orderAssistant.consent')}
  </label>
  {#if !canAsk}<p class="hint">{$t('orderAssistant.readOnly')}</p>{/if}

  <section class="technical" aria-label={$t('orderAssistant.technicalTitle')}>
    <div class="technical-title">
      <div>
        <h4>{$t('orderAssistant.technicalTitle')}</h4>
        <p class="hint">{$t('orderAssistant.technicalInfo')}</p>
      </div>
      <button type="button" class="secondary" disabled={!canAsk||technicalBusy}
        onclick={checkTechnical}>
        {technicalBusy?$t('orderAssistant.technicalLoading'):$t('orderAssistant.runTechnical')}
      </button>
    </div>
    {#if technicalError}<p role="alert" class="warning">{technicalError}</p>{/if}
    {#if technical}
      <div class="technical-metrics">
        <div><strong>{displayMetric(technical.primaryUnits)}</strong>
          <span>{$t('orderAssistant.primaryUnits')}</span></div>
        <div><strong>{technical.materialCount}</strong>
          <span>{$t('orderAssistant.materialLines')}</span></div>
        <div><strong>{displayMetric(technical.boundingFaceAreaM2)}</strong>
          <span>{$t('orderAssistant.boundingM2')}</span></div>
      </div>
      <p class="hint">
        {$t('orderAssistant.measuredProfiles',{values:{
          measured:technical.measuredProfiles,total:technical.profileCount
        }})}
      </p>
      <p class="hint">{$t('orderAssistant.boundingCaveat')}</p>
      {#if technical.geometries.length>0}
        <div class="technical-lines">
          {#each technical.geometries.slice(0,showAllTechnical?100:4) as g (g.profileIndex)}
            <p>{$t('orderAssistant.profileNumber',{values:{number:g.profileIndex+1}})}:
              {g.widthMm} × {g.heightMm} mm · {g.quantity} ×
              {displayMetric(g.boundingAreaM2)} m²</p>
          {/each}
        </div>
      {/if}
      {#if technical.materialLines.length>0}
        <h4>{$t('orderAssistant.recordedMaterials')}</h4>
        <div class="technical-lines">
          {#each technical.materialLines.slice(0,showAllTechnical?100:4) as material (material.materialIndex)}
            <p>{material.description||$t('orderAssistant.materialNumber',{values:{number:material.materialIndex+1}})}
              · {displayMetric(material.quantity)} {material.unit??$t('orderAssistant.unitMissing')}
            </p>
          {/each}
        </div>
      {/if}
      {#if technical.issues.length>0}
        <ul class="technical-issues">
          {#each technical.issues.slice(0,showAllTechnical?100:5) as issue,i (i)}
            <li class:review={issue.severity==='review'}>
              {techIssueLabel(issue)}
              {#if issue.profileIndex!==undefined}
                · {$t('orderAssistant.profileNumber',{values:{number:issue.profileIndex+1}})}
              {/if}
              {#if issue.materialIndex!==undefined}
                · {$t('orderAssistant.materialNumber',{values:{number:issue.materialIndex+1}})}
              {/if}
              {#if issue.subject} · {issue.subject}{/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if technical.issues.length>5||technical.geometries.length>4||
        technical.materialLines.length>4}
        <button class="secondary" type="button" onclick={()=>showAllTechnical=!showAllTechnical}>
          {showAllTechnical?$t('orderAssistant.technicalLess'):$t('orderAssistant.technicalMore')}
        </button>
      {/if}
      <p class="hint">{$t('orderAssistant.technicalNoAuthority')}</p>
      <button type="button" class="secondary" disabled={!canAsk||busy}
        onclick={prepareTechnicalQuestion}>
        {$t('orderAssistant.explainTechnical')}
      </button>
    {/if}
  </section>
  <div class="conversation" aria-live="polite">
    {#if !turns.length}
      <p class="hint">{$t('orderAssistant.empty')}</p>
    {:else}
      {#each turns as turn,i (i)}
        <article class:user={turn.role==='user'} class:answer={turn.role==='assistant'}>
          <strong>{$t(turn.role==='user'?'orderAssistant.you':'orderAssistant.assistant')}</strong>
          <p>{turn.content}</p>
        </article>
      {/each}
    {/if}
  </div>
  <label>{$t('orderAssistant.mode')}
    <select bind:value={mode} disabled={busy||!canAsk}>
      <option value="chat">{$t('orderAssistant.chatMode')}</option>
      <option value="propose">{$t('orderAssistant.proposeMode')}</option>
    </select>
  </label>
  <div class="quick-actions">
    {#each samples as suggestion}
      <button type="button" class="secondary" disabled={!canAsk||busy}
        onclick={()=>{question=$t(`orderAssistant.suggest.${suggestion}`);}}>
        {$t(`orderAssistant.suggest.${suggestion}`)}
      </button>
    {/each}
  </div>
  <label>{$t('orderAssistant.question')}
    <textarea bind:value={question} maxlength="2500" rows="4"
      placeholder={$t('orderAssistant.placeholder')} disabled={busy||!canAsk}
      onkeydown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();void ask();}}}></textarea>
  </label>
  <button type="button" class="primary" onclick={ask}
    disabled={busy||!consent||!canAsk||!question.trim()}>
    {busy?$t('orderAssistant.thinking'):$t('orderAssistant.send')}
  </button>
  {#if problem}<p role="alert" class="warning">{problem}</p>{/if}
  {#if model}<p class="hint">{$t('orderAssistant.model')}: {model}</p>{/if}

  {#if lastMode==='propose'&&(proposals.length>0||missing.length>0)}
    <section class="proposals">
      <h4>{$t('orderAssistant.review')}</h4>
      <p class="hint">{$t('orderAssistant.unverified')}</p>
      {#if proposalsStale}
        <p class="warning" role="status">{$t('orderAssistant.reviewStale')}</p>
      {/if}
      {#each proposals as proposal,i (`${proposal.field}-${i}`)}
        <label class="proposal">
          <span class="proposal-head">
            <input type="checkbox" checked={approvals[i]===true}
              onchange={e=>approvals={...approvals,[i]:e.currentTarget.checked}}
              disabled={!editable||applying||applied||proposalsStale||isUnchanged(proposal)}/>
            <strong>{fieldName(proposal.field)}</strong>
            <small>{$t('orderAssistant.confidence.'+proposal.confidence)}</small>
          </span>
          <span>{$t('orderAssistant.current')}: {String(current[proposal.field]??'—')}</span>
          {#if isUnchanged(proposal)}
            <span class="hint">{$t('orderAssistant.noDifference')}</span>
          {/if}
          <span>{$t('orderAssistant.suggested')}: {proposal.value}</span>
          <span class="hint">{$t('orderAssistant.evidence')}: {proposal.evidence}</span>
        </label>
      {/each}
      {#if missing.length}
        <h4>{$t('orderAssistant.missing')}</h4>
        <ul>{#each missing as item,i (i)}<li>{item}</li>{/each}</ul>
      {/if}
      {#if applied}
        <p class="success" role="status">{$t('orderAssistant.applied')}</p>
      {:else if proposals.length}
        <button type="button" class="primary" onclick={apply}
          disabled={!editable||!hasAccepted||applying||busy||proposalsStale}>
          {applying?$t('orderAssistant.applying'):$t('orderAssistant.apply')}
        </button>
      {/if}
    </section>
  {/if}
</section>

<style>
 .assistant{display:grid;gap:.8rem;padding:.65rem;min-width:0;color:var(--text)}
 .intro,.proposal-head{display:flex;align-items:center;justify-content:space-between;gap:.6rem}
 .source-actions{display:flex;gap:.45rem;flex-wrap:wrap}
 h3,h4{margin:0;font-size:1rem}h4{margin-top:.5rem}
 .hint{font-size:.81rem;color:var(--muted);margin:0}
 .warning{color:var(--warn);font-size:.83rem}.success{color:var(--brand);font-size:.83rem}
 label:not(.consent){display:grid;gap:.35rem;font-size:.82rem}
 .consent{display:flex;align-items:flex-start;gap:.5rem;font-size:.82rem}
 .conversation{max-height:390px;min-height:160px;overflow:auto;display:grid;gap:.5rem;align-content:start}
 .conversation article{border:1px solid var(--border);border-radius:10px;padding:.7rem;
   background:var(--bg-1);overflow-wrap:anywhere}
 .conversation article.user{background:var(--bg-2)}
 .conversation strong{font-size:.76rem}.conversation p{font-size:.87rem;white-space:pre-wrap;margin:.35rem 0 0}
 select,textarea{background:var(--bg-2);color:var(--text);border:1px solid var(--border);
   border-radius:8px;padding:.6rem;width:100%}
 button{min-height:38px;border:1px solid var(--border);border-radius:8px;
   padding:.45rem .7rem;font-weight:600;cursor:pointer}
 button:disabled{opacity:.5;cursor:not-allowed}
 .primary{background:var(--brand);color:white}.secondary{background:var(--bg-2);color:var(--text)}
 .quick-actions{display:flex;flex-wrap:wrap;gap:.35rem}.quick-actions button{font-size:.76rem}
 .proposals{display:grid;gap:.55rem;border-top:1px solid var(--border);padding-top:.75rem}
 .proposal{border:1px solid var(--border);padding:.6rem;border-radius:9px;
   display:grid;gap:.35rem}.proposal span{overflow-wrap:anywhere}
 .proposal-head{justify-content:flex-start}.proposal-head small{margin-left:auto;color:var(--muted)}
 .proposals ul{padding-left:1.3rem;font-size:.83rem;margin:.1rem}
 .technical{display:grid;gap:.55rem;border:1px solid var(--border);background:var(--bg-1);
   padding:.75rem;border-radius:10px}
 .technical-title{display:flex;justify-content:space-between;align-items:center;
   flex-wrap:wrap;gap:.55rem}
 .technical-title h4{margin:0}.technical-title p{margin:.15rem 0}
 .technical-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.45rem}
 .technical-metrics>div{display:grid;gap:.2rem;padding:.55rem;border:1px solid var(--border);
   border-radius:8px;min-width:0}
 .technical-metrics strong{font-size:1.1rem;font-variant-numeric:tabular-nums}
 .technical-metrics span{font-size:.7rem;color:var(--muted)}
 .technical-issues{display:grid;gap:.35rem;padding-left:1rem;margin:0}
 .technical-issues li{font-size:.79rem;color:var(--muted)}
 .technical-issues li.review{color:var(--warn)}
 .technical-lines p{margin:.1rem 0;font-size:.77rem}
 @media(max-width:550px){.technical-metrics{grid-template-columns:1fr 1fr}
   .technical-title button{width:100%}}
</style>