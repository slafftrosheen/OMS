import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import catalog from '../../supabase/catalogs/workshop-aluminium-2026-10-31.json';
import { filterProfileMaterials } from '../../src/lib/profiles/material-roles';
import type { CatalogMaterial } from '../../src/lib/profiles/material-catalog';
import { createCatalogThicknessOptions } from '../../src/lib/materials/thickness-options';

const sql = readFileSync('supabase/migrations/20261031000002_workshop_aluminium_sheets.sql', 'utf8');

describe('workshop aluminium sheet definition', () => {
  it('records the exact owner-specified format and all nine thickness choices', () => {
    expect(catalog.products.length).toBe(1);
    const sheet = catalog.products[0];
    expect(sheet.category).toBe('ALU_SHEET');
    expect(sheet.thickness_options).toEqual([0.5, 1, 1.5, 2, 3, 5, 8, 10, 15]);
    expect(sheet.metadata.sheet_width_mm).toBe(1500);
    expect(sheet.metadata.sheet_length_mm).toBe(3000);
    expect(createCatalogThicknessOptions(sheet.thickness_options).map(option => option.thickness))
      .toEqual(sheet.thickness_options);
  });

  it('separates the workshop specification from supplier-branded catalog evidence', () => {
    const sheet = catalog.products[0];
    expect(catalog.source_kind).toBe('workshop_specification');
    expect(sheet.metadata.source_kind).toBe('workshop_specification');
    for (const field of ['brand', 'alloy', 'supplier', 'source_url', 'price', 'stock', 'finish']) {
      expect(field in sheet).toBe(false);
      expect(field in sheet.metadata).toBe(false);
    }
    expect(sheet.metadata.catalog_seed).toBe(catalog.catalog_id);
  });

  it('offers the new family as a sheet and never as frame flatstock', () => {
    const sheet = { id: 1, ...catalog.products[0] } as CatalogMaterial;
    for (const role of ['face', 'back', 'sides'] as const) expect(filterProfileMaterials([sheet], role)).toEqual([sheet]);
    expect(filterProfileMaterials([sheet], 'frame')).toEqual([]);
  });

  it('keeps migration data identical to the reviewable manifest', () => {
    const payload = sql.match(/\$workshop_materials\$([\s\S]+?)\$workshop_materials\$/)?.[1];
    expect(Boolean(payload)).toBe(true);
    expect(JSON.parse(payload || 'null')).toEqual(catalog.products);
  });
});
