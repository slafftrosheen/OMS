import { describe, expect, it } from 'vitest';
import {
  getMaterialSpecificationFacts,
  MATERIAL_SPECIFICATION_LABELS,
  type MaterialSpecificationSource
} from '../../src/lib/materials/catalog-presentation';

const values = (source: MaterialSpecificationSource) => Object.fromEntries(
  getMaterialSpecificationFacts(source).map(fact => [fact.key, fact.value])
);

describe('recorded catalog specification presentation', () => {
  it('keeps power in watts distinct from power per metre and preserves the stock unit', () => {
    expect(values({ category: 'PSU_MEANWELL', unit: 'PCS', metadata: {
      voltage_v: 12, power_w: 102, current_a: 8.5, ip_rating: 'IP20'
    } })).toEqual({ voltage: '12 V', power: '102 W', current: '8.5 A', ipRating: 'IP20', unit: 'PCS' });
    expect(values({ category: 'LED_STRIP', unit: 'roll', metadata: {
      voltage_v: 24, watts_per_m: 9.6, led_type: 'COB', leds_per_m: 320,
      color_temperature_k: 3000, length_m: 5
    } })).toEqual({
      voltage: '24 V', powerPerMetre: '9.6 W/m', ledType: 'COB', ledDensity: '320 LEDs/m',
      colorTemperature: '3000 K', package: '5 m', unit: 'roll'
    });
  });

  it('labels supplier maximum power and the RGBW white channel separately from nominal or tunable values', () => {
    expect(values({ category: 'LED_STRIP', metadata: {
      voltage_v: 5, max_watts_per_m: 14, led_type: 'SK6812 RGBW',
      white_channel_temperature_range_k: [2700, 3200],
      wattage: '14 W/m maximum', colorTemp: 'White channel 2700–3200 K'
    } })).toEqual({
      voltage: '5 V', maxPowerPerMetre: '14 W/m', ledType: 'SK6812 RGBW',
      whiteColorTemperature: '2700–3200 K'
    });
    expect(values({ category: 'LED_STRIP', metadata: {
      color_temperature_range_k: [2700, 6500], white_channel_temperature_k: 4000,
      power_w: 50, watts_per_m: 8, max_watts_per_m: 10
    } })).toEqual({
      power: '50 W', powerPerMetre: '8 W/m', maxPowerPerMetre: '10 W/m',
      colorTemperature: '2700–6500 K', whiteColorTemperature: '4000 K'
    });
  });

  it('shows filament material, diameter and contents without inferring a spool weight from its name', () => {
    expect(values({ category: 'FDM_PETG', unit: 'PCS', metadata: {
      material: 'PET-G', diameter_mm: 1.75, weight_kg: 1, packSize: '1 spool'
    } })).toEqual({ material: 'PET-G', diameter: '1.75 mm', package: '1 spool · 1 kg', unit: 'PCS' });
    expect(values({ category: 'FDM_PLA', metadata: { material: 'PLA' } }))
      .toEqual({ material: 'PLA' });
  });

  it('does not repeat measurements already included in a package label or convert resin volume into weight', () => {
    expect(values({ category: 'RESIN_OTHER', unit: 'bottle', metadata: {
      packSize: '500 ml bottle', volume_ml: 500
    } })).toEqual({ package: '500 ml bottle', unit: 'bottle' });
    expect(values({ category: 'RESIN_OTHER', metadata: { volume_ml: 1000 } }))
      .toEqual({ package: '1000 ml' });
    expect(values({ category: 'FDM_OTHER', metadata: {
      packSize: '1 kg refill; spool not included', weight_kg: 1
    } })).toEqual({ package: '1 kg refill; spool not included' });
    expect(values({ category: 'LED_STRIP', unit: 'm', metadata: {
      packSize: '5 m reel; sold per metre', length_m: 5
    } })).toEqual({ package: '5 m reel; sold per metre', unit: 'm' });
  });

  it('distinguishes product body length from package length', () => {
    expect(values({ category: 'LED_MODULE', unit: 'PCS', metadata: {
      body_length_mm: 65, length_m: 5
    } })).toEqual({ bodyLength: '65 mm', package: '5 m', unit: 'PCS' });
    expect(values({ category: 'LED_MODULE', metadata: { body_length_mm: 65 } }))
      .toEqual({ bodyLength: '65 mm' });
  });

  it('presents recorded cable and connector cross-section limits without turning a limit into an exact size', () => {
    expect(values({ category: 'WIRE', metadata: { wire_cross_section_mm2: 0.75, cores: 3 } }))
      .toEqual({ crossSection: '0.75 mm²', cores: '3' });
    expect(values({ category: 'LED_ACCESSORY', metadata: {
      wire_cross_section_range_mm2: [0.14, 4], connections: 3
    } })).toEqual({ crossSection: '0.14–4 mm²', connections: '3' });
    expect(values({ category: 'LED_ACCESSORY', metadata: { wire_cross_section_max_mm2: 6 } }))
      .toEqual({ crossSection: '≤ 6 mm²' });
  });

  it('preserves explicit legacy specification text while preferring valid structured values', () => {
    expect(values({ category: 'LED_STRIP', metadata: {
      voltage: '12–24 V DC', wattage: 'Up to 12 W/m', colorTemp: 'Warm white',
      ledCount: '60 LEDs/m', ipRating: 'IP65'
    } })).toEqual({
      voltage: '12–24 V DC', power: 'Up to 12 W/m', ledDensity: '60 LEDs/m',
      colorTemperature: 'Warm white', ipRating: 'IP65'
    });
    expect(values({ category: 'FDM_OTHER', metadata: { diameter_mm: 1.75, diameter: 'old value' } }))
      .toEqual({ diameter: '1.75 mm' });
  });

  it('omits malformed, non-finite, negative and unknown values instead of fabricating specifications', () => {
    const source = { category: 'LED_STRIP', metadata: {
      voltage_v: '24', power_w: Infinity, watts_per_m: -10, max_watts_per_m: 0,
      current_a: NaN, leds_per_m: 1.5, color_temperature_range_k: [6500, 2700],
      white_channel_temperature_k: {}, wire_cross_section_range_mm2: [1, 2, 3],
      diameter_mm: -1.75, weight_kg: null, length_m: false, volume_ml: [],
      cores: 2.5, connections: -1, body_length_mm: '65', private_supplier_cost: 10
    } };
    expect(getMaterialSpecificationFacts(source)).toEqual([]);
    expect(getMaterialSpecificationFacts({ category: 'LED_STRIP', metadata: null })).toEqual([]);
    expect(getMaterialSpecificationFacts(undefined)).toEqual([]);
  });

  it('never parses a product name or SKU to fill missing specifications', () => {
    const source = { category: 'PSU_MEANWELL', name_en: 'Mean Well LRS-100-12 12V 102W', code: 'LRS-100-12' };
    expect(getMaterialSpecificationFacts(source)).toEqual([]);
  });

  it('keeps established color and swatch catalogs outside the technical summary', () => {
    for (const category of ['ACRYLIC_GS', 'VINYL_TRANSLUCENT', 'ORACAL_8500', 'PAINT_RAL', 'PAINT_PANTONE', 'RAL', 'PANTONE']) {
      expect(getMaterialSpecificationFacts({ category, unit: 'sheet', metadata: { hex: '#fff', material: 'Color' } })).toEqual([]);
    }
    expect(values({ category: 'GENERAL', unit: 'box', metadata: {} })).toEqual({ unit: 'box' });
  });

  it('keeps presentation bounded and does not mutate recorded metadata', () => {
    const metadata = Object.freeze({ material: `  PETG   ${'x'.repeat(150)} `, color_temperature_range_k: Object.freeze([3000, 3000]) });
    const source = Object.freeze({ category: 'FDM_OTHER', unit: ' custom unit ', metadata });
    const before = JSON.stringify(source);
    const facts = getMaterialSpecificationFacts(source);
    expect(facts.find(fact => fact.key === 'material')?.value.length).toBe(120);
    expect(facts.find(fact => fact.key === 'material')?.value.endsWith('…')).toBe(true);
    expect(facts.find(fact => fact.key === 'colorTemperature')?.value).toBe('3000 K');
    expect(facts.find(fact => fact.key === 'unit')?.value).toBe('custom unit');
    expect(facts.every(fact => typeof MATERIAL_SPECIFICATION_LABELS[fact.key] === 'string')).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
  });
});
