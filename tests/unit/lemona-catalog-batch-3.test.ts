import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import initial from '../../supabase/catalogs/lemona-2026-10-30.json';
import expansion from '../../supabase/catalogs/lemona-2026-10-30-expansion.json';
import batch from '../../supabase/catalogs/lemona-2026-10-30-batch-3.json';
import { catalogSources, renderMigration, validateCatalog, validateCatalogSet } from '../../scripts/catalog/generate-lemona-seed.mjs';
import { mergeCatalogMetadata } from '../../src/lib/materials/catalog-metadata';

const product = (code: string) => batch.products.find((entry) => entry.code === code)!;

describe('third additive Lemona catalog', () => {
  it('preserves both published manifests and migrations exactly', () => {
    const hashes = [
      ['f18fe48ea5835d53bffa3bef51517e1958f2a1d980bc29eee592e6b1823a38fb',
        'da68e080bc24ca055c000c57f71d4a85cc785fb01ff6c6853d49030ad550456c'],
      ['67613f92e2e656b6ab35d93f3f3a856d7918c1a01449cdb0c641d6bc0a45ee1e',
        'd2cdc70f97f05b7dbc6aa4ed87a7e3e24538d03230686fd438aafe107eac9320']
    ];
    for (const [index, source] of catalogSources.slice(0, 2).entries()) {
      expect(source.immutable).toBe(true);
      for (const [fieldIndex, path] of [source.manifestPath, source.migrationPath].entries()) {
        expect(createHash('sha256').update(readFileSync(resolve(process.cwd(), path))).digest('hex'))
          .toBe(hashes[index][fieldIndex]);
      }
    }
  });

  it('adds 18 verified products to make 80 distinct catalog codes', () => {
    const catalogs = [initial, expansion, batch];
    expect(validateCatalogSet(catalogs)).toBe(catalogs);
    expect(batch.products.length).toBe(18);
    expect(new Set(catalogs.flatMap((catalog) => catalog.products.map((entry) => entry.code))).size).toBe(80);
    expect(batch.products.every((entry) => entry.metadata.source_kind === 'product_page')).toBe(true);
    const counts = batch.products.reduce((result, entry) => {
      result[entry.category] = (result[entry.category] ?? 0) + 1;
      return result;
    }, {} as Record<string, number>);
    expect(counts).toEqual({
      PSU_MEANWELL: 4, LED_STRIP: 3, LED_NEON: 1, LED_MODULE: 1,
      WIRE: 3, FDM_OTHER: 4, RESIN_OTHER: 2
    });
    const source = catalogSources.find((entry) => entry.id === batch.catalog_id)!;
    expect(readFileSync(resolve(process.cwd(), source.migrationPath), 'utf8')).toBe(renderMigration(batch));
  });

  it('separates maximum power and fixed white channels from nominal power and tunable CCT', () => {
    const fiveVolt = product('S010060CA4SA1').metadata;
    const twelveVolt = product('S012060CB4SA1').metadata;
    expect(fiveVolt.max_watts_per_m).toBe(14);
    expect(twelveVolt.max_watts_per_m).toBe(32);
    expect(fiveVolt.white_channel_temperature_range_k).toEqual([6000, 6500]);
    expect(twelveVolt.white_channel_temperature_k).toBe(4000);
    for (const metadata of [fiveVolt, twelveVolt]) {
      expect('watts_per_m' in metadata).toBe(false);
      expect('color_temperature_range_k' in metadata).toBe(false);
      expect(metadata.control_ic).toBe('SK6812');
    }
    expect(product('COB-RGBCCT840-21-24').metadata.color_temperature_range_k).toEqual([3000, 6500]);
    expect(product('LM-3096-RGBW-CRI').metadata.white_channel_temperature_k).toBe(6500);
  });

  it('preserves leading-zero identity and distinguishes package units and physical body dimensions', () => {
    const wireReel = product('0049001');
    expect(wireReel.sku).toBe('0049001');
    expect(wireReel.metadata.manufacturer_part_number).toBe('0049001');
    expect(wireReel.unit).toBe('roll');
    expect(wireReel.metadata.length_m).toBe(100);
    const cutWire = product('LIYCY-2X0.75');
    expect(cutWire.unit).toBe('m');
    expect(cutWire.metadata.length_m).toBe(100);
    expect(product('AFN-60C14424HS-RGB').unit).toBe('m');
    expect(product('REF-PCTG-BLACK').metadata.package_type).toBe('refill');
    const slimPsu = product('SLD-50-12').metadata;
    expect(slimPsu.power_w).toBe(50.4);
    expect(slimPsu.body_length_mm).toBe(280);
    expect('length_m' in slimPsu).toBe(false);
    expect(batch.products.every((entry) => entry.thickness_options.length === 0)).toBe(true);
  });

  it('leaves conflicting resin quantities absent instead of converting litres into kilograms', () => {
    for (const code of ['TGM-7-GRP-100', 'XVN-50-BLP-100']) {
      const resin = product(code);
      expect(resin.unit).toBe('PCS');
      expect('weight_kg' in resin.metadata).toBe(false);
      expect('volume_ml' in resin.metadata).toBe(false);
      expect(Boolean(resin.metadata.data_notes && resin.metadata.manufacturer_source_url)).toBe(true);
    }
  });

  it('rejects malformed maximum power, white-channel ranges and body dimensions', () => {
    for (const patch of [
      { max_watts_per_m: -14 },
      { max_watts_per_m: '14' },
      { white_channel_temperature_k: 0 },
      { white_channel_temperature_range_k: [6500, 6000] },
      { white_channel_temperature_range_k: [6000] },
      { body_length_mm: Number.NaN }
    ]) {
      const copy: any = structuredClone(batch);
      Object.assign(copy.products[0].metadata, patch);
      let rejected = false;
      try { validateCatalog(copy); } catch { rejected = true; }
      expect(rejected).toBe(true);
    }
  });

  it('invalidates edited maximum power and white-channel specs without discarding unrelated evidence', () => {
    for (const code of ['S010060CA4SA1', 'S012060CB4SA1']) {
      const existing = product(code).metadata;
      const updated = mergeCatalogMetadata(existing, { wattage: 'Different rating', colorTemp: undefined });
      expect('max_watts_per_m' in updated).toBe(false);
      expect('white_channel_temperature_k' in updated).toBe(false);
      expect('white_channel_temperature_range_k' in updated).toBe(false);
      expect(updated.voltage_v).toBe(existing.voltage_v);
      expect(updated.control_ic).toBe('SK6812');
      expect(updated.source_url).toBe(existing.source_url);
      expect(mergeCatalogMetadata(existing, { wattage: ` ${existing.wattage} `, colorTemp: existing.colorTemp }))
        .toEqual(existing);
    }
  });

  it('invalidates physical length only on a length edit, not a packaging edit', () => {
    const existing = product('SLD-50-12').metadata;
    const repackaged = mergeCatalogMetadata(existing, { packSize: 'Box of two' });
    expect(repackaged.body_length_mm).toBe(280);
    const resized = mergeCatalogMetadata(existing, { length: '300 mm' });
    expect('body_length_mm' in resized).toBe(false);
    expect(resized.width_mm).toBe(30);
    expect(resized.height_mm).toBe(16.8);
    expect(resized.power_w).toBe(50.4);
  });
});
