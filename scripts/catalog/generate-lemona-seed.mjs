#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Published snapshots stay immutable. Add a new entry for an additive catalog;
// never regenerate a migration which may already appear in deployment history.
export const catalogSources = [
  {
    id: 'lemona-2026-10-30', verifiedAt: '2026-10-30', immutable: true,
    manifestPath: 'supabase/catalogs/lemona-2026-10-30.json',
    migrationPath: 'supabase/migrations/20261030000001_lemona_branded_catalog.sql',
    temporaryTable: 'lemona_catalog_20261030'
  },
  {
    id: 'lemona-2026-10-30-expansion', verifiedAt: '2026-10-30', immutable: true,
    manifestPath: 'supabase/catalogs/lemona-2026-10-30-expansion.json',
    migrationPath: 'supabase/migrations/20261030000002_lemona_catalog_expansion.sql',
    temporaryTable: 'lemona_catalog_20261030_expansion'
  },
  {
    id: 'lemona-2026-10-30-batch-3', verifiedAt: '2026-10-30', immutable: true,
    manifestPath: 'supabase/catalogs/lemona-2026-10-30-batch-3.json',
    migrationPath: 'supabase/migrations/20261030000003_lemona_catalog_batch_3.sql',
    temporaryTable: 'lemona_catalog_20261030_batch_3'
  }
];
// Preserve the original exports for callers that specifically inspect the first seed.
export const { manifestPath, migrationPath } = catalogSources[0];
const delimiter = '$lemona_catalog$';
const categories = new Set([
  'PSU_MEANWELL', 'WIRE', 'LED_STRIP', 'LED_MODULE', 'LED_NEON', 'LED_ACCESSORY',
  'FDM_PLA', 'FDM_PETG', 'FDM_ABS', 'FDM_ASA', 'FDM_TPU', 'FDM_OTHER',
  'RESIN_ANYCUBIC', 'RESIN_OTHER'
]);
const productFields = new Set([
  'category', 'code', 'sku', 'name_en', 'name_ru', 'name_lv',
  'thickness_options', 'unit', 'section', 'item_group', 'supplier', 'vendor', 'metadata'
]);

export function validateCatalog(catalog) {
  const source = catalogSources.find((entry) => entry.id === catalog?.catalog_id);
  if (!source || catalog.schema_version !== 1
    || catalog.verified_at !== source.verifiedAt || !Array.isArray(catalog.products)
    || catalog.products.length === 0) throw new Error('Invalid Lemona catalog header');
  const codes = new Set();
  for (const product of catalog.products) {
    if (Object.keys(product).some((key) => !productFields.has(key))) {
      throw new Error(`Unexpected product field (inventory balances and prices are not seed data): ${product.code}`);
    }
    if (typeof product.code !== 'string' || !product.code.trim() || codes.has(product.code)
      || product.sku !== product.code) throw new Error(`Invalid or duplicate product code: ${product.code}`);
    codes.add(product.code);
    if (!categories.has(product.category) || !['PCS', 'm', 'roll'].includes(product.unit)
      || !['electronics', '3dprinting'].includes(product.section)) {
      throw new Error(`Invalid picker category, unit or section: ${product.code}`);
    }
    if (!Array.isArray(product.thickness_options) || product.thickness_options.length !== 0) {
      throw new Error(`Non-sheet products must not expose sheet thickness: ${product.code}`);
    }
    for (const field of ['name_en', 'name_ru', 'name_lv', 'supplier', 'vendor', 'item_group']) {
      if (typeof product[field] !== 'string' || !product[field].trim()) {
        throw new Error(`Missing ${field}: ${product.code}`);
      }
    }
    const metadata = product.metadata;
    if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object'
      || metadata.model !== product.code || metadata.supplier_product_code !== product.code
      || metadata.verified_at !== catalog.verified_at || metadata.catalog_seed !== catalog.catalog_id
      || !metadata.brand || !metadata.short_name?.includes(product.code)
      || !['product_page', 'catalog_listing'].includes(metadata.source_kind)) {
      throw new Error(`Missing product identity or provenance: ${product.code}`);
    }
    const source = new URL(metadata.source_url);
    if (source.protocol !== 'https:' || !['lemona.lv', 'www.lemona.lv'].includes(source.hostname)
      || source.username || source.password || source.port) {
      throw new Error(`Invalid supplier source: ${product.code}`);
    }
    for (const field of ['voltage_v', 'power_w', 'current_a', 'color_temperature_k',
      'watts_per_m', 'leds_per_m', 'length_m', 'wire_cross_section_mm2', 'diameter_mm', 'weight_kg',
      'width_mm', 'height_mm', 'body_length_mm', 'cut_interval_mm', 'volume_ml', 'wire_cross_section_max_mm2',
      'max_watts_per_m', 'white_channel_temperature_k',
      'beam_angle_deg', 'beam_angle_horizontal_deg', 'beam_angle_vertical_deg']) {
      if (field in metadata && (typeof metadata[field] !== 'number'
        || !Number.isFinite(metadata[field]) || metadata[field] <= 0)) {
        throw new Error(`Invalid ${field}: ${product.code}`);
      }
    }
    for (const field of ['color_temperature_range_k', 'white_channel_temperature_range_k', 'wire_cross_section_range_mm2',
      'solid_conductor_range_mm2', 'fine_stranded_conductor_range_mm2']) {
      const range = metadata[field];
      if (field in metadata && (!Array.isArray(range) || range.length !== 2
        || range.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
        || range[0] > range[1])) {
        throw new Error(`Invalid ${field}: ${product.code}`);
      }
    }
    if (product.category === 'PSU_MEANWELL') {
      if (['voltage_v', 'current_a', 'power_w'].some((field) => !Number.isFinite(metadata[field]))
        || Math.abs(metadata.voltage_v * metadata.current_a - metadata.power_w) > 0.01) {
        throw new Error(`Inconsistent rated PSU power: ${product.code}`);
      }
    }
  }
  if (JSON.stringify(catalog.products).includes(delimiter)) throw new Error('Unsafe SQL delimiter in catalog');
  return catalog;
}

export function validateCatalogSet(catalogs) {
  const ids = new Set();
  const codes = new Set();
  for (const catalog of catalogs) {
    validateCatalog(catalog);
    if (ids.has(catalog.catalog_id)) throw new Error(`Duplicate catalog: ${catalog.catalog_id}`);
    ids.add(catalog.catalog_id);
    for (const product of catalog.products) {
      if (codes.has(product.code)) throw new Error(`Product already exists in an earlier additive catalog: ${product.code}`);
      codes.add(product.code);
    }
  }
  return catalogs;
}

export function renderMigration(catalog) {
  validateCatalog(catalog);
  const source = catalogSources.find((entry) => entry.id === catalog.catalog_id);
  // One product per line keeps the migration auditable without duplicating the pretty manifest.
  const products = `[\n${catalog.products.map((product) => `  ${JSON.stringify(product)}`).join(',\n')}\n]`;
  return `-- Generated by scripts/catalog/generate-lemona-seed.mjs; do not edit by hand.
-- Source: ${source.manifestPath}; verified ${catalog.verified_at}; ${catalog.products.length} products.
-- Requires the canonical materials schema (20260217000000_unify_materials_inventory.sql).
-- Catalog data only. Existing stock, prices, units, SKU and business fields are preserved.
-- Source limitations and deployment notes: supabase/catalogs/README.md.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
DECLARE
  missing_columns text[];
BEGIN
  IF to_regclass('public.materials') IS NULL THEN
    RAISE EXCEPTION 'Lemona seed requires public.materials; apply the canonical materials migrations first';
  END IF;
  SELECT array_agg(required.name) INTO missing_columns
  FROM unnest(ARRAY['id', 'code', 'sku', 'category', 'name_en', 'name_ru', 'name_lv',
    'thickness_options', 'metadata', 'unit', 'section', 'item_group', 'supplier', 'vendor',
    'stock', 'price', 'created_at', 'updated_at']) AS required(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'materials' AND c.column_name = required.name
  );
  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Lemona seed requires the unified materials schema. Missing columns: %', missing_columns;
  END IF;
END
$preflight$;

CREATE TEMPORARY TABLE ${source.temporaryTable} ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset(${delimiter}
${products}
${delimiter}::jsonb) AS p(
  category text, code text, sku text, name_en text, name_ru text, name_lv text,
  thickness_options jsonb, unit text, section text, item_group text, supplier text,
  vendor text, metadata jsonb
);

-- Never silently merge a catalog model into an existing inventory row with a different code.
-- The entire transaction is aborted for manual reconciliation when identities collide.
DO $identity_check$
DECLARE
  conflicting_code text;
BEGIN
  SELECT p.code INTO conflicting_code
  FROM ${source.temporaryTable} p
  JOIN public.materials m ON m.sku = p.sku AND m.code <> p.code
  LIMIT 1;
  IF conflicting_code IS NOT NULL THEN
    RAISE EXCEPTION 'Lemona seed SKU collision for %. Reconcile the existing material code before retrying', conflicting_code;
  END IF;

  SELECT p.code INTO conflicting_code
  FROM ${source.temporaryTable} p
  JOIN public.materials m ON m.code = p.code
  WHERE NULLIF(m.metadata->>'brand', '') IS NOT NULL
    AND regexp_replace(lower(m.metadata->>'brand'), '[^[:alnum:]]', '', 'g')
      <> regexp_replace(lower(p.metadata->>'brand'), '[^[:alnum:]]', '', 'g')
  LIMIT 1;
  IF conflicting_code IS NOT NULL THEN
    RAISE EXCEPTION 'Lemona seed brand conflict for %. Review product identity before retrying', conflicting_code;
  END IF;
END
$identity_check$;

INSERT INTO public.materials AS existing (
  category, code, sku, name_en, name_ru, name_lv, thickness_options,
  unit, section, item_group, supplier, vendor, metadata
)
SELECT category, code, sku, name_en, name_ru, name_lv, thickness_options,
  unit, section, item_group, supplier, vendor, metadata
FROM ${source.temporaryTable}
ON CONFLICT (code) DO UPDATE SET
  category = EXCLUDED.category,
  name_en = EXCLUDED.name_en,
  name_ru = EXCLUDED.name_ru,
  name_lv = EXCLUDED.name_lv,
  thickness_options = EXCLUDED.thickness_options,
  metadata = COALESCE(existing.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = now()
WHERE (existing.category, existing.name_en, existing.name_ru, existing.name_lv,
  existing.thickness_options, existing.metadata)
IS DISTINCT FROM (EXCLUDED.category, EXCLUDED.name_en, EXCLUDED.name_ru, EXCLUDED.name_lv,
  EXCLUDED.thickness_options, COALESCE(existing.metadata, '{}'::jsonb) || EXCLUDED.metadata);

COMMIT;
`;
}

function main() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const catalogs = validateCatalogSet(catalogSources.map((source) =>
    JSON.parse(readFileSync(resolve(root, source.manifestPath), 'utf8'))));
  // Validate every immutable snapshot before writing any new migration.
  const rendered = catalogs.map((catalog) => ({ catalog, sql: renderMigration(catalog) }));
  for (const [index, source] of catalogSources.entries()) {
    if ((source.immutable || process.argv.includes('--check'))
      && readFileSync(resolve(root, source.migrationPath), 'utf8') !== rendered[index].sql) {
      throw new Error(source.immutable
        ? `Published catalog ${source.id} changed. Restore it and add a new dated catalog instead.`
        : `${source.migrationPath} is out of date. Run node scripts/catalog/generate-lemona-seed.mjs`);
    }
  }
  for (const [index, source] of catalogSources.entries()) {
    const { catalog, sql } = rendered[index];
    if (process.argv.includes('--check') || source.immutable) {
      console.log(`Validated ${source.id}: ${catalog.products.length} products; migration unchanged.`);
    } else {
      writeFileSync(resolve(root, source.migrationPath), sql);
      console.log(`Generated ${source.migrationPath} (${catalog.products.length} products). No database was contacted.`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
