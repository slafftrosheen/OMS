#!/usr/bin/env node
// Optional offline integration check. Uses an isolated in-memory PostgreSQL engine;
// no Supabase URL, credentials, network database or production data are used.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestPath, migrationPath } from './generate-lemona-seed.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { PGlite } = await import(process.env.OMS_CATALOG_PGLITE_MODULE || '@electric-sql/pglite');
const catalog = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8'));
const migration = readFileSync(resolve(root, migrationPath), 'utf8');
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

const db = await database();
try {
  await db.exec(`INSERT INTO public.materials (
    code, sku, category, name_en, stock, min_stock, max_stock, unit, location,
    price, vendor, supplier, section, item_group, note, barcode, leftover_data, metadata
  ) VALUES (
    'LRS-150-12', 'WORKSHOP-PSU', 'PSU', 'Old label', 17, 3, 25, 'box', 'A-17',
    37.42, 'Approved vendor', 'Preferred supplier', 'custom', 'Custom group',
    'Keep my note', '12345678', '{"cuts":[1,2]}',
    '{"brand":"MeanWell","customReference":"Workshop A","hex":"#112233"}'
  ), (
    'LEGACY-LED', 'LEGACY-LED', 'LED_MODULE', 'Legacy saved selection', 8, 0, 20,
    'PCS', 'B-2', 1.50, null, null, 'electronics', 'LED modules', null, null, '{}', '{}'
  );`);
  const before = (await db.query("SELECT * FROM public.materials WHERE code = 'LRS-150-12'")).rows[0];
  const legacyBefore = (await db.query("SELECT * FROM public.materials WHERE code = 'LEGACY-LED'")).rows[0];
  await db.exec(migration);
  const after = (await db.query("SELECT * FROM public.materials WHERE code = 'LRS-150-12'")).rows[0];
  for (const field of ['id', 'sku', 'stock', 'min_stock', 'max_stock', 'unit', 'location',
    'price', 'vendor', 'supplier', 'section', 'item_group', 'note', 'barcode', 'leftover_data', 'created_at']) {
    assert.deepEqual(after[field], before[field], `Existing ${field} must be preserved`);
  }
  assert.equal(after.metadata.customReference, 'Workshop A');
  assert.equal(after.metadata.hex, '#112233');
  assert.equal(after.metadata.brand, 'MEAN WELL');
  assert.equal(after.category, 'PSU_MEANWELL');
  assert.deepEqual((await db.query("SELECT * FROM public.materials WHERE code = 'LEGACY-LED'")).rows[0], legacyBefore);
  assert.equal((await db.query("SELECT count(*)::integer AS count FROM public.materials WHERE metadata->>'catalog_seed' = 'lemona-2026-10-30'")).rows[0].count, catalog.products.length);
  const newPsu = (await db.query("SELECT * FROM public.materials WHERE code = 'XLG-200-12-A'")).rows[0];
  assert.equal(newPsu.stock, 0);
  assert.equal(newPsu.price, null);
  assert.equal(newPsu.unit, 'PCS');
  assert.equal(newPsu.metadata.power_w, 192);
  assert.equal((await db.query("SELECT unit FROM public.materials WHERE code = 'AFL-60B14424M-830'")).rows[0].unit, 'roll');
  const filament = (await db.query("SELECT unit, thickness_options, metadata FROM public.materials WHERE code = 'EASY-WHITE-175-085'")).rows[0];
  assert.equal(filament.unit, 'PCS');
  assert.deepEqual(filament.thickness_options, []);
  assert.equal(filament.metadata.diameter_mm, 1.75);
  console.log('PASS: 42 products, correct category/package units, no invented prices, existing inventory and legacy references preserved.');

  const firstRun = (await db.query('SELECT * FROM public.materials ORDER BY code')).rows;
  await db.exec(migration);
  assert.deepEqual((await db.query('SELECT * FROM public.materials ORDER BY code')).rows, firstRun);
  console.log('PASS: repeat execution is a true no-op, including IDs and timestamps.');
} finally {
  await db.close();
}

/** @type {Array<[string, RegExp, string]>} */
const collisions = [
  ["INSERT INTO public.materials (code, sku, category, stock) VALUES ('INV-legacy', 'LRS-150-12', 'PSU', 9)",
    /Lemona seed SKU collision/, 'SKU collision'],
  ["INSERT INTO public.materials (code, sku, category, stock, metadata) VALUES ('LRS-150-12', 'OTHER-PSU', 'PSU', 9, '{\"brand\":\"Different manufacturer\"}')",
    /Lemona seed brand conflict/, 'brand conflict']
];
for (const [setup, expectedError, label] of collisions) {
  const collisionDb = await database();
  try {
    await collisionDb.exec(setup);
    const original = (await collisionDb.query('SELECT * FROM public.materials')).rows;
    await assert.rejects(() => collisionDb.exec(migration), expectedError);
    await collisionDb.exec('ROLLBACK');
    assert.deepEqual((await collisionDb.query('SELECT * FROM public.materials')).rows, original);
    console.log(`PASS: ${label} rejects the entire import without partial changes.`);
  } finally {
    await collisionDb.close();
  }
}

const incompleteDb = new PGlite();
try {
  await incompleteDb.exec('CREATE TABLE public.materials (id uuid PRIMARY KEY, code text UNIQUE)');
  await assert.rejects(() => incompleteDb.exec(migration), /Lemona seed requires the unified materials schema/);
  await incompleteDb.exec('ROLLBACK');
  console.log('PASS: an incompatible schema fails before importing data.');
} finally {
  await incompleteDb.close();
}
