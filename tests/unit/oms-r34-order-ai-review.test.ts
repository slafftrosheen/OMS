import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {proposalMatchesCurrent,proposalsToPatch,type IntakeProposal} from
  '../../src/lib/order/intake-contract';
import {summarizeNativeProfileConfiguration} from
  '../../src/lib/order/native-profile-context';

const read=(path:string)=>readFileSync(path,'utf8');
const candidate=(field:IntakeProposal['field'],value:string):IntakeProposal=>({
  field,value,evidence:'Customer drawing',confidence:'medium'
});

describe('OMS-R34 — native form, attachment and OpenRouter review',()=>{
  it('has only one native profile section type declaration',()=>{
    const source=read('src/lib/order/native-profile-context.ts');
    expect(source.match(/type ProductionSection=keyof typeof properties;/g)).toHaveLength(1);
  });
  it('detects no-op suggestions without altering order fields',()=>{
    const current={clientName:'Customer',isRd:false,notes:'Keep as-is',priority:'NORMAL'};
    expect(proposalMatchesCurrent(candidate('clientName','Customer'),current)).toBe(true);
    expect(proposalMatchesCurrent(candidate('isRd','false'),current)).toBe(true);
    expect(proposalMatchesCurrent(candidate('notes','  Keep as-is  '),current)).toBe(true);
    expect(proposalMatchesCurrent(candidate('priority','HIGH'),current)).toBe(false);
    expect(proposalMatchesCurrent(candidate('deliveryPhone','12345678'),current)).toBe(false);
    expect(current.priority).toBe('NORMAL');
    expect(proposalsToPatch([candidate('priority','HIGH')]))
      .toEqual({priority:'HIGH'});
  });
  it('uses active operator choices, not stale hidden options',()=>{
    const summary=summarizeNativeProfileConfiguration({
      ASSEMBLING:{led:false,ledModule:'Old module',psu:false,psuModel:'Old PSU'},
      PAINTING:{sides:false,sidesColor:{system:'RAL',code:'9999'}}
    });
    expect(summary.sections.ASSEMBLING?.led).toBe(false);
    expect(summary.sections.ASSEMBLING).not.toHaveProperty('ledModule');
    expect(summary.sections.ASSEMBLING).not.toHaveProperty('psuModel');
    expect(summary.sections.PAINTING).not.toHaveProperty('sidesColorcode');
  });
  it('binds selected file and profile to saved, authorized order data only',()=>{
    const intake=read('src/routes/api/ai/order-intake/+server.ts');
    const files=read('src/lib/order/OrderFiles.svelte');
    const edit=read('src/routes/orders/[id]/edit/+page.svelte');
    expect(intake).toContain('profileIndex:z.number().int().min(0).max(99)');
    expect(intake).toContain("if(!canEditDraft(user.role");
    expect(intake).toContain(".from('order_profiles')");
    expect(intake).toContain(".eq('draft_order_id',order.id).order('order_index')");
    expect(intake).toContain('summarizeNativeProfileConfiguration(profile.configuration)');
    expect(intake).toContain(".from('order_files')");
    expect(intake).toContain('readOrderStoredFile');
    expect(intake).toContain('expectedUpdatedAt');
    expect(intake).not.toContain('.update(');
    expect(intake).not.toContain('.insert(');
    expect(files).toContain('onAnalyze?.(file.id)');
    expect(edit).toContain('openAttachmentIntake');
    expect(edit).toContain('openProfileIntake');
    expect(edit).toContain('profileNames={intakeProfileNames} dirty={formDirty}');
  });
  it('never applies suggestions based on a changed file, local form, or order revision',()=>{
    const flow=read('src/lib/order/OrderFlowAssistant.svelte');
    const intake=read('src/lib/order/OrderIntakeAssistant.svelte');
    expect(flow).toContain('proposalsStale');
    expect(flow).toContain("mode==='propose' && dirty");
    expect(flow).toContain('if(proposalsStale)throw Error');
    expect(flow).toContain('proposalMatchesCurrent(p,current)');
    expect(intake).toContain('sourceMatches');
    expect(intake).toContain('analysisStale');
    expect(intake).toContain('acceptedCount===0');
    expect(intake).toContain('if(!sourceMatches || analysisStale)');
    expect(intake).toContain('!consent||analyzing');
    expect(intake).toContain('expectedUpdatedAt:capturedVersion');
  });
  it('provides complete EN/RU/LV labels for proposal review and file-focused analysis',()=>{
    for(const language of ['en','ru','lv']){
      const locale=JSON.parse(read(`src/locales/${language}.json`));
      for(const field of ['clientName','title','deadline','loadingDate','priority','notes',
        'deliveryAddress','deliveryContact','deliveryPhone','deliveryEmail','isRd','rdNotes'])
        expect(locale.orderAssistant.fieldNames[field]).toBeTruthy();
      for(const confidence of ['high','medium','low'])
        expect(locale.orderAssistant.confidence[confidence]).toBeTruthy();
      for(const key of ['saveBeforePropose','reviewStale','noDifference'])
        expect(locale.orderAssistant[key]).toBeTruthy();
      for(const key of ['profileFocus','wholeOrder','profileFocusHint','openForProfile',
        'saveFirst','selectionChanged','analysisStale'])
        expect(locale.orderIntake[key]).toBeTruthy();
    }
  });
});
