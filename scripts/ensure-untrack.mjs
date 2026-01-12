import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const targets = [
  {
    label: 'SSR',
    file: path.join(root, 'node_modules', 'svelte', 'src', 'runtime', 'ssr.js')
  },
  {
    label: 'client',
    file: path.join(root, 'node_modules', 'svelte', 'src', 'runtime', 'index.js')
  }
];

function ensureUntrack(file, label) {
  if (!fs.existsSync(file)) {
    console.warn(`[ensure-untrack] Unable to locate ${file}`);
    return false;
  }

  const source = fs.readFileSync(file, 'utf8');
  if (source.includes('export function untrack')) {
    return false;
  }

  const patch = `\nexport function untrack(fn) {\n  return fn();\n}\n`;
  fs.writeFileSync(file, `${source.trimEnd()}${patch}`);
  console.info(`[ensure-untrack] Added untrack fallback to Svelte ${label} runtime.`);
  return true;
}

try {
  let applied = false;
  for (const { file, label } of targets) {
    applied = ensureUntrack(file, label) || applied;
  }
  if (!applied) {
    console.info('[ensure-untrack] untrack export already present.');
  }
} catch (error) {
  console.warn('[ensure-untrack] Failed to apply untrack shim:', error);
}
