import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mergeCatalogMetadata } from '../../src/lib/materials/catalog-metadata';
import { getMaterialSpecificationFacts } from '../../src/lib/materials/catalog-presentation';

const products = ['lemona-2026-10-30-expansion', 'lemona-2026-10-30-batch-3']
  .flatMap(id => JSON.parse(readFileSync(`supabase/catalogs/${id}.json`, 'utf8')).products);
const product = (code: string) => products.find(row => row.code === code)!;
const facts = (row: any, metadata: Record<string, unknown>) => Object.fromEntries(
  getMaterialSpecificationFacts({ ...row, metadata }).map(fact => [fact.key, fact.value])
);

describe('edited catalog package quantities', () => {
  it('replaces the old resin volume with explicit edited text while retaining bottle context', () => {
    const row = product('PCR-18260');
    const original = structuredClone(row.metadata);
    const edited = mergeCatalogMetadata(row.metadata, { weight: '1000 ml', packSize: row.metadata.packSize });
    expect(edited.packSize).toBe('bottle');
    expect(edited.weight).toBe('1000 ml');
    expect(edited.volume_ml).toBe(undefined);
    expect(edited.weight_kg).toBe(undefined);
    expect(facts(row, edited).package).toBe('bottle · 1000 ml');
    expect(edited.source_url).toBe(original.source_url);
    expect(row.metadata).toEqual(original);
  });

  it('clears obsolete filament weight without losing refill and spool context', () => {
    const row = product('REF-PCTG-BLACK');
    for (const weight of ['1 kg', undefined]) {
      const edited = mergeCatalogMetadata(row.metadata, { packSize: row.metadata.packSize, weight });
      expect(edited.packSize).toBe('refill; spool not included');
      expect(edited.weight_kg).toBe(undefined);
      expect(edited.diameter_mm).toBe(1.75);
      expect(facts(row, edited).package).toBe(weight
        ? 'refill; spool not included · 1 kg' : 'refill; spool not included');
    }
  });

  it('edits or clears a reel length without displaying its old quantity', () => {
    const row = product('AFLP-168B28824M-CCT');
    const existing = { ...row.metadata, length: '5 m' };
    for (const length of ['10 m', undefined]) {
      const edited = mergeCatalogMetadata(existing, { length, packSize: existing.packSize });
      expect(edited.packSize).toBe('reel');
      expect(edited.length_m).toBe(undefined);
      expect(facts(row, edited).package).toBe(length ? 'reel · 10 m' : 'reel');
      expect(edited.voltage_v).toBe(existing.voltage_v);
    }
  });

  it('does not restore unchanged legacy quantities after a package edit or clear', () => {
    const filament = product('REF-PCTG-BLACK');
    const reel = product('AFLP-168B28824M-CCT');
    for (const packSize of ['Different package; quantity unconfirmed', undefined]) {
      const changedFilament = mergeCatalogMetadata(filament.metadata, {
        packSize, weight: filament.metadata.weight
      });
      expect(changedFilament.weight).toBe(undefined);
      expect(changedFilament.weight_kg).toBe(undefined);
      expect(facts(filament, changedFilament).package).toBe(packSize);
      const changedReel = mergeCatalogMetadata({ ...reel.metadata, length: '5 m' }, {
        length: '5 m', packSize
      });
      expect(changedReel.length).toBe(undefined);
      expect(changedReel.length_m).toBe(undefined);
      expect(facts(reel, changedReel).package).toBe(packSize);
    }
  });

  it('preserves explicitly changed quantities alongside a simultaneously edited package without conversion', () => {
    const row = product('PCR-18260');
    const edited = mergeCatalogMetadata(row.metadata, { packSize: '1 L bottle', weight: '1000 ml' });
    expect(edited.packSize).toBe('1 L bottle');
    expect(edited.weight).toBe('1000 ml');
    expect(edited.volume_ml).toBe(undefined);
    expect(edited.weight_kg).toBe(undefined);
    expect(facts(row, edited).package).toBe('1 L bottle · 1000 ml');
  });

  it('keeps body and hardware dimensions when only the packaging changes', () => {
    const row = product('SLD-50-12');
    const edited = mergeCatalogMetadata(row.metadata, { packSize: 'Box of two', length: row.metadata.length });
    expect(edited.length).toBe('280 mm');
    expect(edited.body_length_mm).toBe(280);
    expect(edited.width_mm).toBe(30);
    expect(edited.height_mm).toBe(16.8);
    expect(facts(row, edited).bodyLength).toBe('280 mm');
    expect(facts(row, edited).package).toBe('Box of two');
    const hardware = mergeCatalogMetadata({ length: 'M4x20', packSize: '100 pcs' }, { packSize: '50 pcs' });
    expect(hardware.length).toBe('M4x20');
  });

  it('preserves unchanged source quantities and unquantified packaging labels', () => {
    const row = product('REF-PCTG-BLACK');
    expect(mergeCatalogMetadata(row.metadata, {
      weight: ` ${row.metadata.weight} `, packSize: ` ${row.metadata.packSize} `
    })).toEqual(row.metadata);
    const edited = mergeCatalogMetadata({ weight: '1 kg', weight_kg: 1, packSize: '1 spool' }, { weight: undefined });
    expect(facts({ category: 'FDM_PLA' }, edited).package).toBe('1 spool');
    expect(mergeCatalogMetadata({ weight: '500 ml', packSize: '500 ml' }, { weight: undefined }).packSize)
      .toBe(undefined);
  });

  it('preserves explicit unknown quantities and cleans simple measurement wrappers without inventing a value', () => {
    const edited = mergeCatalogMetadata({ weight: '0,75 kg', packSize: 'Refill (0,75 kg); spool not included' }, {
      weight: 'Quantity to be confirmed'
    });
    expect(facts({ category: 'FDM_OTHER' }, edited).package)
      .toBe('Refill; spool not included · Quantity to be confirmed');
    expect(edited.weight_kg).toBe(undefined);
    expect(edited.volume_ml).toBe(undefined);
  });
});
