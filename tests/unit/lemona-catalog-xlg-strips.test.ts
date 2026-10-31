import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import initial from '../../supabase/catalogs/lemona-2026-10-30.json';
import expansion from '../../supabase/catalogs/lemona-2026-10-30-expansion.json';
import third from '../../supabase/catalogs/lemona-2026-10-30-batch-3.json';
import batch from '../../supabase/catalogs/lemona-2026-10-31-xlg-strips.json';
import { catalogSources, renderMigration, validateCatalog, validateCatalogSet } from '../../scripts/catalog/generate-lemona-seed.mjs';

const product = (code: string) => batch.products.find((entry) => entry.code === code)!;

describe('fourth additive Lemona XLG, strip and mains cable catalog', () => {
  it('preserves all three published manifests and migrations exactly', () => {
    const hashes = [
      ['f18fe48ea5835d53bffa3bef51517e1958f2a1d980bc29eee592e6b1823a38fb',
        'da68e080bc24ca055c000c57f71d4a85cc785fb01ff6c6853d49030ad550456c'],
      ['67613f92e2e656b6ab35d93f3f3a856d7918c1a01449cdb0c641d6bc0a45ee1e',
        'd2cdc70f97f05b7dbc6aa4ed87a7e3e24538d03230686fd438aafe107eac9320'],
      ['ac29f2ef5197ba9035ea8ef231b5d963499be02a8c022c737821893242140fac',
        'bb1e7c608a7f10b932fa580b163ba959ca8b92ac564139a11b913be63ed9b8e0']
    ];
    for (const [index, source] of catalogSources.slice(0, 3).entries()) {
      expect(source.immutable).toBe(true);
      for (const [fieldIndex, path] of [source.manifestPath, source.migrationPath].entries()) {
        expect(createHash('sha256').update(readFileSync(resolve(process.cwd(), path))).digest('hex'))
          .toBe(hashes[index][fieldIndex]);
      }
    }
  });

  it('adds 26 directly sourced products to make 106 distinct catalog codes', () => {
    const catalogs = [initial, expansion, third, batch];
    expect(validateCatalogSet(catalogs)).toBe(catalogs);
    expect(batch.products.length).toBe(26);
    expect(new Set(catalogs.flatMap((catalog) => catalog.products.map((entry) => entry.code))).size).toBe(106);
    expect(batch.products.every((entry) => entry.metadata.source_kind === 'product_page'
      && entry.metadata.verified_at === '2026-10-31'
      && entry.metadata.supplier_sku && entry.thickness_options.length === 0)).toBe(true);
    const counts = batch.products.reduce((result, entry) => {
      result[entry.category] = (result[entry.category] ?? 0) + 1;
      return result;
    }, {} as Record<string, number>);
    expect(counts).toEqual({ PSU_MEANWELL: 4, LED_STRIP: 18, WIRE: 4 });
    expect(batch.products.filter((entry) => entry.metadata.brand === 'AKTO').length).toBe(10);
    expect(batch.products.filter((entry) => entry.metadata.brand === 'LEMLUX').length).toBe(8);
    const source = catalogSources.find((entry) => entry.id === batch.catalog_id)!;
    expect(source.immutable).toBe(true);
    expect(readFileSync(resolve(process.cwd(), source.migrationPath), 'utf8')).toBe(renderMigration(batch));
  });

  it('uses manufacturer-rated XLG output instead of power implied by the series number', () => {
    const ratings = [
      ['XLG-75-12-A', 12, 5, 60], ['XLG-75-24-A', 24, 3.1, 74.4],
      ['XLG-100-12-A', 12, 8, 96], ['XLG-100-24-A', 24, 4, 96]
    ] as const;
    for (const [code, voltage, current, power] of ratings) {
      const entry = product(code);
      expect(entry.unit).toBe('PCS');
      expect(entry.metadata.series).toBe('XLG');
      expect(entry.metadata.voltage_v).toBe(voltage);
      expect(entry.metadata.current_a).toBe(current);
      expect(entry.metadata.power_w).toBe(power);
      expect(entry.metadata.wattage).toBe(`${power} W`);
      expect(entry.metadata.manufacturer_source_url?.startsWith('https://www.meanwell.com/')).toBe(true);
      expect(entry.metadata.ip_rating).toBe('IP67');
      expect('length_m' in entry.metadata).toBe(false);
    }
  });

  it('separates strip power per metre, fixed white temperatures and tunable CCT', () => {
    const strips = batch.products.filter((entry) => entry.category === 'LED_STRIP');
    for (const entry of strips) {
      expect(entry.metadata.wattage).toBe(`${entry.metadata.watts_per_m} W/m`);
      expect('power_w' in entry.metadata).toBe(false);
      expect('current_a' in entry.metadata).toBe(false);
      expect('white_channel_temperature_k' in entry.metadata).toBe(false);
      expect('white_channel_temperature_range_k' in entry.metadata).toBe(false);
    }
    expect([...new Set(strips.map((entry) => entry.metadata.color_temperature_k).filter(Boolean))].sort())
      .toEqual([2700, 3000, 4000, 6000, 6500]);
    const tunable = product('COB-14CCT608-24').metadata;
    expect(tunable.color_temperature_range_k).toEqual([2700, 6500]);
    expect('color_temperature_k' in tunable).toBe(false);
    expect(tunable.watts_per_m).toBe(14);
    expect(tunable.supplier_sku).toBe('455674');
    expect(tunable.cut_interval_mm).toBe(26.31);
    expect(batch.products.some((entry) => entry.code === 'COB-CCT608-14-24')).toBe(false);
    expect(product('AFL-120B96245M-865').metadata.width_mm).toBe(5);
    expect(product('COB-WW400-10-24-5MM').metadata.width_mm).toBe(5);
    expect(product('AFL-90B1106M-865').metadata.type).toContain('S-shaped');
  });

  it('keeps supplier selling units separate from reel lengths and omits unknown packaging', () => {
    const reels = batch.products.filter((entry) => entry.unit === 'roll');
    expect(reels.map((entry) => entry.code)).toEqual([
      'AFL-60B144M-865', 'AFL-120B96245M-865', 'AFL-90B1106M-865', 'COB-14CCT608-24', 'COB-11CW480-24HE'
    ]);
    expect(reels.every((entry) => entry.metadata.length_m === 5)).toBe(true);
    const cutStrip = product('COB-WW480-11-24WP');
    expect(cutStrip.unit).toBe('m');
    expect(cutStrip.metadata.length_m).toBe(5);
    expect(cutStrip.metadata.packSize).toContain('Sold per metre');
    for (const code of ['HM-2835-168-96WWm24', 'HM-2835-168-96NWm24']) {
      expect(product(code).unit).toBe('m');
      expect('length_m' in product(code).metadata).toBe(false);
      expect('packSize' in product(code).metadata).toBe(false);
    }
  });

  it('keeps mains cable diameter, conductor area, voltage rating and order length distinct', () => {
    const cableSpecs = [
      ['H07RN-F-2X1.5', 2, 1.5, [8.5, 9.9]],
      ['H07RN-F-3G1.5', 3, 1.5, [9.2, 10.7]],
      ['H07RN-F-3G2.5', 3, 2.5, [10.9, 12.5]],
      ['H07RN-F-5G1.5', 5, 1.5, [11.2, 12.8]]
    ] as const;
    for (const [code, cores, crossSection, diameter] of cableSpecs) {
      const cable = product(code);
      expect(cable.unit).toBe('m');
      expect(cable.metadata.cable_application).toBe('mains');
      expect(cable.metadata.cable_type).toBe('H07RN-F');
      expect(cable.metadata.cores).toBe(cores);
      expect(cable.metadata.wire_cross_section_mm2).toBe(crossSection);
      expect(cable.metadata.outer_diameter_range_mm).toEqual(diameter);
      expect(cable.metadata.diameter).toBe(`${diameter[0]}–${diameter[1]} mm`);
      expect(cable.metadata.rated_voltage).toBe('750 V');
      expect(cable.metadata.voltage).toBe(cable.metadata.rated_voltage);
      for (const field of ['voltage_v', 'diameter_mm', 'outer_diameter_mm', 'length_m', 'current_a']) {
        expect(field in cable.metadata).toBe(false);
      }
    }
  });

  it('rejects malformed cable diameters and conductor counts before generating SQL', () => {
    for (const patch of [
      { outer_diameter_range_mm: [10.7, 9.2] },
      { outer_diameter_range_mm: [9.2] },
      { outer_diameter_range_mm: [0, 10.7] },
      { outer_diameter_range_mm: ['9.2', '10.7'] },
      { outer_diameter_mm: -9.2 },
      { outer_diameter_mm: 9.2 },
      { cores: 0 }, { cores: 1.5 }, { cores: '3' }
    ]) {
      const copy: any = structuredClone(batch);
      Object.assign(copy.products.find((entry: any) => entry.code === 'H07RN-F-3G1.5').metadata, patch);
      let rejected = false;
      try { validateCatalog(copy); } catch { rejected = true; }
      expect(rejected).toBe(true);
    }
    const exactDiameter: any = structuredClone(batch);
    const metadata = exactDiameter.products.find((entry: any) => entry.code === 'H07RN-F-3G1.5').metadata;
    delete metadata.outer_diameter_range_mm;
    metadata.outer_diameter_mm = 10;
    expect(validateCatalog(exactDiameter)).toBe(exactDiameter);
  });
});
