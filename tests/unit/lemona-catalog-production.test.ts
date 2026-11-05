import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import batch from '../../supabase/catalogs/lemona-2026-10-31-production.json';
import previous from '../../supabase/catalogs/lemona-2026-10-31-xlg-strips.json';
import { catalogSources, renderMigration, validateCatalog, validateCatalogSet } from '../../scripts/catalog/generate-lemona-seed.mjs';

const product = (code: string) => batch.products.find((entry) => entry.code === code)!;
const validationError = (run: () => unknown) => {
  try { run(); return ''; } catch (error) { return (error as Error).message; }
};

describe('fifth additive Lemona production catalog', () => {
  it('preserves the preceding published snapshot and generates an immutable additive migration', () => {
    const published = catalogSources.find((source) => source.id === previous.catalog_id)!;
    for (const [path, hash] of [
      [published.manifestPath, '94fb117cf8779a5ff1947c086db89e01ebba58a3e893a973bb9d49a81d7fdbde'],
      [published.migrationPath, 'f953fa25adf95d654c473dd0888f49173cf681d8c8e4a128f3b88be08b0b1d38']
    ]) {
      expect(createHash('sha256').update(readFileSync(resolve(process.cwd(), path))).digest('hex')).toBe(hash);
    }
    const source = catalogSources.find((entry) => entry.id === batch.catalog_id)!;
    expect(source.immutable).toBe(true);
    expect(source.migrationPath).toBe('supabase/migrations/20261031000005_lemona_production_catalog.sql');
    expect(readFileSync(resolve(process.cwd(), source.migrationPath), 'utf8')).toBe(renderMigration(batch));
    const catalogs = catalogSources.map((entry) => JSON.parse(readFileSync(resolve(process.cwd(), entry.manifestPath), 'utf8')));
    expect(validateCatalogSet(catalogs)).toBe(catalogs);
    expect(new Set(catalogs.flatMap((entry) => entry.products.map((item: any) => item.code))).size).toBe(128);
  });

  it('retains direct supplier provenance and keeps specifications separate from inventory', () => {
    for (const entry of batch.products) {
      expect(entry.metadata.source_kind).toBe('product_page');
      expect(entry.metadata.verified_at).toBe('2026-10-31');
      expect(entry.metadata.catalog_seed).toBe(batch.catalog_id);
      expect(entry.metadata.model).toBe(entry.code);
      expect(entry.metadata.supplier_product_code).toBe(entry.code);
      expect(new URL(entry.metadata.source_url).hostname).toBe('www.lemona.lv');
      expect(entry.thickness_options).toEqual([]);
      for (const field of ['price', 'stock', 'availability', 'lead_time_days']) {
        expect(field in entry).toBe(false);
        expect(field in entry.metadata).toBe(false);
      }
    }
    const counts = batch.products.reduce((result, entry) => {
      result[entry.category] = (result[entry.category] ?? 0) + 1;
      return result;
    }, {} as Record<string, number>);
    expect(counts).toEqual({ PSU_MEANWELL: 4, LED_STRIP: 12, WIRE: 2, FDM_ASA: 1, FDM_OTHER: 2, FDM_ABS: 1 });
  });

  it('rejects supplier-SKU aliases within and across catalogs before import generation', () => {
    const within: any = structuredClone(batch);
    within.products[1].metadata.supplier_sku = within.products[0].metadata.supplier_sku;
    expect(validationError(() => validateCatalogSet([within]))).toContain('do not import an alias');

    const across: any = structuredClone(batch);
    across.products[0].metadata.supplier_sku = previous.products[0].metadata.supplier_sku;
    expect(validationError(() => validateCatalogSet([previous, across]))).toContain('do not import an alias');

    for (const invalid of [113515, '', ' 113515', '113515 ', null]) {
      const copy: any = structuredClone(batch);
      copy.products[0].metadata.supplier_sku = invalid;
      expect(validationError(() => validateCatalog(copy))).toContain('Invalid supplier SKU');
    }
    const leadingZeros: any = structuredClone(batch);
    leadingZeros.products[0].metadata.supplier_sku = '00113515';
    expect(validateCatalog(leadingZeros)).toBe(leadingZeros);
    expect(leadingZeros.products[0].metadata.supplier_sku).toBe('00113515');
    // A product with no verified separate SKU still has its confirmed product code.
    expect('supplier_sku' in product('EABS-PURETR-175-075').metadata).toBe(false);
    expect(validateCatalog(batch)).toBe(batch);
  });

  it('uses exact manufacturer-rated LPV outputs and retains the manufacturer application qualification', () => {
    for (const [code, voltage, current, power] of [
      ['LPV-35-24', 24, 1.5, 36], ['LPV-100-12', 12, 8.5, 102],
      ['LPV-100-24', 24, 4.2, 100.8], ['LPV-150-24', 24, 6.3, 151.2]
    ] as const) {
      const entry = product(code);
      expect(entry.unit).toBe('PCS');
      expect(entry.metadata.series).toBe('LPV');
      expect(entry.metadata.voltage_v).toBe(voltage);
      expect(entry.metadata.current_a).toBe(current);
      expect(entry.metadata.power_w).toBe(power);
      expect(entry.metadata.wattage).toBe(`${power} W`);
      expect(entry.metadata.ip_rating).toBe('IP67');
      expect(entry.metadata.manufacturer_source_url?.startsWith('https://www.meanwell.com/Upload/PDF/')).toBe(true);
      expect(entry.metadata.data_notes).toContain('excludes LED lighting luminaire applications in the EU and China');
      expect('length_m' in entry.metadata).toBe(false);
    }
  });

  it('distinguishes fixed RGBW white channels and single colors from tunable white temperature', () => {
    for (const [code, white, ip] of [
      ['HM-5050-60-RGBWHT', 6500, 'IP67'],
      ['HM-5050-60-RGBW-AK', 6500, 'IP20'],
      ['HM-5050-60-RGBWW-AK', 3000, 'IP20']
    ] as const) {
      const entry = product(code);
      expect(entry.metadata.white_channel_temperature_k).toBe(white);
      expect(entry.metadata.watts_per_m).toBe(19.2);
      expect(entry.metadata.ip_rating).toBe(ip);
      expect(entry.unit).toBe('m');
      for (const field of ['color_temperature_k', 'color_temperature_range_k', 'power_w', 'control_ic', 'length_m']) {
        expect(field in entry.metadata).toBe(false);
      }
    }
    for (const [code, color] of [['COB-11B480-24', 'Blue'], ['COB-11G480-24', 'Green']]) {
      expect(product(code).metadata.color).toBe(color);
      expect(product(code).metadata.ip_rating).toBe('IP20');
      expect('color_temperature_k' in product(code).metadata).toBe(false);
      expect('color_temperature_range_k' in product(code).metadata).toBe(false);
    }
    expect(product('COB-11G480-24').metadata.data_notes).toContain('old URL says yellow/IP65');
    expect(product('COB-11WW480-24').metadata.color_temperature_k).toBe(3000);
    expect(product('COB-11WW480-24').metadata.data_notes).toContain('old URL and generated description say 2700 K');
  });

  it('keeps complete reels distinct from per-metre strips and omits uncertain cut spacing', () => {
    const reels = batch.products.filter((entry) => entry.unit === 'roll');
    expect(reels.map((entry) => entry.code)).toEqual([
      'COB-11WW480-24', 'COB-11B480-24', 'COB-11G480-24',
      'COB-11NW480-24IP65', 'COB-11NW480-24IP67', 'COB-11WW480-24IP67'
    ]);
    for (const entry of reels) {
      expect(entry.metadata.length_m).toBe(5);
      expect(entry.metadata.packSize).toBe('5 m reel');
      expect(entry.metadata.wattage).toBe('11 W/m');
      expect('power_w' in entry.metadata).toBe(false);
      if (entry.code !== 'COB-11WW480-24') expect('cut_interval_mm' in entry.metadata).toBe(false);
    }
    const perMetre = product('COB-NW480-11-24');
    expect(perMetre.unit).toBe('m');
    expect(perMetre.metadata.length_m).toBe(5);
    expect(perMetre.metadata.packSize).toContain('Sold per metre');
    expect(perMetre.metadata.cut_interval_mm).toBe(50);
    expect(product('HM-2835-96245-NWm').metadata.width_mm).toBe(5);
    expect(product('HM-2835-96245-NWm').metadata.cut_interval_mm).toBe(50);
    expect(product('COB-11NW480-24IP67').metadata.width_mm).toBe(10);
    expect(product('COB-11NW480-24IP67').metadata.type).toContain('D-shaped');
  });

  it('keeps mains cable diameter, conductor area, insulation rating and order length distinct', () => {
    for (const [code, cores, outerDiameter] of [
      ['H07RN-F-4G2.5', 4, [12.1, 13.8]],
      ['H07RN-F-5G2.5', 5, [13.3, 15.1]]
    ] as const) {
      const entry = product(code);
      expect(entry.unit).toBe('m');
      expect(entry.metadata.brand).toBe('LAPP');
      expect(entry.metadata.cable_application).toBe('mains');
      expect(entry.metadata.cores).toBe(cores);
      expect(entry.metadata.wire_cross_section_mm2).toBe(2.5);
      expect(entry.metadata.outer_diameter_range_mm).toEqual(outerDiameter);
      expect(entry.metadata.diameter).toBe(`${outerDiameter[0]}–${outerDiameter[1]} mm`);
      expect(entry.metadata.rated_voltage).toBe('750 V');
      expect(entry.metadata.voltage).toBe(entry.metadata.rated_voltage);
      for (const field of ['length_m', 'diameter_mm', 'voltage_v', 'current_a']) expect(field in entry.metadata).toBe(false);
    }
  });

  it('stores net filament mass and diameter without treating gross packaging or filament diameter as sheet thickness', () => {
    for (const [code, material, color, netWeight, packageType] of [
      ['ASA-WHITE-175-1R-ROS', 'ASA', 'White', 1, 'refill'],
      ['PCTG-TRAN-175-1R-ROS', 'PCTG', 'Transparent', 1, 'refill'],
      ['PA12-BLACK-175-075', 'PA12', 'Black', 0.75, undefined],
      ['EABS-PURETR-175-075', 'Easy ABS', 'Transparent', 0.75, undefined]
    ] as const) {
      const entry = product(code);
      expect(entry.unit).toBe('PCS');
      expect(entry.section).toBe('3dprinting');
      expect(entry.metadata.material).toBe(material);
      expect(entry.metadata.color).toBe(color);
      expect(entry.metadata.diameter_mm).toBe(1.75);
      expect(entry.metadata.weight_kg).toBe(netWeight);
      expect(entry.metadata.package_type).toBe(packageType);
      expect(entry.thickness_options).toEqual([]);
      for (const field of ['width_mm', 'height_mm', 'body_length_mm', 'print_temperature_c', 'hex']) {
        expect(field in entry.metadata).toBe(false);
      }
    }
  });
});
