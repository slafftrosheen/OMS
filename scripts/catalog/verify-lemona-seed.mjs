#!/usr/bin/env node
// Optional offline integration check. Uses an isolated in-memory PostgreSQL engine;
// no Supabase URL, credentials, network database or production data are used.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogSources, validateCatalogSet } from './generate-lemona-seed.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { PGlite } = await import(process.env.OMS_CATALOG_PGLITE_MODULE || '@electric-sql/pglite');
const sources = catalogSources.map((source) => ({
  ...source,
  catalog: JSON.parse(readFileSync(resolve(root, source.manifestPath), 'utf8')),
  migration: readFileSync(resolve(root, source.migrationPath), 'utf8')
}));
validateCatalogSet(sources.map((source) => source.catalog));
const baseSchema = readFileSync(resolve(root, 'supabase/migrations/20260204000004_materials_inventory.sql'), 'utf8');
const unifiedSchema = readFileSync(resolve(root, 'supabase/migrations/20260217000000_unify_materials_inventory.sql'), 'utf8');

// Use the real canonical table/column definitions rather than a second schema model.
const createMaterials = baseSchema.match(/CREATE TABLE IF NOT EXISTS public\.materials \([\s\S]*?\n\);/)?.[0];
const alterMaterials = unifiedSchema.match(/ALTER TABLE public\.materials\s+[\s\S]*?;/)?.[0];
const uniqueSku = unifiedSchema.match(/DO \$\$[\s\S]*?END \$\$;/)?.[0];
assert.ok(createMaterials && alterMaterials && uniqueSku, 'Could not extract canonical materials schema');

async function database() {
  const db = new PGlite();
  await db.exec(`${createMaterials}\n${alterMaterials}\n${uniqueSku}`);
  return db;
}

async function rows(db) {
  return (await db.query('SELECT * FROM public.materials ORDER BY code')).rows;
}

const operationalFields = ['id', 'sku', 'stock', 'min_stock', 'max_stock', 'unit', 'location',
  'price', 'vendor', 'supplier', 'section', 'item_group', 'note', 'barcode', 'leftover_data', 'created_at'];
const db = await database();
try {
  // Each migration gets an existing operational record to exercise its update branch.
  for (const [index, source] of sources.entries()) {
    const product = source.catalog.products[0];
    await db.query(`INSERT INTO public.materials (
      code, sku, category, name_en, stock, min_stock, max_stock, unit, location,
      price, vendor, supplier, section, item_group, note, barcode, leftover_data, metadata
    ) VALUES ($1, $2, 'legacy', 'Old label', 17, 3, 25, 'box', 'A-17',
      37.42, 'Approved vendor', 'Preferred supplier', 'custom', 'Custom group',
      'Keep my note', '12345678', '{"cuts":[1,2]}', $3::jsonb)`,
    [product.code, `WORKSHOP-${index}`, JSON.stringify({
      brand: product.metadata.brand.toLowerCase().replaceAll(' ', ''),
      customReference: 'Workshop A', hex: '#112233'
    })]);
  }
  await db.exec(`INSERT INTO public.materials (code, sku, category, name_en, stock)
    VALUES ('LEGACY-LED', 'LEGACY-LED', 'LED_MODULE', 'Legacy saved selection', 8)`);

  for (const source of sources) {
    const before = await rows(db);
    const codes = new Set(source.catalog.products.map((product) => product.code));
    const existingCode = source.catalog.products[0].code;
    const existingBefore = before.find((row) => row.code === existingCode);
    await db.exec(source.migration);
    const after = await rows(db);
    const existingAfter = after.find((row) => row.code === existingCode);
    for (const field of operationalFields) {
      assert.deepEqual(existingAfter[field], existingBefore[field], `${source.id}: existing ${field} must be preserved`);
    }
    assert.equal(existingAfter.metadata.customReference, 'Workshop A');
    assert.equal(existingAfter.metadata.hex, '#112233');
    assert.deepEqual(after.filter((row) => !codes.has(row.code)), before.filter((row) => !codes.has(row.code)),
      `${source.id}: earlier catalog, future fixtures and legacy records must be untouched`);
    assert.equal(after.filter((row) => row.metadata?.catalog_seed === source.id).length, source.catalog.products.length);
    for (const product of source.catalog.products) {
      const row = after.find((entry) => entry.code === product.code);
      assert.equal(row.category, product.category);
      assert.deepEqual(row.thickness_options, []);
      for (const [key, value] of Object.entries(product.metadata)) assert.deepEqual(row.metadata[key], value);
      if (product.code !== existingCode) {
        assert.equal(row.stock, 0);
        assert.equal(row.price, null);
        assert.equal(row.unit, product.unit);
        assert.equal(row.sku, product.sku);
      }
    }
    console.log(`PASS: ${source.id} imports ${source.catalog.products.length} products, preserves operational data, and leaves other catalogs unchanged.`);
  }
  const firstRun = await rows(db);
  assert.equal(firstRun.length, sources.reduce((count, source) => count + source.catalog.products.length, 1));
  for (const source of sources) await db.exec(source.migration);
  assert.deepEqual(await rows(db), firstRun);
  console.log('PASS: reapplying every catalog is a true no-op, including IDs and timestamps.');
} finally {
  await db.close();
}

for (const [index, source] of sources.entries()) {
  const code = source.catalog.products[0].code;
  for (const kind of ['SKU collision', 'brand conflict']) {
    const collisionDb = await database();
    try {
      // A later migration must also roll back without damaging earlier imported catalogs.
      for (const earlier of sources.slice(0, index)) await collisionDb.exec(earlier.migration);
      if (kind === 'SKU collision') {
        await collisionDb.query(`INSERT INTO public.materials (code, sku, category, stock)
          VALUES ('INV-legacy', $1, 'PSU', 9)`, [code]);
      } else {
        await collisionDb.query(`INSERT INTO public.materials (code, sku, category, stock, metadata)
          VALUES ($1, 'OTHER-PSU', 'PSU', 9, '{"brand":"Different manufacturer"}')`, [code]);
      }
      const original = await rows(collisionDb);
      await assert.rejects(() => collisionDb.exec(source.migration), new RegExp(`Lemona seed ${kind}`));
      await collisionDb.exec('ROLLBACK');
      assert.deepEqual(await rows(collisionDb), original);
      console.log(`PASS: ${source.id} ${kind} rejects the complete import without partial changes.`);
    } finally {
      await collisionDb.close();
    }
  }
}

const incompleteDb = new PGlite();
try {
  await incompleteDb.exec('CREATE TABLE public.materials (id uuid PRIMARY KEY, code text UNIQUE)');
  for (const source of sources) {
    await assert.rejects(() => incompleteDb.exec(source.migration), /Lemona seed requires the unified materials schema/);
    await incompleteDb.exec('ROLLBACK');
    console.log(`PASS: ${source.id} rejects an incompatible schema before importing data.`);
  }
} finally {
  await incompleteDb.close();
}
