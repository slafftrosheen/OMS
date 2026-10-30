import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import initial from '../../supabase/catalogs/lemona-2026-10-30.json';
import expansion from '../../supabase/catalogs/lemona-2026-10-30-expansion.json';
import { catalogSources, renderMigration, validateCatalog, validateCatalogSet } from '../../scripts/catalog/generate-lemona-seed.mjs';
import { mergeCatalogMetadata } from '../../src/lib/materials/catalog-metadata';

const product = (code: string) => expansion.products.find((entry) => entry.code === code)!;

function rejects(action: () => unknown) {
  let rejected = false;
  try { action(); } catch { rejected = true; }
  expect(rejected).toBe(true);
}

describe('additive Lemona catalog expansion', () => {
  it('keeps the published initial manifest and SQL byte-for-byte unchanged', () => {
    const original = catalogSources[0];
    const hash = (path: string) => createHash('sha256').update(readFileSync(resolve(process.cwd(), path))).digest('hex');
    expect(original.immutable).toBe(true);
    expect(hash(original.manifestPath)).toBe('f18fe48ea5835d53bffa3bef51517e1958f2a1d980bc29eee592e6b1823a38fb');
    expect(hash(original.migrationPath)).toBe('da68e080bc24ca055c000c57f71d4a85cc785fb01ff6c6853d49030ad550456c');
    expect(renderMigration(initial)).toBe(readFileSync(resolve(process.cwd(), original.migrationPath), 'utf8'));
  });

  it('adds 20 distinct products with direct supplier pages and existing picker categories', () => {
    expect(validateCatalog(expansion)).toBe(expansion);
    expect(validateCatalogSet([initial, expansion])).toEqual([initial, expansion]);
    expect(expansion.products.length).toBe(20);
    const counts = expansion.products.reduce((result, entry) => {
      result[entry.category] = (result[entry.category] ?? 0) + 1;
      return result;
    }, {} as Record<string, number>);
    expect(counts).toEqual({
      PSU_MEANWELL: 3, LED_STRIP: 5, LED_NEON: 1, LED_MODULE: 3,
      LED_ACCESSORY: 2, WIRE: 3, FDM_OTHER: 1, FDM_TPU: 1, RESIN_OTHER: 1
    });
    expect(expansion.products.every((entry) => entry.metadata.source_kind === 'product_page')).toBe(true);
    expect(new Set([...initial.products, ...expansion.products].map((entry) => entry.code)).size).toBe(62);
    const source = catalogSources.find((entry) => entry.id === expansion.catalog_id)!;
    expect(readFileSync(resolve(process.cwd(), source.migrationPath), 'utf8')).toBe(renderMigration(expansion));
  });

  it('distinguishes reel purchases, metre purchases and volume-only resin packages', () => {
    for (const code of ['AFLP-168B28824M-CCT', 'NF-612-12V-NW']) {
      expect(product(code).unit).toBe('roll');
      expect(product(code).metadata.length_m).toBe(5);
    }
    const wire = product('BVV-P/3x2.5');
    expect(wire.unit).toBe('m');
    expect(wire.metadata.length_m).toBe(25);
    const resin = product('PCR-18260');
    expect(resin.unit).toBe('PCS');
    expect(resin.metadata.volume_ml).toBe(500);
    expect('weight_kg' in resin.metadata).toBe(false);
    expect(product('PA12-15CF-175-050').metadata.weight_kg).toBe(0.5);
    expect(product('F40-BLACK-175-085').metadata.weight_kg).toBe(0.85);
    expect(expansion.products.every((entry) => entry.thickness_options.length === 0)).toBe(true);
  });

  it('keeps manufacturer ratings, tunable color and uncertain values distinct', () => {
    expect(product('LRS-50-12').metadata.power_w).toBe(50.4);
    expect(product('HLG-120H-24A').metadata.ip_rating).toBe('IP65');
    expect(product('HDR-60-24').metadata.mounting).toBe('DIN rail');
    expect(product('AFLP-168B28824M-CCT').metadata.color_temperature_range_k).toEqual([2700, 6500]);
    expect('color_temperature_k' in product('AFLP-168B28824M-CCT').metadata).toBe(false);
    expect(product('221-612').metadata.wire_cross_section_max_mm2).toBe(6);
    expect('wire_cross_section_range_mm2' in product('221-612').metadata).toBe(false);
    expect('power_w' in product('LEDM-EDGE-144W').metadata).toBe(false);
    expect(Boolean(product('LEDM-EDGE-144W').metadata.data_notes)).toBe(true);
  });

  it('rejects duplicate codes across manifests instead of silently refreshing earlier products', () => {
    const copy: any = structuredClone(expansion);
    const code = initial.products[0].code;
    Object.assign(copy.products[0], { code, sku: code });
    Object.assign(copy.products[0].metadata, { model: code, supplier_product_code: code, short_name: code });
    expect(validateCatalog(copy)).toBe(copy);
    rejects(() => validateCatalogSet([initial, copy]));
    rejects(() => validateCatalogSet([initial, initial]));
  });

  it('rejects missing PSU ratings and invalid new units or numeric ranges', () => {
    for (const mutate of [
      (copy: any) => { delete copy.products[0].metadata.power_w; },
      (copy: any) => { copy.products[0].metadata.volume_ml = -1; },
      (copy: any) => { copy.products[0].metadata.width_mm = '6'; },
      (copy: any) => { copy.products[0].metadata.color_temperature_range_k = [6500, 2700]; },
      (copy: any) => { copy.products[0].metadata.wire_cross_section_range_mm2 = [0.14]; },
      (copy: any) => { copy.products[0].metadata.color_temperature_range_k = [2700, null]; }
    ]) {
      const copy = structuredClone(expansion);
      mutate(copy);
      rejects(() => validateCatalog(copy));
    }
  });
});

describe('package specification edits', () => {
  it('clears sourced volume or net weight when the visible weight field changes', () => {
    const resin = product('PCR-18260').metadata;
    const editedResin = mergeCatalogMetadata(resin, { weight: '1000 ml' });
    expect(editedResin.weight).toBe('1000 ml');
    expect('volume_ml' in editedResin).toBe(false);
    expect(editedResin.source_url).toBe(resin.source_url);
    expect(resin.volume_ml).toBe(500);

    const filament = product('PA12-15CF-175-050').metadata;
    const editedFilament = mergeCatalogMetadata(filament, { weight: undefined });
    expect('weight_kg' in editedFilament).toBe(false);
    expect(editedFilament.diameter_mm).toBe(1.75);
  });

  it('clears package quantities when the package label changes or is removed', () => {
    for (const [code, packSize, numericKey] of [
      ['PCR-18260', '1 L bottle', 'volume_ml'],
      ['PA12-15CF-175-050', '1 kg spool', 'weight_kg'],
      ['AFLP-168B28824M-CCT', undefined, 'length_m']
    ] as const) {
      const existing = product(code).metadata;
      const updated = mergeCatalogMetadata(existing, { packSize });
      expect(numericKey in updated).toBe(false);
      expect(updated.packSize).toBe(packSize);
      expect(updated.model).toBe(existing.model);
      expect(updated.source_url).toBe(existing.source_url);
    }
  });

  it('preserves product dimensions and electrical specs when the package label changes', () => {
    const existing = { ...product('NF-612-12V-NW').metadata, customReference: 'Workshop A' };
    const updated = mergeCatalogMetadata(existing, { packSize: 'Cut length supplied separately' });
    expect('length_m' in updated).toBe(false);
    expect(updated.width_mm).toBe(6);
    expect(updated.height_mm).toBe(12);
    expect(updated.cut_interval_mm).toBe(10);
    expect(updated.voltage_v).toBe(12);
    expect(updated.watts_per_m).toBe(7.2);
    expect(updated.customReference).toBe('Workshop A');
  });

  it('preserves confirmed quantities for untouched or whitespace-equivalent labels', () => {
    for (const code of ['PCR-18260', 'PA12-15CF-175-050', 'NF-612-12V-NW']) {
      const existing = product(code).metadata;
      const updated = mergeCatalogMetadata(existing, {
        packSize: `  ${existing.packSize}  `,
        weight: existing.weight ? ` ${existing.weight} ` : undefined
      });
      expect(updated).toEqual(existing);
    }
  });
});
