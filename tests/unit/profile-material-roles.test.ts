import { describe, expect, it } from 'vitest';
import { buildMaterialCatalogUrl, getMaterialCatalogView, type CatalogMaterial } from '../../src/lib/profiles/material-catalog';
import { filterProfileMaterials, getAluminiumForm, PROFILE_MATERIAL_CATEGORIES, isProfilePrintMaterial } from '../../src/lib/profiles/material-roles';
import { normalizeMaterialType } from '../../src/lib/materials/thickness-options';

function material(code: string, category: string, metadata: Record<string, unknown> = {}, name = code): CatalogMaterial {
  return { id: 1, code, category, name_en: name, metadata };
}

describe('draft profile material roles', () => {
  const sheet = material('WORKSHOP_ALU_SHEET_1500X3000', 'ALU_SHEET', { type: 'sheet', standardSize: '1500x3000mm' });
  const flat = material('ALU_FLAT_20X3', 'ALU_SHEET', { type: 'flat', dimensions: '20mm', wall: '3mm' });
  const profile = material('ALU_PROFILE_40X40', 'ALU_PROFILE', { type: 'profile' });
  const legacyTube = material('ALU_TUBE_SQUARE_20', 'ALU_SHEET');
  const gs = material('PLEX_GS_WHITE', 'ACRYLIC_GS', { type: 'cast' });
  const xt = material('PLEX_XT_WHITE', 'ACRYLIC_XT', { type: 'extruded' });
  const acrylicLed = material('PLEX_LED_OPAL', 'ACRYLIC_LED');
  const composite = material('DIBOND_WHITE', 'ALU_COMPOSITE', { type: 'composite' });
  const records = [sheet, flat, profile, legacyTube, gs, xt, acrylicLed, composite];

  it('requests GS, XT and LED acrylic for backs and keeps all sheet choices', () => {
    const url = new URL(buildMaterialCatalogUrl('', '', PROFILE_MATERIAL_CATEGORIES.back), 'https://oms.example');
    expect(url.searchParams.get('categories')?.split(',').includes('ACRYLIC_GS')).toBe(true);
    expect(filterProfileMaterials(records, 'back').map(row => row.code))
      .toEqual([sheet.code, gs.code, xt.code, acrylicLed.code, composite.code]);
    expect(filterProfileMaterials(records, 'face').map(row => row.code))
      .toEqual([sheet.code, gs.code, xt.code, acrylicLed.code, composite.code]);
  });

  it('offers filament and resin for FACE and BACK without adding them to metal frames or sides', () => {
    const filament = material('FIBERLOGY_ASA', 'FDM_ASA', { diameter_mm: 1.75 });
    const resin = material('ANYCUBIC_TOUGH', 'RESIN_ANYCUBIC');
    for (const role of ['face', 'back'] as const) {
      expect(filterProfileMaterials([sheet, filament, resin], role)).toEqual([sheet, filament, resin]);
      expect(PROFILE_MATERIAL_CATEGORIES[role].includes('FDM_ASA')).toBe(true);
      expect(PROFILE_MATERIAL_CATEGORIES[role].includes('RESIN_ANYCUBIC')).toBe(true);
    }
    expect(filterProfileMaterials([filament, resin], 'sides')).toEqual([]);
    expect(filterProfileMaterials([filament, resin], 'frame')).toEqual([]);
    expect(isProfilePrintMaterial('FDM_ASA')).toBe(true);
    expect(isProfilePrintMaterial('RESIN_ANYCUBIC')).toBe(true);
    expect(isProfilePrintMaterial('ACRYLIC_GS')).toBe(false);
  });

  it('offers legacy flatstock and tubes only in frame choices and groups their actual form', () => {
    const frames = filterProfileMaterials(records, 'frame');
    expect(frames.map(row => row.code)).toEqual([flat.code, profile.code, legacyTube.code]);
    expect(frames.map(row => row.category)).toEqual(['ALU_FLAT_BAR', 'ALU_PROFILE', 'ALU_PROFILE']);
    expect(getMaterialCatalogView(frames, '', '').categories).toEqual([
      { category: 'ALU_FLAT_BAR', count: 1 }, { category: 'ALU_PROFILE', count: 2 }
    ]);
    expect(filterProfileMaterials(records, 'sides')).toEqual([sheet]);
  });

  it('does not mutate the loaded catalog or erase an existing saved flatstock selection', () => {
    const before = JSON.stringify(records);
    const candidates = filterProfileMaterials(records, 'back');
    expect(candidates.some(row => row.code === flat.code)).toBe(false);
    expect(records.find(row => row.code === flat.code)).toBe(flat);
    expect(flat.category).toBe('ALU_SHEET');
    expect(JSON.stringify(records)).toBe(before);
    expect(filterProfileMaterials(records)).toEqual(records);
  });

  it('loads former side-profile identities without offering them for new side selections', () => {
    const url = new URL(buildMaterialCatalogUrl('', '', PROFILE_MATERIAL_CATEGORIES.sides), 'https://oms.example');
    const requestedCategories = url.searchParams.get('categories')?.split(',') || [];
    const response = records.filter(row => requestedCategories.includes(row.category));
    expect(response.find(row => row.code === profile.code)).toBe(profile);
    expect(response.find(row => row.code === flat.code)).toBe(flat);
    expect(filterProfileMaterials(response, 'sides')).toEqual([sheet]);
    expect(normalizeMaterialType('ALU_FLAT_BAR')).toBe('ALUMINUM');
    expect(normalizeMaterialType('ALU_PROFILE')).toBe('ALUMINUM');
  });

  it('uses explicit product form before legacy code or name guesses', () => {
    const explicitSheet = material('ALU_FLAT_OLD_NAME', 'ALU_SHEET', { product_form: 'sheet', type: 'flat' });
    const explicitFlat = material('ALU_SHEET_CUSTOM', 'ALU_SHEET', { form: 'flatstock', type: 'sheet' });
    const translatedFlat = material('CUSTOM-102', 'ALU_SHEET', {}, 'Aluminium flat bar 20x3');
    expect(getAluminiumForm(explicitSheet)).toBe('sheet');
    expect(getAluminiumForm(explicitFlat)).toBe('flat');
    expect(getAluminiumForm(translatedFlat)).toBe('flat');
    expect(filterProfileMaterials([explicitSheet, explicitFlat, translatedFlat], 'back')).toEqual([explicitSheet]);
    expect(getAluminiumForm(material('LED_ALU_PROFILE', 'LED_ACCESSORY', { type: 'profile' }))).toBeUndefined();
  });

  it('limits main cable candidates to recorded power/multicore cable purposes', () => {
    const mains = material('H07RN-F-3G1.5', 'WIRE', { cable_application: 'mains', cores: 3 });
    const power = material('CUSTOM-POWER', 'WIRE', { cable_application: 'power', cores: 2 });
    const sign = material('CUSTOM-SIGN-CABLE', 'WIRE', { cable_application: 'main_sign' });
    const legacy = material('L3/1.5', 'WIRE', { cores: 3, type: 'Cable', conductor: 'Cu, stranded' });
    const family = material('H05VV-F-3G0.75', 'WIRE');
    const signal = material('LIYCY-2X0.75', 'WIRE', { cores: 2 });
    const control = material('LIHCH-6X0.5', 'WIRE', { cores: 6 });
    const internal = material('SINGLE-CORE', 'WIRE', { cores: 1, voltage_v: 600 });
    const jumper = material('LED-JUMPER-RGB', 'WIRE', { cores: 4, type: 'LED jumper' });
    const unknown = material('CUSTOM-CABLE', 'WIRE');
    expect(filterProfileMaterials([mains, power, sign, legacy, family, signal, control, internal, jumper, unknown], 'mainCable'))
      .toEqual([mains, power, sign, legacy, family]);
  });

  it('respects explicit non-power use even when a legacy name resembles a power cable', () => {
    const signal = material('H05VV-F', 'WIRE', { cable_application: 'signal', cores: 3 });
    const internal = material('L3/1.5', 'WIRE', { cable_application: 'internal_wiring', cores: 3 });
    const saved = [signal, internal];
    expect(filterProfileMaterials(saved, 'mainCable')).toEqual([]);
    expect(saved[0].code).toBe('H05VV-F');
  });
});
