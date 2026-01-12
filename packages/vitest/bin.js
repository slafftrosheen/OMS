#!/usr/bin/env node
import { resolve, join, extname } from 'node:path';
import { readdir, stat, access, mkdir, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import esbuild from 'esbuild';
import { runSuites, resetSuites } from './index.js';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2).filter((arg) => arg !== 'run');
const root = process.cwd();
const targets = argv.length ? argv : ['src'];

const TEST_PATTERN = /\.(test|spec)\.(js|mjs|cjs|ts|tsx)$/;

async function collectTests(dir, out) {
  const entries = await readdir(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const info = await stat(fullPath);
    if (info.isDirectory()) {
      await collectTests(fullPath, out);
      continue;
    }
    const ext = extname(fullPath);
    if (['.js', '.mjs', '.cjs', '.ts', '.tsx'].includes(ext)) {
      if (TEST_PATTERN.test(fullPath)) {
        out.push(fullPath);
      }
    }
  }
}

const EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs', '.svelte', '/index.ts', '/index.js'];

async function resolveWithExtensions(basePath) {
  for (const ext of EXTENSIONS) {
    const candidate = basePath.endsWith(ext) ? basePath : `${basePath}${ext}`;
    try {
      await access(candidate, fsConstants.F_OK);
      return candidate;
    } catch (error) {
      // continue
    }
  }
  return basePath;
}

const aliasPlugin = {
  name: 'rf-alias',
  setup(build) {
    build.onResolve({ filter: /^\$lib\// }, async (args) => ({
      path: await resolveWithExtensions(join(root, 'src/lib', args.path.slice(5))),
      namespace: 'file'
    }));
    // Handle $app/* imports - resolve to src/app/* mock files
    build.onResolve({ filter: /^\$app\// }, async (args) => ({
      path: await resolveWithExtensions(join(root, 'src/app', args.path.slice(5))),
      namespace: 'file'
    }));
    build.onResolve({ filter: /^\.\/?\$app\// }, async (args) => ({
      path: await resolveWithExtensions(join(root, 'src/app', args.path.replace(/^\.\/?\$app\//, ''))),
      namespace: 'file'
    }));
    build.onResolve({ filter: /^vitest$/ }, () => ({
      path: pathToFileURL(join(root, 'packages/vitest/index.js')).href,
      external: true
    }));
  }
};

const tempRoot = join(tmpdir(), 'rf-vitest');

async function ensureTempDir() {
  await mkdir(tempRoot, { recursive: true });
  return tempRoot;
}

async function loadTests(files) {
  await ensureTempDir();
  for (const file of files) {
    const result = await esbuild.build({
      absWorkingDir: root,
      entryPoints: [file],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      target: 'es2022',
      sourcemap: 'inline',
      plugins: [aliasPlugin]
    });
    const output = result.outputFiles?.[0]?.text ?? '';
    const tempFile = join(tempRoot, `${Date.now()}-${randomBytes(6).toString('hex')}.mjs`);
    await writeFile(tempFile, output, 'utf8');
    await import(pathToFileURL(tempFile).href);
  }
}

async function main() {
  try {
    const files = [];
    for (const target of targets) {
      const absolute = resolve(root, target);
      await collectTests(absolute, files);
    }
    if (!files.length) {
      console.error('No test files found.');
      process.exit(1);
    }
    await loadTests(files);
    const failures = await runSuites();
    resetSuites();
    if (failures > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
