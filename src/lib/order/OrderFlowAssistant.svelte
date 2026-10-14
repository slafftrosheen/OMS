<script lang="ts">
  import {t} from 'svelte-i18n';
  import {base} from '$app/paths';
  import {proposalsToPatch,type IntakeProposal} from './intake-contract';
  import type {OrderAssistantTurn} from './assistant-contract';

  type AssistantReply={
    reply:string;model:string;orderUpdatedAt:string;
    mode:'chat'|'propose';proposals:IntakeProposal[];missing:string[];
    provenance:'model-reported'
  };
  let {orderId,orderUpdatedAt,editable,canAsk,current,dirty,onApply}:{
    orderId:string;orderUpdatedAt:string|null;editable:boolean;canAsk:boolean;
    current:Record<string,unknown>;dirty:boolean;
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
  let requestSerial=0;
  const samples=['questions','gaps','materials'] as const;
  let hasAccepted=$derived(proposals.some((_,i)=>approvals[i]===true));
  function resetProposals(){
    proposals=[];missing=[];approvals={};applied=false;proposalVersion='';proposalsBase='';
  }
  async function ask(){
    if(busy||!canAsk||!consent||!question.trim()||!orderId)return;
    const text=question.trim();
    if(text.length>2500){problem=$t('orderAssistant.tooLong');return;}
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
          consent:true,history:prior,
          ...(capturedVersion?{expectedUpdatedAt:capturedVersion}:{})})
      });
      const body=await response.json().catch(()=>({}));
      if(questionOrder!==orderId||serial!==requestSerial)return;
      if(!response.ok)throw Error(response.status===409?$t('orderAssistant.stale'):
        body.message??body.error??$t('orderAssistant.failed'));
      if(typeof body.reply!=='string'||!body.reply.trim()||
         typeof body.orderUpdatedAt!=='string'||!Array.isArray(body.proposals)||
         !Array.isArray(body.missing))throw Error($t('orderAssistant.failed'));
      // Never allow a response against an older form to silently apply fields.
      turns=[...turns,{role:'user',content:text},{role:'assistant',content:body.reply}].slice(-16);
      model=body.model??'';lastMode=requestedMode;
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
    if(!proposalVersion||JSON.stringify(current)!==proposalsBase){
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
  {#if dirty}<p class="warning" role="status">{$t('orderAssistant.unsaved')}</p>{/if}
  <label class="consent">
    <input type="checkbox" bind:checked={consent} disabled={busy||!canAsk}/>
    {$t('orderAssistant.consent')}
  </label>
  {#if !canAsk}<p class="hint">{$t('orderAssistant.readOnly')}</p>{/if}

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
      {#each proposals as proposal,i (`${proposal.field}-${i}`)}
        <label class="proposal">
          <span class="proposal-head">
            <input type="checkbox" checked={approvals[i]===true}
              onchange={e=>approvals={...approvals,[i]:e.currentTarget.checked}}
              disabled={!editable||applying||applied}/>
            <strong>{proposal.field}</strong><small>{proposal.confidence}</small>
          </span>
          <span>{$t('orderAssistant.current')}: {String(current[proposal.field]??'—')}</span>
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
          disabled={!editable||!hasAccepted||applying||busy}>
          {applying?$t('orderAssistant.applying'):$t('orderAssistant.apply')}
        </button>
      {/if}
    </section>
  {/if}
</section>

<style>
 .assistant{display:grid;gap:.8rem;padding:.65rem;min-width:0;color:var(--text)}
 .intro,.proposal-head{display:flex;align-items:center;justify-content:space-between;gap:.6rem}
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
</style>