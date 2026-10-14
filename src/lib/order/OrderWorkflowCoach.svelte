<script lang="ts">
 import {t} from 'svelte-i18n';
 import {deriveOrderGuide,ORDER_SECTION_HELP} from './order-flow-guidance';
 import type {OrderGuideInput,GuideStepId} from './order-flow-guidance';
 import type {WorkspaceSection} from './workspace-navigation';
 let {context,section='details',onNavigate,onAsk}:{
   context:OrderGuideInput;section?:WorkspaceSection;
   onNavigate:(target:WorkspaceSection,step:GuideStepId)=>void;
   onAsk?:(question:string,step:GuideStepId)=>void;
 }=$props();
 let expanded=$state(false);
 let hidden=$state(false);
 let guide=$derived(deriveOrderGuide(context));
 let focus=$derived(guide.steps.find(s=>s.id===ORDER_SECTION_HELP[section])??guide.steps[0]);
 let suggestion=$derived(guide.steps.find(s=>s.id===guide.suggested)??guide.steps[0]);
 function prompt(step:GuideStepId){
   // Prompts are localized UI text only; never automatically make model requests.
   onAsk?.($t(`orderGuide.ask.${step}`),step);
 }
</script>
<section class="coach" aria-label={$t('orderGuide.title')}>
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
       onclick={()=>hidden=!hidden}>{hidden?$t('orderGuide.show'):'×'}</button>
   </div>
 </div>
 {#if hidden}
   <button class="reopen" type="button" onclick={()=>hidden=false}>
     ✦ {$t('orderGuide.show')}
   </button>
 {:else}
   <div class="focus">
     <div class="focus-copy">
       <span class="eyebrow">{$t('orderGuide.currentStep')}</span>
       <strong>{$t(`orderGuide.step.${focus.id}`)}</strong>
       <p>{$t(focus.helpKey)}</p>
       {#if context.dirty}<p class="dirty">{$t('orderGuide.unsaved')}</p>{/if}
       {#if context.phase==='new'}<p class="small">{$t('orderGuide.saveBeforeAI')}</p>{/if}
     </div>
     <div class="focus-actions">
       <button class="go" type="button"
         onclick={()=>onNavigate(guide.nextSection,guide.suggested)}>
         {$t('orderGuide.next')}: {$t(`orderGuide.step.${guide.suggested}`)} →
       </button>
       {#if onAsk}
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
</style>