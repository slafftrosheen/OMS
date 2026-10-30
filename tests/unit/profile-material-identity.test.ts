import { describe, expect, it } from 'vitest';
import { applyPaintMaterialSelection, extractShortName, materialDisplayName, paintMaterialValue, selectionBadgeLabel } from '../../src/lib/profiles/helpers';
import { applyProfileMaterialSelection } from '../../src/lib/profiles/face-materials';
import { frameBadgeLabel, readLegacyFrameThickness, withFrameThickness } from '../../src/lib/profiles/frame-sizing';
import { summarizeNativeProfileConfiguration } from '../../src/lib/order/native-profile-context';
import { canonicalOrderProfiles, orderFields } from '../../src/lib/server/order/draft-contract';

describe('profile material identity', () => {
  it('keeps LED strip, PSU, cable and filament models instead of generic code-derived abbreviations', () => {
    const parts = [
      { category: 'LED_STRIP', code: 'LED_001', name_en: 'Lemlux LP-2835-120-24V 4000K', short: 'LED' },
      { category: 'PSU_MEANWELL', code: 'MW_LRS_100_12', name_en: 'Mean Well LRS-100-12 12V 102W', short: 'PSU' },
      { category: 'WIRE', code: 'CABLE_001', name_en: 'LAPP H05VV-F 3G0.75 white', short: 'CABLE' },
      { category: 'ALU_PROFILE', code: 'ALU_BOX', name_en: 'Aluminium square tube 40x40', short: 'ALU' },
      { category: 'FDM_PETG', code: 'FDM_001', name_en: 'Spectrum PET-G Premium 1.75mm Polar White', short: 'PETG' }
    ];
    for (const part of parts) {
      const material = { ...part, metadata: { short_name: part.short } };
      expect(materialDisplayName(material)).toBe(part.name_en);
      expect(extractShortName({ value: part.name_en, material, shortName: part.short }, part.category)).toBe(part.name_en);
      expect(selectionBadgeLabel(part.name_en, part.short, part.category)).toBe(part.name_en);
      expect(selectionBadgeLabel(part.code, part.short, part.category)).toBe(part.code);
    }
  });

  it('uses manufacturer identity when a legacy catalog row has only a generic product name', () => {
    expect(materialDisplayName({
      category: 'LED_MODULE', code: 'LED_17', name_en: 'LED',
      metadata: { brand: 'BaltLED', model: 'CROWN OPTO S', short_name: 'LED' }
    })).toBe('BaltLED CROWN OPTO S');
    expect(selectionBadgeLabel('LED', 'BaltLED CROWN OPTO S', 'LED_MODULE')).toBe('BaltLED CROWN OPTO S');
  });

  it('preserves working acrylic, paint, film identifiers and exact custom text', () => {
    expect(materialDisplayName({ category: 'ACRYLIC_GS', name_en: 'PLEXIGLAS GS Opal', metadata: { colorCode: 'WN071' } })).toBe('WN071');
    expect(selectionBadgeLabel('RAL 9005 Jet black', '9005', 'PAINT_RAL')).toBe('9005');
    expect(selectionBadgeLabel('ORACAL_8500_064', undefined, 'VINYL_ORACAL')).toBe('8500_064');
    expect(extractShortName({ value: 'My custom LED module (prototype)', material: null }, 'LED')).toBe('My custom LED module (prototype)');
  });

  it('does not turn missing thickness metadata into an explicit empty catalog', () => {
    const previous = { id: 'back', value: 'Legacy aluminium', category: 'ALU_SHEET', thickness: '2' };
    const selected = applyProfileMaterialSelection(previous, {
      value: 'Aluminium sheet', hex: '', material: { category: 'ALU_SHEET', name_en: 'Aluminium sheet' }
    }, 'ALU');
    expect(selected.thicknessOptions).toBeUndefined();
    expect(selected.thickness).toBe('2');
    expect(applyProfileMaterialSelection(previous, {
      value: 'Custom aluminium', hex: '', material: { category: 'ALU_SHEET', thickness_options: [] }
    }, 'ALU').thicknessOptions).toEqual([]);
  });

  it('clears a material and its dependent metadata without altering another saved field', () => {
    const previous = {
      id: 'back', value: 'Aluminium sheet', category: 'ALU_SHEET',
      thickness: '2mm', thicknessOptions: [1, 2, 3], hex: '#abcdef', shortName: 'ALU',
      legacyNote: 'Keep this instruction'
    };
    expect(applyProfileMaterialSelection(previous, { value: '', hex: '', material: null }, 'ALU')).toEqual({
      ...previous, value: '', category: '', thickness: '', thicknessOptions: [], hex: '', shortName: ''
    });
    expect(previous.value).toBe('Aluminium sheet');
  });

  it('keeps RAL and Pantone identities distinct and clears paint including its swatch', () => {
    expect(paintMaterialValue({ system: 'RAL', code: '9005' })).toBe('RAL_9005');
    expect(paintMaterialValue({ system: 'RAL', code: 'RAL_9005' })).toBe('RAL_9005');
    expect(paintMaterialValue({ system: 'Pantone', code: '186 C' })).toBe('PANTONE_186 C');
    const paint = applyPaintMaterialSelection({
      value: 'Pantone 186 C', hex: '#c8102e', material: { category: 'PAINT_PANTONE', code: 'PANTONE_186 C' }
    });
    expect(paint).toEqual({ system: 'Pantone', code: '186 C', hex: '#c8102e' });
    expect(paintMaterialValue(paint)).toBe('PANTONE_186 C');
    expect(applyPaintMaterialSelection({ value: '', hex: '', material: null })).toEqual({ system: '', code: '', hex: '' });
  });

  it('retains exact custom paint text and color, including digits that are not a RAL code', () => {
    const custom = applyPaintMaterialSelection({ value: 'Brand blue 1234 special finish', hex: '#1234ab', material: null });
    expect(custom).toEqual({ system: 'CUSTOM', code: 'Brand blue 1234 special finish', hex: '#1234ab' });
    expect(paintMaterialValue(custom)).toBe('Brand blue 1234 special finish');
    expect(paintMaterialValue({ system: 'RAL', code: 'Legacy custom blue' })).toBe('Legacy custom blue');
  });
});

describe('frame wall thickness compatibility', () => {
  it('reads an old embedded wall without changing dimensions or guessing from a two-axis size', () => {
    expect(readLegacyFrameThickness('40x40x2')).toBe('2mm');
    expect(readLegacyFrameThickness('40 × 20 × 1,5 mm')).toBe('1.5mm');
    expect(readLegacyFrameThickness('D20x1.5')).toBe('1.5mm');
    expect(readLegacyFrameThickness('40x40')).toBe('');
    expect(readLegacyFrameThickness('Custom bracket')).toBe('');
  });

  it('synchronizes a recognized embedded wall only on explicit thickness edits', () => {
    expect(withFrameThickness('40x40x2', '1.5mm')).toBe('40x40x1.5');
    expect(withFrameThickness('D20x2 mm', '3')).toBe('D20x3 mm');
    expect(withFrameThickness('40x40', '2mm')).toBe('40x40');
    expect(withFrameThickness('Custom bracket', '2mm')).toBe('Custom bracket');
  });

  it('shows frame geometry once while retaining different dimensions and conflicting walls', () => {
    expect(frameBadgeLabel('Aluminium tube 40x40', '40x40x2', '2mm')).toBe('Aluminium tube 40x40x2');
    expect(frameBadgeLabel('Aluminium tube 40 × 20', '40x20x1.5', '1.5mm')).toBe('Aluminium tube 40x20x1.5');
    expect(frameBadgeLabel('Round tube Ø20', 'D20x2', '2mm')).toBe('Round tube D20x2');
    expect(frameBadgeLabel('Aluminium tube 40x40x2', '40x40', '2mm')).toBe('Aluminium tube 40x40x2');
    expect(frameBadgeLabel('Aluminium tube 40x40', '60x40x2', '2mm')).toBe('Aluminium tube 40x40 · 60x40x2');
    expect(frameBadgeLabel('Aluminium tube 40x40x2', '40x40x3', '3mm')).toBe('Aluminium tube 40x40x2 · 40x40x3');
    expect(frameBadgeLabel('Aluminium tube 40x40', '40x40x2', '3mm')).toBe('Aluminium tube 40x40x2 · 3mm');
    expect(frameBadgeLabel('Custom bracket', 'As drawing A-17', '2mm')).toBe('Custom bracket · As drawing A-17 · 2mm');
  });

  it('carries active 3D material and frame wall to production and assistant summaries', () => {
    const source = {
      CNC_FREZER: { print3d: true, print3dMaterial: 'Spectrum PET-G Premium Polar White' },
      ASSEMBLING: { frame: true, frameMaterial: 'Aluminium tube', frameDimensions: '40x40', frameThickness: '2mm' }
    };
    const summary = summarizeNativeProfileConfiguration(source);
    expect(summary.sections.CNC_FREZER?.print3dMaterial).toBe('Spectrum PET-G Premium Polar White');
    expect(summary.sections.ASSEMBLING?.frameThickness).toBe('2mm');
    const inactive = summarizeNativeProfileConfiguration({
      CNC_FREZER: { ...source.CNC_FREZER, print3d: false },
      ASSEMBLING: { ...source.ASSEMBLING, frame: false }
    });
    expect(inactive.sections.CNC_FREZER).not.toHaveProperty('print3dMaterial');
    expect(inactive.sections.ASSEMBLING).not.toHaveProperty('frameThickness');
  });
});

describe('optional branded cable connectors', () => {
  it('round-trips connector model and the independent legacy WAGO flag through the order save contract', () => {
    const configuration = {
      ASSEMBLING: {
        cables: true, cablesWago: true, cablesConnector: 'WAGO 221-413 3-conductor connector',
        cablesConnectorShort: 'WAGO 221-413', cablesConnectorCategory: 'LED_ACCESSORY',
        historicAssemblyNote: 'Keep this'
      },
      legacySettings: { untouched: true }
    };
    const payload = orderFields.parse({ profiles: [{ quantity: 1, configuration }] });
    expect(JSON.parse(JSON.stringify(canonicalOrderProfiles(payload.profiles)[0].configuration))).toEqual(configuration);
  });

  it('includes a connector in production context only while cables and WAGO are active', () => {
    const assembly = { cables: true, cablesWago: true, cablesConnector: 'WAGO 221-413' };
    expect(summarizeNativeProfileConfiguration({ ASSEMBLING: assembly }).sections.ASSEMBLING?.cablesConnector).toBe('WAGO 221-413');
    for (const disabled of [{ ...assembly, cables: false }, { ...assembly, cablesWago: false }]) {
      expect(summarizeNativeProfileConfiguration({ ASSEMBLING: disabled }).sections.ASSEMBLING).not.toHaveProperty('cablesConnector');
      expect(disabled.cablesConnector).toBe('WAGO 221-413');
    }
    const cleared = summarizeNativeProfileConfiguration({ ASSEMBLING: { ...assembly, cablesConnector: '' } });
    expect(cleared.sections.ASSEMBLING?.cablesWago).toBe(true);
    expect(cleared.sections.ASSEMBLING).not.toHaveProperty('cablesConnector');
  });
});
