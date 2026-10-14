import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildOrderTechnicalChecks} from '../../src/lib/order/technical-evidence';
const read=(p:string)=>readFileSync(p,'utf8');

describe('OMS-R29 deterministic technical evidence and assistant integration',()=>{
 it('only calculates rectangular bounding face when both dimensions specify mm',()=>{
   const facts=buildOrderTechnicalChecks([
     {name:'Flat face',quantity1:2,configuration:{width_mm:1200,height_mm:500}},
     {name:'Second face',quantity1:3,configuration:{
       dimensions:{width:'300',height:400,unit:'mm'}
     }}
   ],[{material_type:'Aluminum sheet',quantity:2,unit:'m²'}],2);
   expect(facts).toMatchObject({
     kind:'deterministic-technical-evidence',
     primaryUnits:5,profileCount:2,materialCount:1,measuredProfiles:2,
     boundingFaceAreaM2:1.56,inventoryVerified:false,fileContentsVerified:false,
     feasibilityVerified:false,materialYieldEstimated:false
   });
   expect(facts.geometries[0]).toMatchObject({
     widthMm:1200,heightMm:500,quantity:2,boundingAreaM2:1.2,
     source:'width_mm/height_mm'
   });
   expect(facts.geometries[1]).toMatchObject({
     widthMm:300,heightMm:400,quantity:3,boundingAreaM2:0.36,
     source:'dimensions.mm'
   });
 });
 it('does not guess units or fabricate sheet yield from incomplete dimensions',()=>{
   const rows=[
     {name:'Text-only',quantity1:1,configuration:{width:1200,height:500}},
     {name:'Wrong unit',quantity1:1,configuration:{
       dimensions:{width:1200,height:500,unit:'cm'}}},
     {name:'Partial',quantity1:1,configuration:{width_mm:'1000 mm',height_mm:200}}
   ];
   const facts=buildOrderTechnicalChecks(rows,[],0);
   expect(facts.boundingFaceAreaM2).toBeNull();
   expect(facts.geometries).toHaveLength(0);
   expect(facts.issues.filter(x=>x.code==='DIMENSIONS_UNVERIFIED')).toHaveLength(3);
   expect(facts.issues.some(x=>x.code==='MATERIALS_UNSPECIFIED')).toBe(true);
 });
 it('shows unknown primary total if any profile quantity is zero or invalid',()=>{
   const facts=buildOrderTechnicalChecks([
     {name:'A',quantity1:1,configuration:{width_mm:500,height_mm:500}},
     {name:'B',quantity1:0,configuration:{width_mm:300,height_mm:300}}
   ],[],0);
   expect(facts.primaryUnits).toBeNull();
   expect(facts.boundingFaceAreaM2).toBeNull();
   expect(facts.issues.some(x=>x.code==='PROFILE_QUANTITY')).toBe(true);
   expect(facts.geometries).toHaveLength(1);
 });
 it('does not combine equal descriptions across unlike material units',()=>{
   const facts=buildOrderTechnicalChecks([],[
     {material_type:'STEEL',quantity:2,unit:'m'},
     {material_type:'steel',quantity:'50',unit:'cm'},
     {material_type:'steel',quantity:0,unit:'m'},
     {material_type:'PMMA',quantity:5,unit:''}
   ],1);
   expect(facts.issues.some(x=>x.code==='MATERIAL_MIXED_UNITS')).toBe(true);
   expect(facts.issues.filter(x=>x.code==='MATERIAL_QUANTITY')).toHaveLength(1);
   expect(facts.issues.filter(x=>x.code==='MATERIAL_UNIT')).toHaveLength(1);
   expect(facts.materialLines[0].quantity).toBe(2);
   expect(facts.materialLines[1].quantity).toBe(50);
   expect(facts.materialLines[2].quantity).toBeNull();
   expect(facts.inventoryVerified).toBe(false);
 });
 it('rejects truncated or otherwise invalid technical snapshots',()=>{
   expect(()=>buildOrderTechnicalChecks(
     Array.from({length:101},()=>({name:'A',quantity1:1,configuration:{}})),[],0)
   ).toThrow();
   expect(()=>buildOrderTechnicalChecks([],[],NaN)).toThrow();
   expect(()=>buildOrderTechnicalChecks([],[], -1)).toThrow();
   expect(()=>buildOrderTechnicalChecks([],[],0,{sourceLimitReached:true})
     .sourceLimitReached).toBe(true);
 });
 it('checks source order role/RLS before responding without any AI request',()=>{
   const api=read('src/routes/api/orders/[id]/technical-checks/+server.ts');
   expect(api).toContain("if(!actor)throw error(401");
   expect(api).toContain('canEditDraft(actor.role');
   expect(api).toContain('canEditConfirmedMetadata(actor.role)');
   expect(api).toContain("if(!allowed)throw error(403");
   expect(api).toContain(".from('draft_orders')");
   expect(api).toContain(".from('order_profiles')");
   expect(api).toContain(".from('order_materials')");
   expect(api).toContain(".from('profile_templates')");
   expect(api).toContain(".from('order_files')");
   expect(api).toContain("if(profiles.error||materials.error||files.error||files.count===null)");
   expect(api).toContain('buildOrderTechnicalChecks');
   expect(api).not.toContain('openRouterComplete');
   expect(api).not.toContain('.insert(');
   expect(api).not.toContain('.update(');
   expect(api).not.toContain('.delete(');
 });
 it('passes only bounded derived technical facts to OpenRouter as non-authoritative evidence',()=>{
   const api=read('src/routes/api/ai/order-assistant/+server.ts');
   expect(api).toContain('buildOrderTechnicalChecks');
   expect(api).toContain("configuration,notes");
   expect(api).toContain('bounding faces');
   expect(api).toContain('technicalEvidence');
   expect(api).toContain('technicalChecks:technical');
   expect(api).toContain('materialYieldEstimated:false');
   expect(api).toContain('fileContentsProvided:false');
   expect(api).not.toContain("technicalChecks:input.");
   expect(api).not.toContain('.update(');
 });
 it('shows checks separately with no consent or cloud request required for GET',()=>{
   const component=read('src/lib/order/OrderFlowAssistant.svelte');
   expect(component).toContain("method:'GET'");
   expect(component).toContain('/technical-checks');
   expect(component).toContain('technicalVersion');
   expect(component).toContain('materialYieldEstimated');
   expect(component).toContain('onClick').toBeUndefined();
 });
 it('translates all technical states and suggested questions across EN/RU/LV',()=>{
   const codes=['NO_PROFILES','PROFILE_QUANTITY','PROFILE_TEMPLATE',
     'DIMENSIONS_UNVERIFIED','MATERIALS_UNSPECIFIED','MATERIAL_QUANTITY',
     'MATERIAL_UNIT','MATERIAL_MIXED_UNITS','STOCK_UNVERIFIED','FILES_UNVERIFIED'];
   for(const lang of ['en','ru','lv']){
     const labels=JSON.parse(read(`src/locales/${lang}.json`)).orderAssistant;
     expect(labels.technicalTitle).toBeTruthy();
     expect(labels.boundingCaveat.length).toBeGreaterThan(70);
     expect(labels.suggest.dimensions).toBeTruthy();
     expect(labels.suggest.fabrication).toBeTruthy();
     expect(labels.suggest.technical).toBeTruthy();
     for(const code of codes)expect(labels.technicalIssue[code]).toBeTruthy();
   }
 });
});
