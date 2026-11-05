import {describe,it,expect} from 'vitest';
import {reviewProductionFacts,resolveManualProductionMaterial,recheckProductionSelection,
 getProductionMaterialPicker,productionIntakeErrorKey} from '../../src/lib/order/production-intake';
const acrylic={id:'11111111-1111-4111-8111-111111111111',code:'OPAL_XT',name_en:'Opal acrylic',category:'ACRYLIC_XT',thickness_options:[3],metadata:{}};
const psu={...acrylic,id:'22222222-2222-4222-8222-222222222222',code:'PSU12',category:'PSU_MEANWELL'};
const raw=(target:string,value:string)=>({target,value,evidence:value,page:1,part:null,confidence:'low'});
describe('staff material decisions during source review',()=>{
 it('resolves a generic source only through an explicit actual role-compatible catalog ID',()=>{
  const source=reviewProductionFacts([raw('faceMaterial','OPAL')],[])[0];
  const chosen=resolveManualProductionMaterial(source,[acrylic,psu],acrylic.id);
  expect(chosen.status).toBe('ready');expect(chosen.reason).toBe('manual-selection');
  expect(chosen.value).toBe('OPAL');expect(chosen.evidence).toBe('OPAL');
  expect(chosen.confidence).toBe('low');expect(chosen.material?.id).toBe(acrylic.id);
  expect(()=>resolveManualProductionMaterial(source,[acrylic,psu],psu.id)).toThrow();
  expect(()=>resolveManualProductionMaterial(source,[acrylic],'invented')).toThrow();
 });
 it('never turns dimensional or multipart source conflicts into catalog decisions',()=>{
  expect(getProductionMaterialPicker('depth')).toBe(null);
  expect(getProductionMaterialPicker('faceFilm')?.categories).toEqual(['VINYL_ORACAL']);
  const conflicts=reviewProductionFacts([raw('faceMaterial','OPAL'),raw('faceMaterial','CLEAR')],[]);
  expect(()=>resolveManualProductionMaterial(conflicts[0],[acrylic],acrylic.id)).toThrow();
 });
 it('rechecks a deliberate selection by identity and rejects removed or unsuitable products',()=>{
  const source=reviewProductionFacts([raw('faceMaterial','OPAL')],[])[0];
  const chosen=resolveManualProductionMaterial(source,[acrylic],acrylic.id);
  expect(recheckProductionSelection([chosen],[acrylic])[0].material?.id).toBe(acrylic.id);
  expect(()=>recheckProductionSelection([chosen],[])).toThrow();
  expect(()=>recheckProductionSelection([chosen],[{...acrylic,category:'PSU_MEANWELL'}])).toThrow();
  expect(()=>recheckProductionSelection([chosen],[{...acrylic,thickness_options:[5]}])).toThrow();
 });
 it('maps typed production failures to translatable recovery text',()=>{
  expect(productionIntakeErrorKey(new Error('unexpected'))).toBe('applyError');
 });
});

import {applyProductionFacts} from '../../src/lib/order/production-intake';
describe('native picker compatibility',()=>{
 it('resolves the name values emitted by native material pickers for thickness-only choices',()=>{
  const current:Array<Record<string,any>>=[{configuration:{CNC_FREZER:{back:acrylic.name_en,backThicknessOptions:[3]}}}];
  const selected=reviewProductionFacts([raw('backThickness','3 mm')],[acrylic]);
  const result=applyProductionFacts(current,current,0,selected,false,[acrylic]);
  expect(result[0].configuration.CNC_FREZER.backThickness).toBe('3mm');
 });
});

describe('multiple manual decisions for one native field',()=>{
 it('rejects different products for the same field rather than silently keeping the last choice',()=>{
  const second={...acrylic,id:'33333333-3333-4333-8333-333333333333',code:'SECOND_XT',name_en:'Second acrylic'};
  const source=reviewProductionFacts([raw('faceMaterial','Generic opal'),{...raw('faceMaterial','Generic opal'),part:'Other part'}],[]);
  const selected=[resolveManualProductionMaterial(source[0],[acrylic,second],acrylic.id),resolveManualProductionMaterial(source[1],[acrylic,second],second.id)];
  expect(()=>recheckProductionSelection(selected,[acrylic,second])).toThrow();
  const current:Array<Record<string,any>>=[{configuration:{CNC_FREZER:{}}}];
  expect(()=>applyProductionFacts(current,current,0,selected,true,[acrylic,second])).toThrow();
  expect(current[0].configuration.CNC_FREZER).toEqual({});
 });
});
