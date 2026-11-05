#!/usr/bin/env node
// Isolated SQL verification; never contacts Supabase or reads its credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { PGlite } = await import(process.env.OMS_CATALOG_PGLITE_MODULE || '@electric-sql/pglite');
const read = path => readFileSync(resolve(root, path), 'utf8');
const catalog = JSON.parse(read('supabase/catalogs/workshop-aluminium-2026-10-31.json'));
const product = catalog.products[0];
const migration = read('supabase/migrations/20261031000002_workshop_aluminium_sheets.sql');
assert.deepEqual(JSON.parse(migration.match(/\$workshop_materials\$([\s\S]+?)\$workshop_materials\$/)?.[1]), catalog.products);
const baseSchema = read('supabase/migrations/20260204000004_materials_inventory.sql');
const unifiedSchema = read('supabase/migrations/20260217000000_unify_materials_inventory.sql');
const createMaterials = baseSchema.match(/CREATE TABLE IF NOT EXISTS public\.materials \([\s\S]*?\n\);/)?.[0];
const createThickness = baseSchema.match(/CREATE TABLE IF NOT EXISTS public\.material_thickness_options \([\s\S]*?\n\);/)?.[0];
const alterMaterials = unifiedSchema.match(/ALTER TABLE public\.materials\s+[\s\S]*?;/)?.[0];
const uniqueSku = unifiedSchema.match(/DO \$\$[\s\S]*?END \$\$;/)?.[0];
assert.ok(createMaterials && createThickness && alterMaterials && uniqueSku, 'Could not extract canonical schema');

async function database() {
  const db = new PGlite();
  await db.exec(`${createMaterials}\n${createThickness}\n${alterMaterials}\n${uniqueSku}`);
  return db;
}

async function snapshot(db) {
  return {
    materials: (await db.query('SELECT * FROM public.materials ORDER BY code')).rows,
    thickness: (await db.query('SELECT * FROM public.material_thickness_options ORDER BY id')).rows
  };
}

const db = await database();
try {
  await db.exec(`INSERT INTO public.materials (code, sku, category, name_en, stock, price, metadata)
    VALUES ('ALU_FLAT_20X3', 'ALU_FLAT_20X3', 'ALU_SHEET', 'Legacy flat bar', 17, 37.42,
      '{"type":"flat","customReference":"Frame shop"}');
    INSERT INTO public.material_thickness_options
      (material_type, thickness, unit, display_name, sort_order, is_active)
    VALUES ('ALUMINUM', 1.5, 'mm', 'My existing label', 42, false),
      ('ALUMINUM', 1.2, 'mm', 'Special workshop size', 43, true),
      ('ACRYLIC', 3, 'mm', 'Acrylic', 10, true);`);
  const before = await snapshot(db);
  await db.exec(migration);
  const after = await snapshot(db);
  const sheet = after.materials.find(row => row.code === product.code);
  assert.ok(sheet);
  for (const [field, value] of Object.entries(product)) assert.deepEqual(sheet[field], value);
  assert.equal(sheet.stock, 0);
  assert.equal(sheet.price, null);
  assert.equal(sheet.supplier, null);
  assert.equal(sheet.vendor, null);
  assert.deepEqual(after.materials.filter(row => row.code !== product.code), before.materials);
  for (const row of before.thickness) assert.deepEqual(after.thickness.find(entry => entry.id === row.id), row);
  assert.deepEqual(after.thickness.filter(row => row.material_type === 'ALUMINUM').map(row => Number(row.thickness)).sort((a, b) => a - b),
    [...product.thickness_options, 1.2].sort((a, b) => a - b));
  console.log('PASS: workshop sheet imports exact dimensions/thicknesses without changing legacy materials, stock, prices or existing options.');

  await db.exec(migration);
  assert.deepEqual(await snapshot(db), after);
  console.log('PASS: exact replay is a no-op, including IDs and timestamps.');

  await db.query(`UPDATE public.materials SET sku = 'WORKSHOP-LOCAL-SKU', name_en = 'Local sheet label', stock = 5,
    price = 19.8, unit = 'sheet', supplier = 'Workshop supplier',
    metadata = metadata || '{"customReference":"Local note","alloy":"Workshop verified alloy"}'::jsonb WHERE code = $1`, [product.code]);
  const customized = await snapshot(db);
  await db.exec(migration);
  assert.deepEqual(await snapshot(db), customized);
  console.log('PASS: replay preserves subsequent local sheet edits and operational values.');
} finally {
  await db.close();
}

for (const kind of ['SKU', 'code']) {
  const collisionDb = await database();
  try {
    await collisionDb.query(`INSERT INTO public.materials (code, sku, category, stock)
      VALUES ($1, $2, 'ALU_PROFILE', 9)`, kind === 'SKU'
      ? ['EXISTING-OTHER-CODE', product.sku] : [product.code, 'EXISTING-OTHER-SKU']);
    const before = await snapshot(collisionDb);
    await assert.rejects(() => collisionDb.exec(migration), new RegExp(`Workshop sheet seed ${kind} collision`));
    await collisionDb.exec('ROLLBACK');
    assert.deepEqual(await snapshot(collisionDb), before);
    console.log(`PASS: ${kind} collision rolls back the entire import, including thickness options.`);
  } finally {
    await collisionDb.close();
  }
}

const incomplete = new PGlite();
try {
  await incomplete.exec('CREATE TABLE public.materials (id uuid PRIMARY KEY, code text UNIQUE)');
  await assert.rejects(() => incomplete.exec(migration), /Workshop sheet seed requires materials and material_thickness_options/);
  await incomplete.exec('ROLLBACK');
  console.log('PASS: incompatible schema rejects the seed before any data changes.');
} finally {
  await incomplete.close();
}
