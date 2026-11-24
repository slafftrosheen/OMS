#!/usr/bin/env node
/** Local canvas checks use isolated editors and PostgreSQL/WASM, never live orders.
 * Small sequential processes bound the bundled native editor's memory footprint. */
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const extra = new Set([
  'creation-canvas.test.ts', 'creation-state.test.ts', 'draft-order-template-scale.test.ts',
  'dxf-preview.test.ts', 'gradient-fill.test.ts', 'material-alignment.test.ts',
  'material-presets.test.ts', 'material-texture.test.ts', 'material-tiles.test.ts',
  'order-canvas-scale-ui.test.tsx', 'order-file-documents.test.ts', 'pdf-annotation-storage.test.ts',
  'production-layout-history.test.ts', 'production-layout.test.ts', 'profile-station-elements.test.ts',
  'rf-canvas-surface.test.ts', 'rf-draft-form-lock.test.ts', 'system-canvas-contracts.test.ts',
  'vitest-harness.test.ts',
]);
const files = readdirSync(join(root, 'tests/unit')).filter(name =>
  /^(cad|canvas|drawing)-.*\.test\.tsx?$/.test(name) || extra.has(name)
).sort().map(name => `tests/unit/${name}`);
const batchSize = 8, batches = Math.ceil(files.length / batchSize);
let passed = 0, failed = 0;
const failedBatches = [];

function run(args, env = {}) {
  return spawnSync(process.execPath, args, {
    cwd: root, encoding: 'utf8', env: { ...process.env, ...env },
    timeout: 240_000, maxBuffer: 32 * 1024 * 1024,
  });
}
function diagnostics(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) console.error(result.error.message);
  if (result.signal) console.error(`Process terminated by ${result.signal}`);
}

console.log(`Canvas unit/editor checks: ${files.length} files, ${batches} sequential batches.`);
for (let offset = 0; offset < files.length; offset += batchSize) {
  const batch = files.slice(offset, offset + batchSize), index = offset / batchSize + 1;
  const result = run(['packages/vitest/bin.js', ...batch]);
  const summary = [...(result.stdout ?? '').matchAll(/Ran (\d+) tests: (\d+) passed, (\d+) failed\./g)].at(-1);
  if (summary) { passed += Number(summary[2]); failed += Number(summary[3]); }
  const ok = result.status === 0 && summary && Number(summary[3]) === 0;
  console.log(`[${index}/${batches}] ${ok ? 'PASS' : 'FAIL'} ${summary?.[0] ?? 'Runner did not complete.'}`);
  if (!ok) { failedBatches.push(batch); console.error(batch.join('\n')); diagnostics(result); }
}
console.log(`Canvas unit/editor result: ${passed} passed, ${failed} failed; ${failedBatches.length} failed batches.`);

console.log('Canvas PostgreSQL contract checks (isolated PGlite).');
const database = run(['--test', '--test-concurrency=1',
  'tests/db/canvas-file-pockets.test.mjs', 'tests/db/canvas-dxf-releases.test.mjs', 'tests/db/canvas-export-retries.test.mjs',
]);
diagnostics(database);

console.log('Canvas media migration checks (isolated PGlite, repeated migration application).');
const require = createRequire(import.meta.url);
const migration = run(['tests/integration/canvas-media-migration.mjs'], {
  OMS_PGLITE_MODULE: require.resolve('@electric-sql/pglite'),
});
diagnostics(migration);

if (failedBatches.length || database.status !== 0 || migration.status !== 0) {
  process.exitCode = 1;
  console.error('Canvas checks failed; review the diagnostics above.');
} else {
  console.log('All local canvas checks passed. Browser scenarios, type checking and production build are separate gates.');
}
