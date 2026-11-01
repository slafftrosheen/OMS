import { describe, expect, it } from 'vitest';
import { getProfileMaterialBadge, type ProfileMaterialBadgeSource } from '../../src/lib/profiles/material-badge';
import { getTextColor } from '../../src/lib/profiles/helpers';

const acrylic: ProfileMaterialBadgeSource = {
  category: 'ACRYLIC_GS', code: 'PLEXIGLAS_GS_1C33', name_en: 'PLEXIGLAS® GS Yellow 1C33',
  metadata: { colorCode: '1C33', hex: '#FFD700', series: 'GS' }
};
const aluminium: ProfileMaterialBadgeSource = {
  category: 'ALU_SHEET', code: 'WORKSHOP_ALU_SHEET_1500X3000', name_en: 'Aluminium sheet · 1500 × 3000 mm',
  metadata: { material: 'Aluminium', product_form: 'sheet', sheet_width_mm: 1500, sheet_length_mm: 3000 }
};
const film: ProfileMaterialBadgeSource = {
  category: 'VINYL_ORACAL', code: '005S', name_en: 'ORACAL® 8500 Middle Blue',
  metadata: { brand: 'ORACAL®', series: '8500', colorCode: '005', hex: '#0539A2' }
};
const filament: ProfileMaterialBadgeSource = {
  category: 'FDM_ASA', code: '3S-ASA-BLACK-100-175',
  name_en: 'Filament Fiberlogy ASA · black / 1.75 mm / 1 kg · 3S-ASA-BLACK-100-175',
  metadata: { brand: 'Fiberlogy', material: 'ASA', color: 'black', diameter_mm: 1.75, weight_kg: 1 }
};
const resin: ProfileMaterialBadgeSource = {
  category: 'RESIN_ANYCUBIC', code: 'SCRWH-10-IPO-01',
  name_en: 'Anycubic Tough Resin Ultra · white · SCRWH-10-IPO-01',
  metadata: { brand: 'Anycubic', material: 'Photopolymer resin', product_family: 'Tough Resin Ultra', color: 'white' }
};

describe('compact draft-profile material badges', () => {
  it('uses print identity and physical color when a FACE or BACK sheet position contains filament or resin', () => {
    expect(getProfileMaterialBadge(filament, { value: filament.name_en!, kind: 'sheet', thickness: '1.75mm' }))
      .toEqual({ label: 'FDM Fiberlogy ASA', hex: '#000000' });
    expect(getProfileMaterialBadge(resin, { value: resin.name_en!, kind: 'sheet' }))
      .toEqual({ label: 'Anycubic Resin Tough Ultra', hex: '#FFFFFF' });
  });
  it('shows the requested acrylic and sheet identifiers with normalized selected thickness', () => {
    expect(getProfileMaterialBadge(acrylic, { value: acrylic.name_en!, thickness: '3' })).toEqual({ label: 'PLEX 1C33/3mm', hex: '#FFD700' });
    expect(getProfileMaterialBadge(aluminium, { value: aluminium.name_en!, thickness: '1,5 mm' })).toEqual({ label: 'ALU /1.5mm', hex: '#C4C9CE' });
    expect(getProfileMaterialBadge(aluminium, { value: aluminium.name_en! }).label).toBe('ALU');
  });

  it('restores acrylic color codes from legacy selections without changing the saved value', () => {
    expect(getProfileMaterialBadge(null, { value: 'PLEXIGLAS_GS_1C33', category: 'ACRYLIC_GS', thickness: '3mm' }).label).toBe('PLEX 1C33/3mm');
    expect(getProfileMaterialBadge(null, { value: 'PLEX', shortName: 'WN071', category: 'ACRYLIC_GS', thickness: '5mm' }).label).toBe('PLEX WN071/5mm');
    expect(getProfileMaterialBadge(null, { value: 'Unclassified acrylic panel', category: 'ACRYLIC_GS' }).label).toBe('Unclassified acrylic panel');
  });

  it('prefers the recorded acrylic swatch abbreviation over a generic color word in a legacy catalog name', () => {
    const legacy = { category: 'ACRYLIC_GS', code: 'PLEXIGLAS_GS_LONG', name_en: 'PLEXIGLAS GS White', metadata: { short_name: 'WH10', hex: '#ffffff' } };
    expect(getProfileMaterialBadge(legacy, { value: legacy.name_en, thickness: '3mm' })).toEqual({ label: 'PLEX WH10/3mm', hex: '#FFFFFF' });
    expect(getProfileMaterialBadge({ ...legacy, metadata: { shortName: 'WH10' } }, { value: legacy.name_en }).label).toBe('PLEX WH10');
  });

  it('keeps composite and legacy flatstock distinct from plain aluminium sheet', () => {
    expect(getProfileMaterialBadge({ ...aluminium, category: 'ALU_COMPOSITE' }, { value: 'Dibond panel', thickness: '3mm' })).toEqual({ label: 'ALU COMPOSITE/3mm' });
    expect(getProfileMaterialBadge({ ...aluminium, category: 'ALU_COMPOSITE', metadata: { colorCode: '9005', hex: '#000000' } }, { value: 'Black composite panel', thickness: '3mm' })).toEqual({ label: 'ALU COMPOSITE 9005/3mm', hex: '#000000' });
    const flatstock = { ...aluminium, name_en: 'Alu Flat Bar 20x3mm', metadata: { product_form: 'flat bar' } };
    expect(getProfileMaterialBadge(flatstock, { value: flatstock.name_en, kind: 'sheet', thickness: '3mm' }).label).toBe('Alu Flat Bar 20x3mm/3mm');
  });

  it('uses the actual film series and color even when the saved short name contains only a swatch code', () => {
    expect(getProfileMaterialBadge(film, { value: film.name_en!, shortName: '005' })).toEqual({ label: 'ORA 8500/005', hex: '#0539A2' });
    expect(getProfileMaterialBadge(null, { value: 'ORACAL_8500_064', category: 'VINYL_ORACAL' }).label).toBe('ORA 8500/064');
    expect(getProfileMaterialBadge({ ...film, metadata: { colorCode: '005' }, name_en: 'ORACAL Middle Blue' }, { value: '005S' }).label).toBe('ORA 005');
    expect(getProfileMaterialBadge({ category: 'VINYL_OTHER', name_en: 'Avery 800 Blue' }, { value: 'Avery 800 Blue', kind: 'film' }).label).toBe('Avery 800 Blue');
  });

  it('retains paint systems and exact custom text instead of turning every number into a RAL', () => {
    expect(getProfileMaterialBadge({ category: 'PAINT_RAL', code: 'RAL_3024', metadata: { hex: '#FF2D21' } }, { value: 'RAL_3024' })).toEqual({ label: 'RAL 3024', hex: '#FF2D21' });
    expect(getProfileMaterialBadge(null, { value: 'PANTONE_186 C', category: 'PAINT_PANTONE', kind: 'paint' }).label).toBe('Pantone 186 C');
    const custom = 'Brand blue 1234 special finish';
    expect(getProfileMaterialBadge(null, { value: custom, kind: 'paint', hex: '#1234ab' })).toEqual({ label: custom, hex: '#1234AB' });
  });

  it('normalizes catalog Pantone separators and uses a recorded swatch code without rewriting custom Pantone-like names', () => {
    expect(getProfileMaterialBadge({ category: 'PAINT_PANTONE', code: 'PANTONE_186_C' }, { value: 'PANTONE_186_C' }).label).toBe('Pantone 186 C');
    expect(getProfileMaterialBadge({ category: 'PAINT_PANTONE', code: 'PANTONE_RED_BRIGHT', metadata: { short_name: '186_C' } }, { value: 'Pantone Bright Red' }).label).toBe('Pantone 186 C');
    expect(getProfileMaterialBadge(null, { value: 'PANTONE_186_C custom tint', kind: 'paint' }).label).toBe('PANTONE_186_C custom tint');
  });

  it('uses brand and recorded polymer for filament, preserving specific recorded product families', () => {
    expect(getProfileMaterialBadge(filament, { value: filament.name_en! })).toEqual({ label: 'FDM Fiberlogy ASA', hex: '#000000' });
    expect(getProfileMaterialBadge({ ...filament, category: 'FDM_TPU', metadata: { brand: 'Fiberlogy', material: 'TPU', product_family: 'FiberFlex 40D', color: 'grey' } }, { value: 'Fiberlogy F40-BLACK-175-085' })).toEqual({ label: 'FDM Fiberlogy FiberFlex 40D', hex: '#808080' });
    expect(getProfileMaterialBadge(null, { value: filament.name_en!, category: 'FDM_ASA' }).label).toBe('FDM Fiberlogy ASA');
  });

  it('preserves resin family grades without package weights or supplier SKUs', () => {
    expect(getProfileMaterialBadge(resin, { value: resin.name_en! })).toEqual({ label: 'Anycubic Resin Tough Ultra', hex: '#FFFFFF' });
    expect(getProfileMaterialBadge({ ...resin, metadata: { brand: 'Anycubic', product_family: 'Standard Resin HD', color: 'grey' } }, { value: 'Anycubic Standard Resin HD · grey / 1 kg · SPTHG-10-IPO-01' }).label).toBe('Anycubic Resin Standard HD');
    expect(getProfileMaterialBadge({ ...resin, category: 'RESIN_ELEGOO', metadata: { brand: 'Elegoo', product_family: 'ABS-like Resin 3.0' } }, { value: 'Elegoo ABS-like Resin 3.0' }).label).toBe('Elegoo Resin ABS-like 3.0');
  });

  it('shows connector brand and actual model rather than connection and package specifications', () => {
    const connector = {
      category: 'LED_ACCESSORY', code: '221-413', name_en: 'Lever connector WAGO 221-413 · 3-way / 0.14–4 mm²',
      metadata: { brand: 'WAGO', model: '221-413', connections: 3 }
    };
    expect(getProfileMaterialBadge(connector, { value: connector.name_en, kind: 'connector' }).label).toBe('WAGO 221-413');
    expect(getProfileMaterialBadge(null, { value: connector.name_en, category: 'LED_ACCESSORY', kind: 'connector' }).label).toBe('WAGO 221-413');
    expect(getProfileMaterialBadge({ ...connector, metadata: { brand: 'WAGO', model: 'WAGO 221-413' } }, { value: connector.name_en }).label).toBe('WAGO 221-413');
  });

  it('keeps frame shape and conflicting dimensions, while displaying matching geometry only once', () => {
    const frame = { category: 'ALU_PROFILE', name_en: 'Aluminium square tube 40x40' };
    expect(getProfileMaterialBadge(frame, { value: frame.name_en, kind: 'frame', dimensions: '40x40x2', thickness: '2mm' }).label).toBe('ALU square tube 40x40x2');
    expect(getProfileMaterialBadge(frame, { value: frame.name_en, kind: 'frame', dimensions: '60x40x2', thickness: '3mm' }).label).toBe('ALU square tube 40x40 · 60x40x2 · 3mm');
    expect(getProfileMaterialBadge(null, { value: 'Custom bracket', kind: 'frame', dimensions: 'As drawing A-17', thickness: '2mm' }).label).toBe('Custom bracket · As drawing A-17 · 2mm');
  });

  it('retains a meaningful legacy short name when a generic saved value has no catalog category', () => {
    expect(getProfileMaterialBadge(null, { value: 'FDM', shortName: 'Fiberlogy ASA', kind: 'print3d' }).label).toBe('Fiberlogy ASA');
    expect(getProfileMaterialBadge(null, { value: 'PLEX', shortName: 'WN071', kind: 'sheet', thickness: '3mm' }).label).toBe('WN071/3mm');
  });

  it('does not classify unresolved custom text by its wording or discard meaningful custom content', () => {
    for (const value of ['Anycubic resin prototype', 'ORACAL 8500-inspired custom blue', 'RAL 3024 special mix', 'PLEX 1C33 bespoke finish']) {
      expect(getProfileMaterialBadge(null, { value, kind: 'print3d' }).label).toBe(value);
    }
    expect(getProfileMaterialBadge(null, { value: 'Custom panel / routed relief', kind: 'sheet', thickness: '2mm' }).label).toBe('Custom panel / routed relief/2mm');
    expect(getProfileMaterialBadge(null, { value: '  Keep deliberate spacing  ', kind: 'film' }).label).toBe('  Keep deliberate spacing  ');
    expect(getProfileMaterialBadge(null, { value: 'Custom resin 186 C', shortName: 'Anycubic Resin Tough', kind: 'print3d' }).label).toBe('Custom resin 186 C');
    expect(getProfileMaterialBadge(acrylic, { value: '', hex: '#123456' })).toEqual({ label: '' });
  });
});

describe('physical material badge colors', () => {
  it('prioritizes the explicit saved swatch, then safe catalog hex and RGB', () => {
    expect(getProfileMaterialBadge(acrylic, { value: acrylic.name_en!, hex: '#abc' }).hex).toBe('#AABBCC');
    expect(getProfileMaterialBadge({ ...film, metadata: { series: '8500', colorCode: '005', rgb: [5, 57, 162] } }, { value: film.name_en! }).hex).toBe('#0539A2');
    expect(getProfileMaterialBadge({ ...filament, metadata: { ...filament.metadata, hex: '#123456' } }, { value: filament.name_en! }).hex).toBe('#123456');
  });

  it('represents the recorded branded neutral names and wood-brown hue without claiming a manufacturer color measurement', () => {
    for (const [color, hex] of [['midnight black', '#000000'], ['snow white', '#FFFFFF'], ['traffic white', '#FFFFFF'], ['Brown', '#A52A2A']]) {
      expect(getProfileMaterialBadge({ ...filament, metadata: { ...filament.metadata, color } }, { value: filament.name_en! }).hex).toBe(hex);
    }
  });

  it('does not guess specific hues or accept unsafe CSS and malformed RGB values', () => {
    for (const color of ['azure', 'transparent', 'rainbow', 'var(--text)', '#fff;background:red']) {
      expect(getProfileMaterialBadge({ ...filament, metadata: { color } }, { value: filament.name_en!, hex: color }).hex).toBeUndefined();
    }
    for (const rgb of [[5, 57], [5, 57, 256], [5, 57, -1], [5, 57, 1.5], ['5', '57', '162'], [5, 57, 162, 1]]) {
      expect(getProfileMaterialBadge({ category: 'OTHER', metadata: { rgb } }, { value: 'Custom catalog part' }).hex).toBeUndefined();
    }
    expect(getProfileMaterialBadge({ ...aluminium, metadata: { color: 'blue' } }, { value: aluminium.name_en! }).hex).toBeUndefined();
    expect(getProfileMaterialBadge({ category: 'LED_MODULE', metadata: { color: 'white' } }, { value: 'White-light module' }).hex).toBeUndefined();
  });

  it('uses contrast-aware text for the exact example colors and does not mutate configuration or metadata', () => {
    const source = Object.freeze({ ...filament, metadata: Object.freeze({ ...filament.metadata }) });
    const options = Object.freeze({ value: filament.name_en!, kind: 'print3d' as const });
    const before = JSON.stringify([source, options]);
    const black = getProfileMaterialBadge(source, options);
    expect(getTextColor(black.hex!)).toBe('#FFFFFF');
    expect(getTextColor(getProfileMaterialBadge(resin, { value: resin.name_en! }).hex!)).toBe('#000000');
    expect(getTextColor(getProfileMaterialBadge(acrylic, { value: acrylic.name_en! }).hex!)).toBe('#000000');
    expect(getTextColor(getProfileMaterialBadge(film, { value: film.name_en! }).hex!)).toBe('#FFFFFF');
    expect(JSON.stringify([source, options])).toBe(before);
  });
});
