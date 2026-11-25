import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import workshop from '../../supabase/catalogs/workshop-aluminium-2026-10-31.json';
import { applyProductionFacts, reviewProductionFacts, recheckProductionSelection } from '../../src/lib/order/production-intake';
import { getMaterialCatalogView } from '../../src/lib/profiles/material-catalog';
import { applyProfileMaterialSelection } from '../../src/lib/profiles/face-materials';
import { paintMaterialValue } from '../../src/lib/profiles/helpers';

const sheet = { ...workshop.products[0], id: 1 };
const flat = { ...sheet, id: 2, code: 'FLAT_BAR', metadata: { product_form: 'flat bar' } };
const composite = { ...sheet, id: 3, code: 'ACM', category: 'ALU_COMPOSITE', metadata: { product_form: 'composite' } };
const paint = { id: 4, category: 'PAINT_RAL', code: 'RAL_9010', name_en: 'RAL 9010 Pure white', metadata: { ralCode: '9010', hex: '#F1ECE1' } };
const pantone = { ...paint, id: 5, category: 'PAINT_PANTONE', code: '9010', metadata: { hex: '#112233' } };
const catalog = [flat, composite, pantone, sheet, paint];
const fact = (target: string, value: string) => ({ target, value, evidence: 'Back ALU 3 mm, paint 9010', part: 'Logo', page: 2, confidence: 'high' });

describe('production shorthand across review, application and manual search', () => {
  it('resolves ALU, its multilingual sheet names and RAL variants to actual role-compatible IDs', () => {
    for (const value of ['ALU', 'Aluminum', 'aluminium sheets', 'Aluminija loksne', 'Алюминиевый лист']) {
      for (const target of ['faceMaterial', 'backMaterial', 'sidesMaterial']) {
        const [review] = reviewProductionFacts([fact(target, value)], catalog);
        assert.equal(review.material?.id, sheet.id);
        assert.equal(review.reason, 'workshop-match');
        assert.equal(review.value, value);
      }
    }
    const values = ['9010', 'ral9010', 'RAL-9010', 'RAL_9010', 'RAL 9010'];
    const reviews = reviewProductionFacts(values.map(value => fact('backPaint', value)), catalog);
    assert.deepEqual(reviews.map(row => row.material?.id), values.map(() => paint.id));
    assert.deepEqual(recheckProductionSelection(reviews, catalog), reviews);
    assert.equal(getMaterialCatalogView([paint], '', 'RAL9010').groups[0].materials[0].id, paint.id);
  });

  it('keeps unsupported forms, finishes, general electrical specs and missing catalog entries unresolved', () => {
    for (const [target, value] of [['frameMaterial','ALU'],['backMaterial','ALU 6061-T6'],['backMaterial','ACP 4mm'],
      ['backPaint','9010 matte'],['faceFilm','RAL9010'],['ledModule','6500K'],['backPaint','RAL 9999']]) {
      assert.equal(reviewProductionFacts([fact(target,value)],catalog)[0].status,'unresolved');
    }
    assert.equal(reviewProductionFacts([fact('facePaint','9010')],[pantone])[0].material,null);
    assert.equal(reviewProductionFacts([fact('facePaint','9010')],null)[0].reason,'catalog-unavailable');
  });

  it('resolves an explicit finish from catalog metadata and preserves the identity of a competing finish', () => {
    const gloss = {...paint, metadata:{...paint.metadata, finish:'gloss'}};
    const matt = {...paint, id:7, code:'RAL_9010_MATT', metadata:{hex:'#F1ECE1', finish:'matt'}};
    const finishes = [gloss, matt];
    for (const value of ['RAL 9010 matt', '9010 matte', '9010 матовый', '9010 matēts']) {
      const [review] = reviewProductionFacts([fact('backPaint', value)], finishes);
      assert.equal(review.material?.id, matt.id);
    }
    const [review] = reviewProductionFacts([fact('backPaint','9010')], finishes);
    assert.equal(review.reason, 'ambiguous-match');
    assert.equal(reviewProductionFacts([fact('backPaint','9010 satin')], finishes)[0].material, null);
    const current = [{ configuration: {PAINTING:{backMaterialId:gloss.id}} }];
    const choice = reviewProductionFacts([fact('backPaint','9010 matte')], finishes);
    assert.throws(()=>applyProductionFacts(current,current,0,choice,false,finishes),/replaceRequired/);
  });

  it('applies matched stock, its allowed thickness, and the actual catalog paint to native fields', () => {
    const reviews = reviewProductionFacts([fact('backMaterial','ALU'),fact('backMaterial','aluminium sheet'),
      fact('backThickness','3 mm'),fact('backPaint','9010')], catalog);
    const current = [{ configuration: { CNC_FREZER: {back:sheet.name_en, backThickness:'3mm'}, PAINTING:{} } }];
    const [profile] = applyProductionFacts<Record<string,any>>(current,current,0,reviews,false,catalog);
    assert.equal(profile.configuration.CNC_FREZER.backMaterialId,sheet.id);
    assert.equal(profile.configuration.CNC_FREZER.backThickness,'3mm');
    assert.deepEqual(profile.configuration.PAINTING.backColor,{system:'RAL',code:'9010',hex:paint.metadata.hex});
    assert.equal(profile.configuration.PAINTING.backMaterialId,paint.id);
    assert.equal(current[0].configuration.CNC_FREZER.back,sheet.name_en);
    const variant = {...paint, code:'SUPPLIER_WHITE_GLOSS'};
    const [choice] = reviewProductionFacts([fact('backPaint','9010')],[variant]);
    const [tinted] = applyProductionFacts<Record<string,any>>(current,current,0,[choice],false,[variant]);
    assert.equal(paintMaterialValue(tinted.configuration.PAINTING.backColor),variant.code);
  });

  it('uses evidenced gauges to distinguish sheet products and keeps thickness separately approvable', () => {
    const thin = {...sheet,id:11,thickness_options:[0.5,1.5]};
    const thick = {...sheet,id:12,thickness_options:[3,5]};
    const stock = [thin,thick];
    const current = [{configuration:{}}];
    for (const value of ['ALU 1,5 mm', '1.5mm aluminium sheet', 'алюминий 1,5 мм']) {
      const reviews = reviewProductionFacts([fact('backMaterial',value)],stock);
      assert.deepEqual(reviews.map(r=>[r.target,r.status]),[['backMaterial','ready'],['backThickness','ready']]);
      assert.equal(reviews[0].value,value);
      assert.equal(reviews[0].material?.id,thin.id);
      assert.equal(reviews[1].evidence,reviews[0].evidence);
      assert.deepEqual(getMaterialCatalogView(stock,'',value).groups[0].materials,[thin]);
      const [profile] = applyProductionFacts<Record<string,any>>(current,current,0,recheckProductionSelection(reviews,stock),false,stock);
      assert.equal(profile.configuration.CNC_FREZER.backThickness,'1.5mm');
    }
    const reviews = reviewProductionFacts([fact('backMaterial','ALU'),fact('backThickness','0.3 cm')],stock);
    const selected = recheckProductionSelection([reviews[0]],stock,reviews);
    assert.equal(selected[0].material?.id,thick.id);
    const [profile] = applyProductionFacts<Record<string,any>>(current,current,0,selected,false,stock);
    assert.equal(profile.configuration.CNC_FREZER.backThickness,'');
    const legacy = [{configuration:{CNC_FREZER:{back:thick.name_en,backMaterialId:thick.id,backThickness:'3'}}}];
    const [same] = applyProductionFacts(legacy,legacy,0,reviews,false,stock);
    assert.equal(same.configuration.CNC_FREZER.backThickness,'3');
    assert.throws(()=>recheckProductionSelection([reviews[0]],[...stock,{...thick,id:13}],reviews),/catalogChanged/);
  });

  it('keeps competing stock and contradictory dimensions visible and never borrows a gauge from another part', () => {
    const thin = {...sheet,id:11,thickness_options:[1.5,3]};
    const thick = {...sheet,id:12,thickness_options:[3,5]};
    const stock = [thin,thick];
    const combined = fact('backMaterial','ALU 3 mm');
    const both = reviewProductionFacts([combined,fact('backThickness','0.3 cm')],stock);
    assert.equal(both.length,2);
    assert.deepEqual(both[0].alternatives?.map(m=>m.id),[11,12]);
    assert.equal(reviewProductionFacts([fact('backMaterial','ALU 6 mm')],stock)[0].reason,'stock-thickness-unavailable');
    const conflict = reviewProductionFacts([combined,fact('backThickness','5 mm')],stock);
    assert.ok(conflict.every(r=>r.reason==='conflicting-values'));
    for (const unrelated of [{part:'Other'},{page:1},{target:'sidesThickness'}]) {
      assert.equal(reviewProductionFacts([fact('backMaterial','ALU'),{...fact('backThickness','5 mm'),...unrelated}],stock)[0].reason,'ambiguous-match');
    }
    for (const value of ['ALU -3 mm','ALU 1–3 mm','ALU 1500 × 3000 mm','ALU 3','ALU 6061 3 mm']) {
      const reviews = reviewProductionFacts([fact('backMaterial',value)],stock);
      assert.equal(reviews.length,1);assert.equal(reviews[0].status,'unresolved');
    }
  });

  it('updates identity on a manual change and protects existing drafts with a stale material ID', () => {
    const old = {id:'face-1', value:'Old material', materialId:99};
    const chosen = applyProfileMaterialSelection(old,{value:sheet.name_en,material:sheet,hex:''});
    assert.equal(chosen.materialId,sheet.id);
    assert.equal(applyProfileMaterialSelection(chosen,{value:'Custom',material:null,hex:''}).materialId,undefined);
    const current = [{configuration:{CNC_FREZER:{back:'Different material',backMaterialId:sheet.id}}}];
    const review = reviewProductionFacts([fact('backMaterial','ALU')], catalog);
    assert.throws(()=>applyProductionFacts(current,current,0,review,false,catalog),/replaceRequired/);
  });

  it('offers competing sheets and finishes for staff choice and rejects a newly ambiguous catalog on apply', () => {
    const other = {...sheet,id:6,code:'OTHER_SHEET'};
    const matte = {...paint,id:7,code:'WHITE_MATTE'};
    const reviews=reviewProductionFacts([fact('backPaint','RAL 9010'),fact('backPaint','9010'),fact('backMaterial','ALU')],
      [...catalog,other,matte]);
    assert.deepEqual(reviews.map(r=>r.reason), ['ambiguous-match','ambiguous-match','ambiguous-match']);
    assert.deepEqual(reviews[0].alternatives?.map(m=>m.id),[paint.id,matte.id]);
    assert.deepEqual(reviews[2].alternatives?.map(m=>m.id),[sheet.id,other.id]);
    const ready = reviewProductionFacts([fact('backMaterial','ALU')],catalog);
    assert.throws(()=>recheckProductionSelection(ready,[...catalog,other]),/catalogChanged/);
  });
});
