import adapterNode from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import dotenv from 'dotenv';

dotenv.config();

// ─── CSP allow-list — every entry comes from .env ─────────────────────────
// Operators add / remove origins by editing .env, not this file.
//
// CSP_CONNECT_SRC takes precedence: a comma-separated list of explicit origins
// added on top of "'self'".
//
// When CSP_CONNECT_SRC is unset, we synthesise an allow-list from the host
// variables that the rest of the app already reads (OLLAMA_HOST, OLLAMA_PORT,
// SUPABASE_HOST, SUPABASE_PORT, …) so flipping a Tailscale IP only requires
// touching one file.

const env = process.env;

function trim(s) { return String(s ?? '').trim(); }

function fromList(name) {
  return trim(env[name])
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function defaultConnectSrc() {
  const ollamaHost  = env.OLLAMA_HOST  || '100.93.147.108';
  const ollamaPort  = env.OLLAMA_PORT  || '11434';
  const supaHost    = env.SUPABASE_HOST    || '100.98.202.69';
  const supaPort    = env.SUPABASE_PORT    || '54321';
  const supaDbPort  = env.SUPABASE_DB_PORT || '54322';
  const legacyHost  = env.PUBLIC_SUPABASE_LEGACY_HOST || '192.168.8.150';

  const out = new Set([
    `http://${ollamaHost}:${ollamaPort}`,
    `http://${supaHost}:${supaPort}`,
    `https://${supaHost}:${supaPort}`,
    `ws://${supaHost}:${supaPort}`,
    `wss://${supaHost}:${supaPort}`,
    `http://${supaHost}:${supaDbPort}`,
    `ws://${supaHost}:${supaDbPort}`,
    `http://${legacyHost}:${supaPort}`,
    `https://${legacyHost}:${supaPort}`,
    `ws://${legacyHost}:${supaPort}`,
    `wss://${legacyHost}:${supaPort}`,
    "https://cdn.jsdelivr.net"
  ]);

  // HMR origin only matters in dev; harmless in prod CSP.
  const hmrHost = env.VITE_HMR_HOST || env.FRONTEND_HOST;
  if (hmrHost) out.add(`ws://${hmrHost}:5173`);

  return Array.from(out);
}

const explicit = fromList('CSP_CONNECT_SRC');
const connectSrc = ["'self'", ...(explicit.length ? explicit : defaultConnectSrc())];

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess,

  kit: {
    adapter: adapterNode({ precompress: true }),

    alias: {
      $lib: 'src/lib',
      $components: 'src/lib/components',
      $stores: 'src/lib/stores',
      $utils: 'src/lib/utils'
    },

    csp: {
      directives: {
        'connect-src': connectSrc
      }
    },

    env: { publicPrefix: 'PUBLIC_' }
  }
};

export default config;
