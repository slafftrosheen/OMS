import {describe,it,expect} from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
describe('lightweight assertion compatibility',()=>{
 it('matches objectContaining recursively inside exact equality',()=>{
  expect([{id:'a',review:{status:'RESOLVED',revision:2}}]).toEqual([
   expect.objectContaining({review:expect.objectContaining({status:'RESOLVED'})})
  ]);
  expect(()=>expect([{id:'wrong'}]).toEqual([expect.objectContaining({id:'a'})])).toThrow();
  expect(()=>expect([{id:'a'}, {id:'extra'}]).toEqual([expect.objectContaining({id:'a'})])).toThrow();
  expect(()=>expect({id:'a',extra:true}).toEqual({id:'a'})).toThrow();
  expect(()=>expect({}).toEqual(expect.objectContaining({id:undefined}))).toThrow();
  expect(()=>expect(new Map([['a',1]])).toEqual(new Map([['b',1]]))).toThrow();
  expect(()=>expect(new Set([1])).toEqual(new Set([2]))).toThrow();
 });
});

describe('lightweight runner temporary files', () => {
 it('cleans its own bundles after passing, failed and unimportable suites without touching another run', () => {
  const folder = mkdtempSync(join(tmpdir(), 'oms-runner-cleanup-'));
  const temp = join(folder, 'temp'), root = join(temp, 'rf-vitest');
  mkdirSync(join(root, 'another-run'), { recursive: true });
  writeFileSync(join(root, 'another-run', 'keep.mjs'), 'another active test run');
  const file = join(folder, 'sample.test.js');
  try {
   for (const [source, status] of [
    ["import {it} from 'vitest'; it('passes', () => {});", 0],
    ["import {it} from 'vitest'; it('fails', () => { throw Error('expected failure'); });", 1],
    ["throw Error('expected import failure');", 1],
    ["setInterval(() => {}, 1000); throw Error('expected import failure with an open timer');", 1],
   ] as const) {
    writeFileSync(file, source);
    const result = spawnSync(process.execPath, ['packages/vitest/bin.js', file], {
     cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, TMPDIR: temp }, timeout: 30000,
    });
    assert.equal(result.status, status, result.stdout + result.stderr);
    assert.deepEqual(readdirSync(root), ['another-run']);
    assert.deepEqual(readdirSync(join(root, 'another-run')), ['keep.mjs']);
   }
  } finally { rmSync(folder, { recursive: true, force: true }); }
 });
});
