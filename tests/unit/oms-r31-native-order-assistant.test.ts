import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {summarizeNativeProfileConfiguration}
 from '../../src/lib/order/native-profile-context';
import {orderFields,canonicalOrderProfiles}
 from '../../src/lib/server/order/draft-contract';
const read=(p:string)=>readFileSync(p,'utf8');
describe('OMS-R31 restore native forms and wire OpenRouter without duplication',()=>{
 it('summarizes only native Profile7st fields, including material selections and options',()=>{
   const view=summarizeNativeProfileConfiguration({
     profileName:'Sign letters',signType:'EXTERIOR',
     CNC_FREZER:{face:'ACRYLIC_XT',back:'ALU_SHEET',laser:true,
       faceThickness:'3',notes:'Check sample'},
     BENDER:{sides:'ALU_PROFILE',depth:100},
     FRONT:{face:true,faceFilm:'VINYL_ORACAL',sides:false},
     PAINTING:{face:true,faceColor:{system:'RAL',code:'9005',hex:'#010203'}},
     ASSEMBLING:{led:true,psu:true,psuType:'dimmable',frame:true,
       frameMaterial:'40x40 aluminum',notes:'Review mounting'},
     fabricationSpec:{version:1,width_mm:600},password:'secret'
   });
   expect(view.profileName).toBe('Sign letters');
   expect(view.signType).toBe('EXTERIOR');
   expect(view.sections.CNC_FREZER?.face).toBe('ACRYLIC_XT');
   expect(view.sections.CNC_FREZER?.laser).toBe(true);
   expect(view.sections.BENDER?.depth).toBe(100);
   expect(view.sections.FRONT?.face).toBe(true);
   expect(view.sections.FRONT?.sides).toBe(false);
   expect(view.sections.PAINTING?.faceColorcode).toBe('9005');
   expect(view.sections.ASSEMBLING?.psuType).toBe('dimmable');
   expect(JSON.stringify(view)).not.toContain('fabricationSpec');
   expect(JSON.stringify(view)).not.toContain('password');
   expect(JSON.stringify(view)).not.toContain('#010203');
 });
 it('treats missing source configuration as unknown rather than inventing requirements',()=>{
   const empty=summarizeNativeProfileConfiguration(null);
   expect(empty).toEqual({profileName:null,signType:null,sections:{}});
   const unpopulated=summarizeNativeProfileConfiguration({
     CNC_FREZER:{face:'',back:null,notes:'   '},BENDER:{depth:Infinity}
   });
   expect(unpopulated.sections).toEqual({});
 });
 it('omits inactive native form values from the OpenRouter snapshot',()=>{
   const summary=summarizeNativeProfileConfiguration({
     CNC_FREZER:{face:'',faceThickness:'12',back:'ALU_SHEET',backThickness:'3'},
     BENDER:{sides:'',depth:100,sidesThickness:'1.5'},
     FRONT:{face:false,faceFilm:'OLD VINYL',back:true,backFilm:'8500_064',
       sides:false,sidesFilm:'OLD SIDE FILM'},
     PAINTING:{face:false,faceColor:{system:'RAL',code:'9005'},
       sides:true,sidesColor:{system:'RAL',code:'9010'},
       back:false,backCustom:'OLD BACK COATING'},
     ASSEMBLING:{led:false,ledModule:'OLD LED',
       psu:false,psuModel:'OLD PSU',psuType:'dimmable',
       cables:true,cablesLength:'3m',
       frame:false,frameMaterial:'OLD FRAME',frameMountingHoles:true}
   });
   expect(summary.sections.CNC_FREZER).not.toHaveProperty('faceThickness');
   expect(summary.sections.CNC_FREZER?.backThickness).toBe('3');
   expect(summary.sections.BENDER).toBeUndefined();
   expect(summary.sections.FRONT?.face).toBe(false);
   expect(summary.sections.FRONT).not.toHaveProperty('faceFilm');
   expect(summary.sections.FRONT?.backFilm).toBe('8500_064');
   expect(summary.sections.PAINTING).not.toHaveProperty('faceColorcode');
   expect(summary.sections.PAINTING?.sidesColorcode).toBe('9010');
   expect(summary.sections.ASSEMBLING?.led).toBe(false);
   expect(summary.sections.ASSEMBLING).not.toHaveProperty('ledModule');
   expect(summary.sections.ASSEMBLING).not.toHaveProperty('psuModel');
   expect(summary.sections.ASSEMBLING).not.toHaveProperty('frameMaterial');
   expect(summary.sections.ASSEMBLING?.cablesLength).toBe('3m');
 });
 it('returns profiles in their persisted production order',()=>{
   const api=read('src/routes/api/draft-orders/[id]/+server.ts');
   const sort=api.indexOf(".sort((a: any, b: any) => (a.order_index ?? 0)");
   const map=api.indexOf(".map((p: any) => ({ ...p, dbId:",sort);
   expect(sort).toBeGreaterThan(0);
   expect(map).toBeGreaterThan(sort);
 });
 it('bounds user-entered notes and profile names in the assistant context',()=>{
   const summary=summarizeNativeProfileConfiguration({
     profileName:'A'.repeat(2000),ASSEMBLING:{notes:'n'.repeat(2000)},
     unknown:{notes:'uncontrolled'}
   });
   expect(summary.profileName?.length).toBe(120);
   expect(String(summary.sections.ASSEMBLING?.notes).length).toBe(160);
   expect(JSON.stringify(summary)).not.toContain('uncontrolled');
 });
 it('preserves all standard order fields and profile configuration when saving',()=>{
   const draft={clientName:'RF Client',deadline:'2026-11-20',
     profiles:[{quantity:2,configuration:{
       profileName:'Letter L',signType:'EXTERIOR',
       CNC_FREZER:{face:'ACRYLIC_XT'},BENDER:{sides:'ALU'},
       ASSEMBLING:{led:true}
     }}]};
   const value=orderFields.parse(draft);
   const saved=canonicalOrderProfiles(value.profiles);
   expect(saved[0].configuration).toEqual(draft.profiles[0].configuration);
   expect(saved[0].quantity1).toBe(2);
   // Historic R30 data remains opaque and is never silently stripped on save.
   const legacy={...draft,profiles:[{quantity:2,configuration:{
     ...draft.profiles[0].configuration,
     fabricationSpec:{version:1,width_mm:0}
   }}]};
   expect(orderFields.safeParse(legacy).success).toBe(true);
   expect(canonicalOrderProfiles(orderFields.parse(legacy).profiles)[0].configuration)
     .toHaveProperty('fabricationSpec');
 });
 it('does not mount the removed editor or its extra save restriction',()=>{
   const newly=read('src/routes/orders/new/+page.svelte');
   const editor=read('src/routes/orders/[id]/edit/+page.svelte');
   const schema=read('src/lib/server/order/draft-contract.ts');
   expect(newly).toContain('<Profile7stVisual');
   expect(newly).not.toContain('<ProfileFabricationSpec');
   expect(editor).not.toContain('<ProfileFabricationSpec');
   expect(newly).not.toContain('validateProfileFabrication');
   expect(editor).not.toContain('invalidSpecInputs');
   expect(schema).not.toContain('validateProfileFabrication');
   expect(schema).toContain('configuration: z.record(z.unknown()).optional()');
 });
 it('builds OpenRouter context server-side from the saved original form and file links',()=>{
   const api=read('src/routes/api/ai/order-assistant/+server.ts');
   expect(api).toContain('summarizeNativeProfileConfiguration(p.configuration)');
   expect(api).toContain('nativeProfile:');
   expect(api).toContain('linkedFileNames:');
   expect(api).toContain('fileContentsProvided:false');
   expect(api).toContain(".from('order_profiles')");
   expect(api).toContain(".from('order_files')");
   expect(api).toContain('canEditDraft(user.role');
   expect(api).toContain("if(!editable)throw error(403");
   expect(api).toContain('aiRateLimit(rateLimitIdentifier(event))');
   expect(api).not.toContain('fabricationSpec:specification.spec');
   expect(api).not.toContain('.update(');
   expect(api).not.toContain('.insert(');
 });
 it('has explicit file-analysis navigation without any background model calls',()=>{
   const editor=read('src/routes/orders/[id]/edit/+page.svelte');
   const assistant=read('src/lib/order/OrderFlowAssistant.svelte');
   const intake=read('src/routes/api/ai/order-intake/+server.ts');
   expect(editor).toContain("onclick={()=>openWorkspaceSection('intake')}");
   expect(editor).toContain('onOpenIntake={()=>openWorkspaceSection');
   expect(editor).toContain('askWorkflowHelp(');
   expect(assistant).toContain('onOpenIntake?:()=>void');
   expect(assistant).toContain('onOpenProfiles?:()=>void');
   expect(assistant).toContain('if(busy||!canAsk||!consent||!question.trim()');
   expect(intake).toContain('readOrderStoredFile');
   expect(intake).toContain("matchesOrderFileSignature");
   expect(intake).toContain('normalizeIntakeProposals');
 });
 it('opens the original full profile form safely from the narrow saved-order workspace',()=>{
   const editor=read('src/routes/orders/[id]/edit/+page.svelte');
   const wrapper=read('src/lib/order/OrderNativeProfileForm.svelte');
   expect(editor).toContain('OrderNativeProfileForm');
   expect(editor).toContain('openNativeProfile(idx)');
   expect(editor).toContain('nativeProfileDialog.showModal()');
   expect(editor).toContain('onChange={stageNativeProfile}');
   expect(editor).toContain('onclick={applyNativeProfile}');
   expect(editor).toContain('stagedNativeConfiguration=configuration;');
   expect(editor).toContain('clearNativeProfileDialog();');
   expect(editor).toContain('configuration={stagedNativeConfiguration??{}}');
   expect(wrapper).toContain('Profile7stVisual');
   expect(wrapper).toContain('readonly={!editable}');
   expect(wrapper).toContain('let localConfiguration=$state<any>');
   expect(wrapper).toContain('if(!editable||!value');
   expect(wrapper).not.toContain('onChange(localConfiguration)');
   // Closing the modal discards the isolated staged copy; only Apply modifies
   // the parent draft. Saving still goes through the existing versioned PUT.
   expect(editor.indexOf('profiles=profiles.map(',editor.indexOf('function applyNativeProfile')))
     .toBeGreaterThan(editor.indexOf('function applyNativeProfile'));
   expect(editor).toContain('expectedUpdatedAt: orderUpdatedAt');
   expect(editor).not.toContain('<ProfileFabricationSpec');
 });
 it('saves files and draft before entering the consent-gated OpenRouter assistant',()=>{
   const newly=read('src/routes/orders/new/+page.svelte');
   const editor=read('src/routes/orders/[id]/edit/+page.svelte');
   const assistant=read('src/lib/order/OrderFlowAssistant.svelte');
   const upload=newly.indexOf('if (failedUploads.length > 0)');
   const draftHandoff=newly.indexOf("if(destination==='assistant')");
   const review=newly.indexOf('const submitResponse = await fetch');
   expect(upload).toBeGreaterThan(0);
   expect(draftHandoff).toBeGreaterThan(upload);
   expect(review).toBeGreaterThan(draftHandoff);
   expect(newly.slice(draftHandoff,review)).toContain('return;');
   expect(newly).toContain("onclick={()=>void saveOrder('review')}");
   expect(newly).toContain("onclick={()=>void saveOrder('assistant')}");
   expect(newly).toContain('section=chat&assist=profiles');
   expect(newly).toContain("destination === 'review' && uploadedFiles.length === 0");
   expect(newly).not.toContain('if (!savedOrderId && uploadedFiles.length === 0)');
   expect(editor).toContain('orderAssistant.profileSpecificQuestion');
   expect(editor).toContain("query.get('assist')==='profiles'");
   expect(editor).toContain("askWorkflowHelp($t('orderAssistant.nativeProfileQuestion')");
   expect(assistant).toContain('!consent||!question.trim()');
 });
 it('translates contextual links in EN, RU and LV',()=>{
   for(const locale of ['en','ru','lv']){
     const copy=JSON.parse(read(`src/locales/${locale}.json`)).orderAssistant;
     for(const key of ['askAboutProfiles','nativeProfileQuestion','openProfiles',
       'openFileAnalysis','fileIntakeHint','saveAndAsk','saveAndAskHint',
       'editNativeProfile','viewNativeProfile','nativeProfileTitle',
       'nativeProfileSaveHint','closeNativeProfile','saveNativeProfile',
       'nativeProfileApplyHint','applyNativeProfile','askAboutThisProfile',
       'profileSpecificQuestion']){
       expect(typeof copy[key]).toBe('string');
       expect(copy[key].trim().length).toBeGreaterThan(0);
     }
   }
 });
});
