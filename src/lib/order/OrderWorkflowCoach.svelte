<script lang="ts">
 import {t} from 'svelte-i18n';
 import {nextActionHalo} from '$lib/ui/next-action-halo';
 import {deriveOrderGuide,ORDER_SECTION_HELP} from './order-flow-guidance';
 import type {OrderGuideInput,GuideStepId} from './order-flow-guidance';
 import type {WorkspaceSection} from './workspace-navigation';
 let {context,section='details',focusStep,onNavigate,onAsk}:{
   context:OrderGuideInput;section?:WorkspaceSection;focusStep?:GuideStepId;
   onNavigate:(target:WorkspaceSection,step:GuideStepId)=>void;
   onAsk?:(question:string,step:GuideStepId)=>void;
 }=$props();
 let expanded=$state(false);
 let hidden=$state(false);
 let guide=$derived(deriveOrderGuide(context));
 let focus=$derived(guide.steps.find(s=>s.id===(focusStep??ORDER_SECTION_HELP[section]))??guide.steps[0]);
 function prompt(step:GuideStepId){
   // Prompts are localized UI text only; never automatically make model requests.
   onAsk?.($t(`orderGuide.ask.${step}`),step);
 }
</script>
<section class="coach" aria-label={$t('orderGuide.title')}>
 {#if hidden}
   <button class="reopen" type="button" onclick={()=>hidden=false}>
     ✦ {$t('orderGuide.show')}
   </button>
 {:else}
 <div class="top">
   <div class="heading">
     <span class="glyph" aria-hidden="true">✦</span>
     <div>
       <strong>{$t('orderGuide.title')}</strong>
       <p>{$t(context.phase==='new'?'orderGuide.newIntro':'orderGuide.savedIntro')}</p>
     </div>
   </div>
   <div class="top-actions">
     <span class="signal-count" title={$t('orderGuide.countHint')}>
       {guide.signalsPresent}/{guide.signalsTotal} {$t('orderGuide.signals')}
     </span>
     <button type="button" class="quiet" aria-expanded={expanded}
       onclick={()=>expanded=!expanded}>
       {expanded?$t('orderGuide.less'):$t('orderGuide.more')}
     </button>
     <button type="button" class="quiet close" aria-label={$t('orderGuide.hide')}
       onclick={()=>hidden=true}>×</button>
   </div>
 </div>
   <div class="focus">
     <div class="focus-copy">
       <span class="eyebrow">{$t('orderGuide.currentStep')}</span>
       <strong>{$t(`orderGuide.step.${focus.id}`)}</strong>
       <p>{$t(focus.helpKey)}</p>
       <p class="section-tip">{$t(`orderGuide.sectionTip.${section}`)}</p>
       {#if context.dirty}<p class="dirty">{$t('orderGuide.unsaved')}</p>{/if}
       {#if context.phase==='new'}<p class="small">{$t('orderGuide.saveBeforeAI')}</p>{/if}
     </div>
     <div class="focus-actions">
       <button class="go next-step" type="button"
         use:nextActionHalo={context.canEdit && guide.isDraft}
         onclick={()=>onNavigate(guide.nextSection,guide.suggested)}>
         {$t('orderGuide.next')}: {$t(`orderGuide.step.${guide.suggested}`)} →
       </button>
       {#if onAsk}
         <button class="go" type="button" disabled={!context.canEdit}
           onclick={()=>onNavigate('chat','profiles')}>
           {$t('orderGuide.technicalChecks')} →
         </button>
         <button class="ask" type="button" disabled={!context.canEdit}
           onclick={()=>prompt(focus.id)}>
           ✦ {$t('orderGuide.askButton')}
         </button>
       {/if}
     </div>
   </div>
   {#if expanded}
     <div class="steps" aria-label={$t('orderGuide.stepsLabel')}>
       {#each guide.steps as step (step.id)}
         <button type="button" class="step" class:current={step.id===focus.id}
           aria-current={step.id===focus.id?'step':undefined}
           onclick={()=>onNavigate(step.section,step.id)}>
           <span class:complete={step.signal==='present'} class="mark" aria-hidden="true">
             {step.signal==='present'?'✓':step.signal==='unknown'?'?':step.id==='review'?'·':'!'}
           </span>
           <span class="step-name">{$t(`orderGuide.step.${step.id}`)}</span>
           <span class="step-status">{$t(`orderGuide.signal.${step.signal}`)}</span>
         </button>
       {/each}
     </div>
     <p class="disclaimer">{$t('orderGuide.disclaimer')}</p>
   {/if}
 {/if}
</section>
<style>
 .coach{display:grid;gap:.55rem;margin:.6rem 0;border:1px solid var(--border);
   background:var(--bg-1);border-radius:12px;padding:.7rem .9rem;color:var(--text)}
 .top,.heading,.top-actions,.focus,.focus-actions{display:flex;align-items:center;gap:.7rem}
 .top{justify-content:space-between;flex-wrap:wrap}
 .heading{min-width:0}.glyph{font-size:1.2rem;color:var(--brand)}
 .heading strong{font-size:.87rem}.heading p{font-size:.74rem;color:var(--muted);margin:0}
 .top-actions{margin-left:auto;gap:.4rem}.signal-count{font-size:.73rem;color:var(--muted);white-space:nowrap}
 .quiet,.reopen{border:0;background:transparent;color:var(--muted);cursor:pointer;
   min-height:36px;padding:.4rem;border-radius:7px}
 .quiet:hover,.reopen:hover{background:var(--bg-2);color:var(--text)}
 .close{font-size:1.15rem}
 .focus{justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.85rem}
 .focus-copy{flex:1;min-width:min(100%,280px);display:grid;gap:.14rem}
 .focus-copy strong{font-size:.92rem}.focus-copy p{font-size:.79rem;color:var(--muted);margin:0}
 .eyebrow{text-transform:uppercase;font-size:.69rem;letter-spacing:.08em;color:var(--muted)}
 .focus-copy .dirty{color:var(--warn)}.focus-copy .small{font-size:.74rem}
 .focus-actions{flex-wrap:wrap}
 .go,.ask{border-radius:8px;min-height:40px;padding:.55rem .8rem;cursor:pointer;
   border:1px solid var(--border);font-weight:600;font-size:.79rem}
 .go{background:var(--bg-2);color:var(--text)}
 .ask{background:var(--brand);color:white}.ask:disabled{opacity:.55;cursor:not-allowed}
 .steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.45rem}
 .step{display:flex;gap:.35rem;align-items:center;min-width:0;min-height:42px;
   padding:.5rem;border-radius:8px;border:1px solid var(--border);
   background:var(--bg-2);color:var(--text);cursor:pointer;text-align:left}
 .step.current{border-color:var(--brand)}
 .step-name{font-size:.77rem;font-weight:600;min-width:0}
 .step-status{font-size:.68rem;color:var(--muted);margin-left:auto;white-space:nowrap}
 .mark{width:1.15rem;height:1.15rem;border:1px solid var(--border);
   border-radius:100%;display:grid;place-items:center;font-size:.7rem;flex:none}
 .mark.complete{color:var(--brand)}
 .disclaimer{font-size:.72rem;color:var(--muted);margin:.1rem 0 0}
 .reopen{justify-self:start}
 @media(max-width:900px){.steps{grid-template-columns:repeat(2,minmax(0,1fr))}
   .step{flex-wrap:wrap}.step-status{white-space:normal}}
 @media(max-width:540px){.steps{grid-template-columns:1fr}.focus-actions{width:100%}
   .go,.ask{flex:1}}

  /* R04: workflow coach guides without obstructing native order form. */
  .coach{background:var(--glass-bg-strong);border:1px solid var(--glass-border);
    border-radius:var(--radius-lg);padding:var(--space-md) var(--space-lg);
    color:var(--ink-primary);gap:var(--space-sm);min-width:0}
  .top{gap:var(--space-sm);align-items:flex-start}
  .heading{gap:var(--space-sm);min-width:0}
  .heading strong{font-size:var(--text-sm);font-weight:750;color:var(--ink-primary)}
  .heading p,.focus-copy p{color:var(--ink-secondary);line-height:1.5}
  .glyph{color:var(--brand)}
  .signal-count{border:1px solid var(--border);border-radius:var(--radius-sm);
    background:var(--bg-2);padding:6px 9px;color:var(--ink-secondary);
    font-variant-numeric:tabular-nums}
  .top-actions{gap:var(--space-xs);flex-wrap:wrap}
  .quiet,.reopen{color:var(--ink-secondary);border-radius:var(--radius-sm);
    min-width:40px;min-height:40px}
  .quiet:hover,.reopen:hover{background:var(--bg-2);color:var(--ink-primary)}
  .focus{gap:var(--space-md);padding:var(--space-sm) 0}
  .focus-copy{min-width:0;gap:var(--space-xs)}
  .focus-copy strong{font-size:var(--text-md);line-height:1.3}
  .eyebrow{color:var(--brand);letter-spacing:.09em}
  .focus-actions{gap:var(--space-xs)}
  .go,.ask{border-radius:var(--radius-sm);min-height:44px;padding:10px 13px;
    transition:background var(--motion-sm) var(--ease-standard)}
  .go{background:var(--bg-1);color:var(--ink-primary);border-color:var(--border)}
  .go:hover:not(:disabled){background:var(--bg-2)}
  .next-step{background:var(--brand-soft);border-color:var(--brand);color:var(--ink-primary)}
  .next-step:hover:not(:disabled){background:var(--brand-soft);border-color:var(--focus)}
  .ask{background:var(--bg-1);border-color:var(--border);color:var(--ink-secondary)}
  .ask:hover:not(:disabled){background:var(--bg-2);color:var(--ink-primary)}
  .go:disabled,.ask:disabled{opacity:1;color:var(--ink-tertiary);background:var(--bg-2);border-style:dashed;cursor:not-allowed}
  .steps{gap:var(--space-xs)}
  .step{background:var(--bg-1);border-color:var(--border);
    border-radius:var(--radius-sm);min-height:52px;gap:var(--space-xs)}
  .step.current{border-color:var(--brand);background:var(--brand-soft)}
  .step-name{color:var(--ink-primary);line-height:1.35}
  .step-status{color:var(--ink-secondary)}
  .mark{border-radius:var(--radius-sm);color:var(--ink-tertiary)}
  .mark.complete{color:var(--ok);border-color:color-mix(in oklab,var(--ok) 35%,var(--border));
    background:var(--ok-soft)}
  .quiet:focus-visible,.reopen:focus-visible,.go:focus-visible,
  .ask:focus-visible,.step:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
  .disclaimer{color:var(--ink-tertiary);line-height:1.5}
  @media(max-width:680px){.coach{padding:var(--space-sm)}
    .focus{align-items:stretch}.focus-actions{width:100%}
    .go,.ask{flex:1 1 100%}}
  @media(prefers-reduced-motion:reduce){.go,.ask{transition:none}}
  @media(prefers-reduced-transparency:reduce){.coach{background:var(--bg-1)}}
</style>
