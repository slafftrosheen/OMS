import { describe, expect, it } from 'vitest';
import { extractShortName, materialDisplayName, selectionBadgeLabel } from '../../src/lib/profiles/helpers';
import { applyProfileMaterialSelection } from '../../src/lib/profiles/face-materials';
import { readLegacyFrameThickness, withFrameThickness } from '../../src/lib/profiles/frame-sizing';
import { summarizeNativeProfileConfiguration } from '../../src/lib/order/native-profile-context';

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
