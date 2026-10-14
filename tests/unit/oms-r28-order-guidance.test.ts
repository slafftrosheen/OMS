import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {deriveOrderGuide,ORDER_SECTION_HELP} from '../../src/lib/order/order-flow-guidance';
const read=(p:string)=>readFileSync(p,'utf8');
const base={
 phase:'saved' as const,status:'DRAFT',clientName:'RF Client',
 deadline:'2026-10-22',title:'Backlit letters',
 profileCount:2,unassignedProfiles:0,fileCount:3,
 dirty:false,canEdit:true
};
describe('OMS-R28 contextual order guidance UX',()=>{
 it('never calls missing file metadata complete and never labels readiness approved',()=>{
   const unknown=deriveOrderGuide({...base,fileCount:null});
   expect(unknown.steps.find(s=>s.id==='files')?.signal).toBe('unknown');
   expect(unknown.signalsPresent).toBe(2);
   expect(unknown.suggested).toBe('files');
   const empty=deriveOrderGuide({...base,fileCount:0});
   expect(empty.steps.find(s=>s.id==='files')?.signal).toBe('missing');
   expect(deriveOrderGuide(base).signalsPresent).toBe(3);
   expect(deriveOrderGuide(base).steps.find(s=>s.id==='review')?.signal).toBe('check');
 });
 it('surfaces missing brief before ancillary steps and does not infer facts',()=>{
   const result=deriveOrderGuide({...base,clientName:' ',deadline:'',profileCount:0,
      unassignedProfiles:0,fileCount:null});
   expect(result.suggested).toBe('brief');
   expect(result.signalsPresent).toBe(0);
   expect(result.steps.find(s=>s.id==='profiles')?.signal).toBe('missing');
   expect(result.steps.find(s=>s.id==='brief')?.signal).toBe('missing');
 });
 it('treats a present but unassigned profile as requiring review, not complete',()=>{
   const result=deriveOrderGuide({...base,unassignedProfiles:2});
   expect(result.steps.find(s=>s.id==='profiles')?.signal).toBe('check');
   expect(result.signalsPresent).toBe(2);
   expect(result.suggested).toBe('profiles');
 });
 it('does not recommend editing a confirmed production order as a draft',()=>{
   const result=deriveOrderGuide({...base,status:'IN_PRODUCTION'});
   expect(result.isDraft).toBe(false);
   expect(result.suggested).toBe('review');
   expect(result.nextSection).toBe('readiness');
 });
 it('routes workflow sections correctly and keeps pre-save help local',()=>{
   expect(ORDER_SECTION_HELP.intake).toBe('files');
   expect(ORDER_SECTION_HELP.readiness).toBe('review');
   expect(ORDER_SECTION_HELP.revisions).toBe('review');
   const page=read('src/routes/orders/new/+page.svelte');
   expect(page).toContain('phase:\'new\' as const');
   expect(page).toContain('<OrderWorkflowCoach');
   expect(page).toContain('onNavigate={jumpToNewStep}');
   expect(page).not.toContain('onAsk={askWorkflowHelp}');
   expect(page).toContain('id="new-order-profiles"');
   expect(page).toContain('id="new-order-files"');
   expect(page).toContain('id="new-order-details"');
 });
 it('links help directly to one order-scoped assistant without auto submitting',()=>{
   const editor=read('src/routes/orders/[id]/edit/+page.svelte');
   const assistant=read('src/lib/order/OrderFlowAssistant.svelte');
   const coach=read('src/lib/order/OrderWorkflowCoach.svelte');
   expect(editor).toContain('onAsk={askWorkflowHelp}');
   expect(editor).toContain('onNavigate={navigateWorkflowHelp}');
   expect(editor).toContain('assistantPrefillVersion++');
   expect(editor).toContain('promptRevision={assistantPrefillVersion}');
   expect(editor).toContain('order-edit-profiles');
   expect(assistant).toContain('if(promptRevision>lastPrefillRevision&&!busy&&suggestedPrompt)');
   expect(assistant).toContain('question=suggestedPrompt');
   expect(assistant).toContain('if(busy||!canAsk||!consent||!question.trim()');
   expect(coach).toContain('onAsk?.($t(');
   expect(coach).not.toContain("fetch('/api/ai/order-assistant'");
 });
 it('shows status-specific handoff tips without bypassing order roles',()=>{
   const detail=read('src/routes/orders/[id]/+page.svelte');
   expect(detail).toContain("mayAskOrderAssistant");
   expect(detail).toContain("orderGuide.lifecycle.");
   expect(detail).toContain("goto(workspaceUrl(orderId,'chat'))");
   expect(detail).toContain("['RD','Boss','HeadOfProduction']");
 });
 it('localizes all section tips, statuses and safe prepared questions in EN/RU/LV',()=>{
   const keys=['brief','profiles','files','review'];
   const sections=['details','files','intake','readiness','layers',
     'revisions','changes','chat'];
   for(const lang of ['en','ru','lv']){
     const t=JSON.parse(read(`src/locales/${lang}.json`)).orderGuide;
     expect(t.disclaimer.length).toBeGreaterThan(50);
     expect(t.saveBeforeAI).toBeTruthy();
     for(const step of keys){
       expect(t.step[step]).toBeTruthy();
       expect(t.help[step]).toBeTruthy();
       expect(t.ask[step]).toBeTruthy();
     }
     for(const section of sections)expect(t.sectionTip[section]).toBeTruthy();
     for(const status of ['present','missing','check','unknown'])
       expect(t.signal[status]).toBeTruthy();
     for(const lifecycle of ['DRAFT','PENDING_REVIEW','CONFIRMED',
       'IN_PRODUCTION','READY_TO_LOAD','ON_HOLD','DISPATCHED','ARCHIVED'])
       expect(t.lifecycle[lifecycle]).toBeTruthy();
   }
 });
});
