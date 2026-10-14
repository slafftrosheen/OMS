import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parseFabricationSpec,updateFabricationSpec,validateProfileFabrication}
  from '../../src/lib/order/fabrication-spec';
import {buildOrderTechnicalChecks} from '../../src/lib/order/technical-evidence';
import {orderFields,canonicalOrderProfiles}
  from '../../src/lib/server/order/draft-contract';
const read=(path:string)=>readFileSync(path,'utf8');
const good={version:1 as const,width_mm:1200,height_mm:500,depth_mm:80,
  thickness_mm:3,method:'cnc-router' as const,illumination:'halo' as const,
  mounting:'frame' as const,exposure:'exterior' as const,
  material_note:'Aluminium sheet grade to be verified',
  finish_note:'RAL sample approval pending',
  installation_note:'Check structural fixings on site'};
const envelope=(spec:unknown)=>({clientName:'RF',deadline:'2026-11-20',
  profiles:[{quantity:2,configuration:{profileName:'Letter L',fabricationSpec:spec}}]});
describe('OMS-R30 versioned fabrication specifications',()=>{
 it('accepts mm dimensions, bounded fabrication choices and human notes',()=>{
   const parsed=parseFabricationSpec(good);
   expect(parsed.issues).toEqual([]);
   expect(parsed.spec).toEqual(good);
   expect(validateProfileFabrication({fabricationSpec:good})).toEqual([]);
   expect(orderFields.safeParse(envelope(good)).success).toBe(true);
   expect(canonicalOrderProfiles(orderFields.parse(envelope(good)).profiles)[0].configuration)
     .toHaveProperty('fabricationSpec',good);
 });
 it('requires explicit positive numeric units and rejects invalid enums/unknown keys',()=>{
   for(const bad of [
     {...good,width_mm:0},{...good,height_mm:-1},
     {...good,width_mm:'1200 mm'},{...good,width_mm:100001},
     {...good,depth_mm:10001},{...good,thickness_mm:1001},
     {...good,method:'CNC'},{...good,exposure:'marine'},
     {...good,mounting:'roof'}, {...good,version:2},
     {...good,extra:'hidden'}]){
     expect(parseFabricationSpec(bad).issues.some(x=>x.type==='invalid')).toBe(true);
     expect(orderFields.safeParse(envelope(bad)).success).toBe(false);
   }
 });
 it('allows incomplete drafts but never computes an incomplete face area',()=>{
   const half={version:1,width_mm:1200};
   expect(parseFabricationSpec(half).issues.some(i=>i.type==='incomplete')).toBe(true);
   expect(orderFields.safeParse(envelope(half)).success).toBe(true);
   const facts=buildOrderTechnicalChecks([
     {name:'L',quantity1:2,configuration:{fabricationSpec:half}}
   ],[],0);
   expect(facts.boundingFaceAreaM2).toBeNull();
   expect(facts.issues.some(i=>i.code==='DIMENSIONS_UNVERIFIED')).toBe(true);
 });
 it('uses the structured specification with priority over contradictory legacy values',()=>{
   const facts=buildOrderTechnicalChecks([
     {name:'L',quantity1:2,configuration:{width_mm:10000,height_mm:20000,fabricationSpec:good}}
   ],[],0);
   expect(facts.boundingFaceAreaM2).toBe(1.2);
   expect(facts.geometries[0].source).toBe('fabricationSpec.mm');
   const partial=buildOrderTechnicalChecks([
     {name:'L',quantity1:2,configuration:{width_mm:10000,height_mm:20000,
       fabricationSpec:{version:1,width_mm:1200}}}
   ],[],0);
   expect(partial.boundingFaceAreaM2).toBeNull();
 });
 it('preserves legacy configs when the structured spec is absent',()=>{
   const legacy=buildOrderTechnicalChecks([
     {name:'Legacy',quantity1:2,configuration:{width_mm:1200,height_mm:500}}
   ],[],0);
   expect(legacy.boundingFaceAreaM2).toBe(1.2);
   expect(legacy.geometries[0].source).toBe('width_mm/height_mm');
   expect(parseFabricationSpec(undefined)).toEqual({spec:null,issues:[]});
 });
 it('updates only explicit fields without silently inferring mm or unrelated config',()=>{
   const withWidth=updateFabricationSpec(null,'width_mm','1200');
   expect(withWidth).toEqual({version:1,width_mm:1200});
   const complete=updateFabricationSpec(withWidth,'height_mm','500');
   expect(complete).toEqual({version:1,width_mm:1200,height_mm:500});
   expect(updateFabricationSpec(complete,'height_mm','')).toEqual({version:1,width_mm:1200});
   expect(()=>updateFabricationSpec(complete,'width_mm','-20')).toThrow();
   expect(()=>updateFabricationSpec(complete,'thickness_mm','0')).toThrow();
   expect(()=>updateFabricationSpec(complete,'method','unverified')).toThrow();
   expect(updateFabricationSpec(complete,'method','laser').method).toBe('laser');
 });
 it('has the same form widget for new orders and existing drafts',()=>{
   const newly=read('src/routes/orders/new/+page.svelte');
   const saved=read('src/routes/orders/[id]/edit/+page.svelte');
   const ui=read('src/lib/order/ProfileFabricationSpec.svelte');
   expect(newly).toContain('<ProfileFabricationSpec');
   expect(saved).toContain('<ProfileFabricationSpec');
   expect(newly).toContain('validateProfileFabrication(p.configuration)');
   expect(saved).toContain('validateProfileFabrication(p.configuration??{})');
   expect(saved).toContain('readonly={!canEdit}');
   expect(ui).toContain('updateFabricationSpec(value,key,next)');
   expect(ui).toContain("clearSpec()");
 });
 it('preserves existing atomic, version-protected persistence paths',()=>{
   const server=read('src/lib/server/order/draft-contract.ts');
   const draftApi=read('src/routes/api/draft-orders/[id]/+server.ts');
   expect(server).toContain('validateProfileFabrication(configuration)');
   expect(server).toContain("p.configuration ?? {}");
   expect(draftApi).toContain('canonicalOrderProfiles(parsed.data.profiles)');
   expect(draftApi).toContain('p_expected_updated_at: versioned.expectedUpdatedAt');
   const profileVisual=read('src/lib/profiles/components/Profile7stVisual.svelte');
   expect(profileVisual).toContain('...currentConfig');
 });
 it('lets OpenRouter discuss validated choices but never execute them',()=>{
   const assistant=read('src/routes/api/ai/order-assistant/+server.ts');
   expect(assistant).toContain('parseFabricationSpec');
   expect(assistant).toContain('fabricationSpec:specification.spec');
   expect(assistant).toContain('fabricationSpec records a human PROPOSAL');
   expect(assistant).not.toContain('executeFabSpec');
   expect(assistant).not.toContain("machine.start");
 });
 it('has English Latvian and Russian text for all choices and inputs',()=>{
   const keys=['width_mm','height_mm','depth_mm','thickness_mm','method',
     'illumination','mounting','exposure','material_note','finish_note','installation_note'];
   const enums={
     method:['unspecified','laser','cnc-router','bending','hand','other'],
     illumination:['unspecified','none','front','halo','edge','other'],
     mounting:['unspecified','wall','frame','suspended','freestanding','other'],
     exposure:['unspecified','interior','exterior','sheltered']
   };
   for(const lang of ['en','lv','ru']){
     const copy=JSON.parse(read(`src/locales/${lang}.json`)).fabricationSpec;
     expect(copy.invalidSave).toBeTruthy();
     expect(copy.areaDisclaimer).toBeTruthy();
     for(const field of keys)expect(copy.field[field]).toBeTruthy();
     for(const [key,choices] of Object.entries(enums))
       for(const choice of choices)expect(copy.choice[key][choice]).toBeTruthy();
   }
 });
});
