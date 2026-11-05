import {describe,it,expect} from 'vitest';
import {productionFactSchema, reviewProductionFacts, applyProductionFacts,
  resolveIntakePdfEngine} from '../../src/lib/order/production-intake';

const fact=(target:string,value:string,extra:Record<string,unknown>={})=>({
  target,value,evidence:value,page:1,part:null,confidence:'high',...extra
});
const catalog=[
  {id:'11111111-1111-4111-8111-111111111111',code:'PLEXI_BLUE_5N870',category:'ACRYLIC_XT',name_en:'PLEXIGLAS XT BLUE 5N870',thickness_options:[3],metadata:{model:'5N870'}},
  {id:'22222222-2222-4222-8222-222222222222',code:'ORACAL_8500_070',category:'VINYL_ORACAL',name_en:'Oracal 8500-070 black',metadata:{}},
  {id:'33333333-3333-4333-8333-333333333333',code:'MW_XLG_100_12',category:'PSU_MEANWELL',name_en:'MEAN WELL XLG-100-12',metadata:{model:'XLG-100-12'}},
  {id:'44444444-4444-4444-8444-444444444444',code:'LED_6500',category:'LED_MODULE',name_en:'Brand module',metadata:{cct_kelvin:6500}}
];
describe('reviewed production intake',()=>{
  it('rejects invented target paths and model-supplied IDs',()=>{
    expect(productionFactSchema.safeParse(fact('status','CONFIRMED')).success).toBe(false);
    expect(productionFactSchema.safeParse(fact('faceMaterial','5N870',{materialId:catalog[0].id})).success).toBe(false);
  });
  it('resolves exact real IDs with role constraints, never generic specifications',()=>{
    const reviewed=reviewProductionFacts([
      fact('faceMaterial','5N870'),fact('faceFilm','Oracal 8500-070 black'),
      fact('psuModel','XLG-100-12'),fact('ledModule','6500K'),
      fact('backMaterial','Oracal 8500-070 black'),fact('cableType','230V black 3m')
    ],catalog);
    expect(reviewed[0].material?.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(reviewed.map(r=>r.status)).toEqual(['ready','ready','ready','unresolved','unresolved','unresolved']);
  });
  it('refuses ambiguous identities, duplicate conflicts, ranges and unitless dimensions',()=>{
    const rows=reviewProductionFacts([
      fact('faceMaterial','5N870'),fact('depth','60 mm'),fact('depth','80 mm'),
      fact('width','2920'),fact('height','60–80 mm'),fact('quantity','4 pcs')
    ],[...catalog,{...catalog[0],id:'55555555-5555-4555-8555-555555555555'}]);
    expect(rows.map(r=>r.status)).toEqual(['unresolved','unresolved','unresolved','unresolved','unresolved','ready']);
  });
  it('maps units, material codes and catalog IDs into the real native form',()=>{
    const profiles:Array<Record<string,any>>=[{dbId:'p1',configuration:{CNC_FREZER:{notes:'Keep this'},BENDER:{},ASSEMBLING:{}}}];
    const rows=reviewProductionFacts([
      fact('faceMaterial','5N870'),fact('faceThickness','3 mm'),fact('depth','5 cm'),
      fact('width','2.92 m'),fact('cableLength','300 cm'),fact('psuModel','XLG-100-12'),
      fact('ledSpec','6500K'),fact('quantity','4 pcs')
    ],catalog);
    const next=applyProductionFacts(profiles,profiles,0,rows,false);
    expect(next[0].quantity).toBe(4);
    expect(next[0].configuration.CNC_FREZER.face).toBe('PLEXI_BLUE_5N870');
    expect(next[0].configuration.CNC_FREZER.faceMaterials[0].materialId).toBe(catalog[0].id);
    expect(next[0].configuration.CNC_FREZER.faceMaterials[0].thickness).toBe('3mm');
    expect(next[0].configuration.CNC_FREZER.notes).toContain('Keep this');
    expect(next[0].configuration.CNC_FREZER.notes).toContain('2920mm');
    expect(next[0].configuration.BENDER.depth).toBe(50);
    expect(next[0].configuration.ASSEMBLING.cablesLength).toBe('3m');
    expect(next[0].configuration.ASSEMBLING.psuModel).toBe('MW_XLG_100_12');
    expect(next[0].configuration.ASSEMBLING.notes).toContain('6500K');
    expect(profiles[0].configuration.CNC_FREZER).toEqual({notes:'Keep this'});
  });
  it('blocks stale local edits, unreviewed matches and replacement without acknowledgment',()=>{
    const profiles:Array<Record<string,any>>=[{configuration:{BENDER:{depth:100}}}];
    const rows=reviewProductionFacts([fact('depth','60 mm')],catalog);
    expect(()=>applyProductionFacts(profiles,profiles,0,rows,false)).toThrow();
    expect(applyProductionFacts(profiles,profiles,0,rows,true)[0].configuration.BENDER.depth).toBe(60);
    expect(()=>applyProductionFacts([{configuration:{BENDER:{depth:90}}}],profiles,0,rows,true)).toThrow();
    expect(()=>applyProductionFacts(profiles,profiles,1,rows,true)).toThrow();
    expect(()=>applyProductionFacts(profiles,profiles,0,reviewProductionFacts([fact('psuModel','Regular')],catalog),true)).toThrow();
  });
  it('does not turn unsupported thickness or DC cable into a native mains choice',()=>{
    const profiles:Array<Record<string,any>>=[{configuration:{CNC_FREZER:{},ASSEMBLING:{cables:false}}}];
    const rows=reviewProductionFacts([fact('faceMaterial','5N870'),fact('faceThickness','8 mm')],catalog);
    expect(()=>applyProductionFacts(profiles,profiles,0,rows,false)).toThrow();
    const next=applyProductionFacts(profiles,profiles,0,reviewProductionFacts([fact('cableSpec','12V 2m each letter')],catalog),false);
    expect(next[0].configuration.ASSEMBLING.cables).toBe(false);
    expect(next[0].configuration.ASSEMBLING.cableType).toBe(undefined);
    expect(next[0].configuration.ASSEMBLING.notes).toContain('12V 2m each letter');
  });
  it('requires explicit native model configuration and never silently enables paid OCR',()=>{
    expect(resolveIntakePdfEngine(false,false,false,'')).toBe('cloudflare-ai');
    expect(resolveIntakePdfEngine(false,true,false,'provider/pdf-model')).toBe('native');
    expect(()=>resolveIntakePdfEngine(false,true,false,'')).toThrow();
    expect(()=>resolveIntakePdfEngine(true,false,false,'')).toThrow();
    expect(resolveIntakePdfEngine(true,false,true,'')).toBe('mistral-ocr');
  });
});

describe('native editor save compatibility',()=>{
 it('updates the native quantity read by Save Draft',()=>{
  const current:Array<Record<string,any>>=[{quantity:1,configuration:{}}];
  const rows=reviewProductionFacts([fact('quantity','4 pcs')],catalog);
  const next=applyProductionFacts(current,current,0,rows,true);
  expect(next[0].quantity).toBe(4);
 });
});

describe('preservation and color review',()=>{
 it('retains explicit thickness when a matching face material is re-applied',()=>{
  const current:Array<Record<string,any>>=[{configuration:{CNC_FREZER:{faceMaterials:[{
   id:'face-1',value:'PLEXI_BLUE_5N870',thickness:'3mm',category:'ACRYLIC_XT',thicknessOptions:[3]
  }]}}}];
  const next=applyProductionFacts(current,current,0,reviewProductionFacts([fact('faceMaterial','5N870')],catalog),false);
  expect(next[0].configuration.CNC_FREZER.faceMaterials[0].thickness).toBe('3mm');
 });
 it('maps a verified catalog paint through the native paint contract',()=>{
  const paint={id:'55555555-5555-4555-8555-555555555555',code:'RAL_6016',category:'PAINT_RAL',name_en:'RAL 6016',metadata:{hex:'#24693D'}};
  const current:Array<Record<string,any>>=[{configuration:{}}];
  const next=applyProductionFacts(current,current,0,reviewProductionFacts([fact('sidesPaint','RAL 6016')],[paint]),false);
  expect(next[0].configuration.PAINTING.sidesColor).toEqual({system:'RAL',code:'6016',hex:'#24693D'});
 });
});

describe('reactive form state',()=>{
 it('copies a reactive proxy through its persisted JSON contract',()=>{
  const current=new Proxy([{configuration:{BENDER:{depth:100}}}],{});
  const result=applyProductionFacts(current,JSON.parse(JSON.stringify(current)),0,
   reviewProductionFacts([fact('depth','60 mm')],catalog),true);
  expect(result[0].configuration.BENDER.depth).toBe(60);
  expect(current[0].configuration.BENDER.depth).toBe(100);
 });
});

describe('switching fabrication processes',()=>{
 it('clears old 3D-print markers when reviewed sheet materials replace printed parts',()=>{
  const current:Array<Record<string,any>>=[{configuration:{CNC_FREZER:{
   faceMaterials:[{id:'f1',value:'OLD_FDM',category:'FDM_ASA',process:'3D_PRINT'}],
   back:'OLD_RESIN',backCategory:'RESIN_OTHER',backProcess:'3D_PRINT'
  }}}];
  const rows=reviewProductionFacts([fact('faceMaterial','5N870'),fact('backMaterial','5N870')],catalog);
  const next=applyProductionFacts(current,current,0,rows,true);
  expect(next[0].configuration.CNC_FREZER.faceMaterials[0].process).toBe(undefined);
  expect(next[0].configuration.CNC_FREZER.backProcess).toBe(undefined);
 });
});

import {findOrderIntakeConflicts} from '../../src/lib/order/production-intake';
describe('conflicting order facts',()=>{
 it('keeps alternative deadlines visible instead of silently selecting the first',()=>{
  const alternatives=[{field:'deadline',value:'2026-11-19',evidence:'Nov 19 ACE',confidence:'low'},
   {field:'deadline',value:'2026-11-27',evidence:'DELIVERY Nov 27 2026',confidence:'high'},
   {field:'title',value:'Sign',evidence:'Sign drawing',confidence:'high'}];
  expect(findOrderIntakeConflicts(alternatives as any).map(c=>c.field)).toEqual(['deadline']);
  expect(findOrderIntakeConflicts(alternatives as any)[0].alternatives.map(p=>p.value)).toEqual(['2026-11-19','2026-11-27']);
 });
});

describe('dependent material choices',()=>{
 it('rechecks the selected current material for a thickness-only change',()=>{
  const current:Array<Record<string,any>>=[{configuration:{CNC_FREZER:{faceMaterials:[{
   id:'f1',value:'PLEXI_BLUE_5N870',materialId:catalog[0].id,category:'ACRYLIC_XT',thicknessOptions:[3]
  }]}}}];
  const rows=reviewProductionFacts([fact('faceThickness','3 mm')],catalog);
  expect(()=>applyProductionFacts(current,current,0,rows,true,[{...catalog[0],thickness_options:[5]}])).toThrow();
  expect(()=>applyProductionFacts(current,current,0,rows,true,[])).toThrow();
  expect(applyProductionFacts(current,current,0,rows,true,catalog)[0].configuration.CNC_FREZER.faceMaterials[0].thickness).toBe('3mm');
 });
 it('does not revive an inactive film when approving no printing',()=>{
  const current:Array<Record<string,any>>=[{configuration:{FRONT:{face:false,faceFilm:'OLD_FILM',facePrint:false}}}];
  const next=applyProductionFacts(current,current,0,reviewProductionFacts([fact('facePrint','false')],catalog),true);
  expect(next[0].configuration.FRONT.face).toBe(false);
 });
});
