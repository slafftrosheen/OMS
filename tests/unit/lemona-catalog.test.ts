import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import catalog from '../../supabase/catalogs/lemona-2026-10-30.json';
import { migrationPath, renderMigration, validateCatalog } from '../../scripts/catalog/generate-lemona-seed.mjs';
import { getLemonaSourceUrl, mergeCatalogMetadata } from '../../src/lib/materials/catalog-metadata';

describe('sourced Lemona catalog', () => {
  it('validates complete product identity, sources and picker categories', () => {
    expect(validateCatalog(catalog)).toBe(catalog);
    const counts = catalog.products.reduce((result, product) => {
      result[product.category] = (result[product.category] ?? 0) + 1;
      return result;
    }, {} as Record<string, number>);
    expect(counts).toEqual({ PSU_MEANWELL: 12, LED_STRIP: 8, LED_MODULE: 2,
      WIRE: 6, LED_ACCESSORY: 3, FDM_PLA: 3, FDM_PETG: 2, FDM_ASA: 1,
      FDM_ABS: 2, FDM_TPU: 1, RESIN_ANYCUBIC: 2 });
    expect(readFileSync(resolve(process.cwd(), migrationPath), 'utf8')).toBe(renderMigration(catalog));
  });

  it('does not turn electrical series names into incorrect rated power', () => {
    const powers = Object.fromEntries(catalog.products.filter((p) => p.category === 'PSU_MEANWELL')
      .map((p) => [p.code, p.metadata.power_w]));
    expect(powers['LRS-100N2-24']).toBe(108);
    expect(powers['LRS-150-24']).toBe(156);
    expect(powers['LRS-350-12']).toBe(348);
    expect(powers['XLG-200-12-A']).toBe(192);
  });

  it('keeps conflicting or unavailable specifications absent and qualified', () => {
    const led = catalog.products.find((p) => p.code === '476845')!;
    const resin = catalog.products.find((p) => p.code === 'SCRWH-10-IPO-01')!;
    const tpu = catalog.products.find((p) => p.code === 'TPU96A-BLACK-175-05R')!;
    expect('color_temperature_k' in led.metadata).toBe(false);
    expect('weight_kg' in resin.metadata).toBe(false);
    expect(resin.metadata.source_kind).toBe('catalog_listing');
    expect(Boolean(led.metadata.data_notes && resin.metadata.data_notes && tpu.metadata.data_notes)).toBe(true);
  });

  it('rejects duplicate identity, missing sources, and accidental stock or price imports', () => {
    for (const mutate of [
      (copy: any) => copy.products.push(copy.products[0]),
      (copy: any) => { copy.products[0].metadata.source_url = 'https://example.com'; },
      (copy: any) => { copy.products[0].stock = 200; },
      (copy: any) => { copy.products[0].price = 9.99; },
      (copy: any) => { copy.products[0].thickness_options = [1.75]; }
    ]) {
      const copy = structuredClone(catalog);
      mutate(copy);
      let rejected = false;
      try { validateCatalog(copy); } catch { rejected = true; }
      expect(rejected).toBe(true);
    }
  });
});

describe('catalog edits and source links', () => {
  it('preserves full identity, sourced specs and custom metadata when editing a visible field', () => {
    const existing = { ...catalog.products[0].metadata, customReference: 'Workshop A', transparent: false };
    const updated = mergeCatalogMetadata(existing, { brand: existing.brand, voltage: existing.voltage, type: 'Enclosed PSU' });
    expect(updated.source_url).toBe(existing.source_url);
    expect(updated.short_name).toBe(existing.short_name);
    expect(updated.voltage_v).toBe(existing.voltage_v);
    expect(updated.customReference).toBe('Workshop A');
    expect(updated.transparent).toBe(false);
    expect(updated.type).toBe('Enclosed PSU');
    expect(existing.type).toBe('Power supply');
  });

  it('clears obsolete structured specifications only when their visible fields change', () => {
    const existing = { voltage: '12 V DC', voltage_v: 12, wattage: '60 W', power_w: 60, ip_rating: 'IP67', ipRating: 'IP67' };
    const updated = mergeCatalogMetadata(existing, { voltage: '24 V DC', wattage: undefined, ipRating: ' IP67 ' });
    expect(updated.voltage).toBe('24 V DC');
    expect('voltage_v' in updated).toBe(false);
    expect('wattage' in updated).toBe(false);
    expect('power_w' in updated).toBe(false);
    expect(updated.ip_rating).toBe('IP67');
    expect(mergeCatalogMetadata({ voltage: 12, voltage_v: 12 }, { voltage: 12 }))
      .toEqual({ voltage: '12', voltage_v: 12 });
  });

  it('accepts only HTTPS links to the supplier without credentials or unexpected ports', () => {
    expect(getLemonaSourceUrl(catalog.products[0].metadata.source_url)).toBe(catalog.products[0].metadata.source_url);
    for (const url of [undefined, 'javascript:alert(1)', 'http://www.lemona.lv/a',
      'https://lemona.lv.evil.test/a', 'https://evil.test@lemona.lv/a', 'https://lemona.lv:8443/a']) {
      expect(getLemonaSourceUrl(url)).toBe(null);
    }
  });
});
