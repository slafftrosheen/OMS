import { describe, expect, it } from 'vitest';
import original from '../../supabase/catalogs/lemona-2026-10-30.json';
import expansion from '../../supabase/catalogs/lemona-2026-10-30-expansion.json';
import batch3 from '../../supabase/catalogs/lemona-2026-10-30-batch-3.json';
import {
  getMaterialSelectionSummary,
  type MaterialSelectionSource
} from '../../src/lib/materials/selection-summary';

const catalogs = [...original.products, ...expansion.products, ...batch3.products];
const product = (code: string) => catalogs.find(row => row.code === code)!;

describe('compact selected material summaries', () => {
  it('shows LED brand, recorded kelvin and scoped power without package or stock details', () => {
    const summary = getMaterialSelectionSummary(product('AFL-60B14424M-830'))!;
    expect(summary.text).toBe('AKTO · 3000 K · 14.4 W/m');
    expect(summary.facts.map(fact => fact.key)).toEqual(['brand', 'colorTemperature', 'powerPerMetre']);
    expect(summary.identity.includes('AFL-60B14424M-830')).toBe(true);
    expect(summary.facts.some(fact => /package|unit|density|voltage/i.test(fact.key))).toBe(false);
  });

  it('keeps RGB colors, module watts and missing temperature honest', () => {
    expect(getMaterialSelectionSummary(product('LEDM-5050-3-RGB'))?.text).toBe('LEMLUX · RGB · 0.72 W');
    expect(getMaterialSelectionSummary(product('LEDM-EDGE-144W'))?.text).toBe('LEMLUX · 6500 K');
    const unknown = getMaterialSelectionSummary({
      category: 'LED_STRIP', code: 'FAKE-6500K-100W', metadata: { brand: 'Example', colorTemp: 'Cool white' }
    })!;
    expect(unknown.text).toBe('Example');
    expect(unknown.identity).toBe('FAKE-6500K-100W');
  });

  it('distinguishes a white channel and maximum strip power from generic output watts', () => {
    const digital = getMaterialSelectionSummary(product('S010060CA4SA1'))!;
    expect(digital.text).toBe('IPIXEL LED · White 6000–6500 K · max. 14 W/m');
    expect(digital.facts.map(fact => fact.key)).toEqual(['brand', 'whiteColorTemperature', 'maxPowerPerMetre']);
    expect(getMaterialSelectionSummary(product('AFLP-168B28824M-CCT'))?.text)
      .toBe('AKTO · 2700–6500 K · 28.8 W/m');
    expect(getMaterialSelectionSummary(product('HM-5050-60-RGBWWHT'))?.text)
      .toBe('AKTO · White 3000 K · 19.2 W/m');
  });

  it('shows PSU brand, actual rated power and recorded series without decoding model numerals', () => {
    const supply = getMaterialSelectionSummary(product('XLG-200-12-A'))!;
    expect(supply.text).toBe('MEAN WELL · 192 W · XLG-200');
    expect(supply.facts.map(fact => fact.key)).toEqual(['brand', 'power', 'series']);
    const legacy = getMaterialSelectionSummary({
      category: 'PSU_MEANWELL', code: 'XLG-200-24-A', metadata: { brand: 'MEAN WELL' }
    })!;
    expect(legacy.text).toBe('MEAN WELL · XLG-200-24-A');
    expect(legacy.facts.some(fact => fact.key === 'power' || fact.key === 'series')).toBe(false);
  });

  it('uses the cable outer diameter and rating alongside entered sign length, never reel length', () => {
    const cable: MaterialSelectionSource = {
      category: 'WIRE', code: 'MAIN-3G15', unit: 'roll', metadata: {
        brand: 'LAPP', outer_diameter_mm: 8.2, wire_cross_section_mm2: 1.5, cores: 3,
        rated_voltage: '300/500 V', voltage_v: 230, length_m: 100, packSize: '100 m reel'
      }
    };
    const summary = getMaterialSelectionSummary(cable, { length: '2.5 m' })!;
    expect(summary.text).toBe('Ø 8.2 mm · 300/500 V · 2.5 m');
    expect(summary.facts.map(fact => fact.key)).toEqual(['diameter', 'ratedVoltage', 'length']);
    expect(summary.text.includes('100')).toBe(false);
    expect(summary.text.includes('230')).toBe(false);
    expect(getMaterialSelectionSummary(cable)?.text).toBe('Ø 8.2 mm · 300/500 V');
  });

  it('preserves recorded cable diameter ranges and voltage units', () => {
    const summary = getMaterialSelectionSummary({
      category: 'WIRE', code: 'H07RN-F-5G1.5', metadata: {
        outer_diameter_range_mm: [11.2, 12.8], rated_voltage: '750 V', cores: 5, wire_cross_section_mm2: 1.5
      }
    }, { length: '4 m' })!;
    expect(summary.text).toBe('Ø 11.2–12.8 mm · 750 V · 4 m');
    expect(summary.facts[1].label).toBe('Voltage rating');
  });

  it('labels conductor area as mm² when a cable diameter is unknown', () => {
    const summary = getMaterialSelectionSummary(product('L3/1.5DI/B'), { length: '3m' })!;
    expect(summary.text).toBe('3 × 1.5 mm² · 3m');
    expect(summary.facts[0].key).toBe('crossSection');
    expect(summary.text.includes('Ø')).toBe(false);
    expect(summary.text.includes('300')).toBe(false);
    const mistyped = getMaterialSelectionSummary({
      category: 'WIRE', code: 'A', metadata: { diameter: '1.5 mm²', wire_cross_section_mm2: 1.5 }
    })!;
    expect(mistyped.text).toBe('1.5 mm²');
    expect(mistyped.facts[0].key).toBe('crossSection');
  });

  it('keeps legacy cable measurements without claiming they are rated voltage', () => {
    const summary = getMaterialSelectionSummary({
      category: 'WIRE', code: 'CUSTOM', metadata: { diameter: '7,8 mm', voltage: '24 V DC' }
    }, { length: '2 × 3 m' })!;
    expect(summary.text).toBe('Ø 7,8 mm · 24 V DC · 2 × 3 m');
    expect(summary.facts[1].key).toBe('voltage');
  });

  it('retains custom and unresolved identities while the catalog is unavailable', () => {
    expect(getMaterialSelectionSummary(null, { kind: 'led', value: 'Custom sign lighting' })?.text)
      .toBe('Custom sign lighting');
    const cable = getMaterialSelectionSummary(null, { kind: 'cable', value: 'OLD-CABLE', length: '2 m' })!;
    expect(cable.text).toBe('OLD-CABLE · 2 m');
    expect(cable.identity).toBe('OLD-CABLE');
    expect(getMaterialSelectionSummary(null, { kind: 'psu', value: '' })?.facts).toEqual([]);
  });

  it('localizes the limited explanatory labels without changing the recorded quantities', () => {
    const russian = getMaterialSelectionSummary(product('S010060CA4SA1'), { locale: 'ru' })!;
    expect(russian.text).toBe('IPIXEL LED · Белый 6000–6500 K · макс. 14 W/m');
    expect(russian.identityLabel).toBe('Выбранный материал');
    const latvian = getMaterialSelectionSummary(product('XLG-200-12-A'), { locale: 'lv' })!;
    expect(latvian.facts[2].label).toBe('Sērija');
    expect(latvian.identity.includes('Barošanas')).toBe(true);
  });

  it('bounds editable metadata and ignores invalid numeric fields without mutating the record', () => {
    const source = Object.freeze({ category: 'WIRE', code: 'LEGACY', metadata: Object.freeze({
      outer_diameter_mm: Infinity, outer_diameter_range_mm: Object.freeze([12, 8]),
      diameter_mm: -3, wire_cross_section_mm2: 0, rated_voltage: `  ${'x'.repeat(100)}  `,
      voltage_v: NaN, cores: 2.5
    }) });
    const before = JSON.stringify(source);
    const summary = getMaterialSelectionSummary(source, { length: '   2   m   ' })!;
    expect(summary.facts.map(fact => fact.key)).toEqual(['ratedVoltage', 'length']);
    expect(summary.facts[0].value.length).toBe(64);
    expect(summary.facts[0].value.endsWith('…')).toBe(true);
    expect(summary.facts[1].value).toBe('2 m');
    expect(JSON.stringify(source)).toBe(before);
  });

  it('leaves color materials, connectors and printing material summaries unchanged', () => {
    for (const category of ['ACRYLIC_GS', 'PAINT_RAL', 'VINYL_ORACAL', 'LED_ACCESSORY', 'FDM_PETG']) {
      expect(getMaterialSelectionSummary({ category, metadata: {} })).toBe(null);
    }
  });
});
