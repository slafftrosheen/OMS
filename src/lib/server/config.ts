/**
 * Central server-side configuration.
 *
 * Every Tailscale IP, model name, and timeout that used to be sprinkled across
 * orchestrator.ts, tools.ts, the crawlers, the AI chat handler, and the health
 * probes now lives here.  Values resolve in order:
 *
 *   1. process.env (set by Docker / K3s / pm2 / launchd)
 *   2. SvelteKit's $env/dynamic/private (mirrors process.env at runtime)
 *   3. The defaults below (today's hardcoded Tailscale topology)
 *
 * The defaults are deliberately the production Tailnet IPs so the system runs
 * out-of-the-box on the current infrastructure.  Override any value through
 * the .env file (see .env.example for the full inventory).
 */

import { env as dyn } from '$env/dynamic/private';

// ─── Resolver ────────────────────────────────────────────────────────────────

function readEnv(key: string): string | undefined {
    const fromDyn = (dyn as Record<string, string | undefined>)[key];
    if (fromDyn !== undefined && fromDyn !== '') return fromDyn;
    const fromProc = typeof process !== 'undefined' ? process.env?.[key] : undefined;
    if (fromProc !== undefined && fromProc !== '') return fromProc;
    return undefined;
}

function readString(key: string, fallback: string): string {
    return readEnv(key) ?? fallback;
}

function readNumber(key: string, fallback: number): number {
    const v = readEnv(key);
    if (v === undefined) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function trimSlash(s: string) {
    return s.replace(/\/+$/, '');
}

// ─── Tailnet topology ────────────────────────────────────────────────────────
// Documented in CLAUDE.md.  `*_LEGACY_HOST` lets callers also reach the box
// over its LAN IP — the original supabase.ts had a hard rewrite from
// 100.98.202.69 -> 192.168.8.150 baked in.

export const OLLAMA_HOST          = readString('OLLAMA_HOST',           '100.93.147.108');
export const OLLAMA_PORT          = readNumber('OLLAMA_PORT',           11434);
export const OLLAMA_URL           = trimSlash(readString('OLLAMA_URL',  `http://${OLLAMA_HOST}:${OLLAMA_PORT}`));
export const OLLAMA_WEBUI_URL     = trimSlash(readString('OLLAMA_WEBUI_URL', `http://${OLLAMA_HOST}:3000`));

export const SUPABASE_HOST        = readString('SUPABASE_HOST',         '100.98.202.69');
export const SUPABASE_PORT        = readNumber('SUPABASE_PORT',         54321);
export const SUPABASE_URL         = trimSlash(readString('SUPABASE_URL', `http://${SUPABASE_HOST}:${SUPABASE_PORT}`));
export const SUPABASE_LEGACY_HOST = readString('SUPABASE_LEGACY_HOST',  '192.168.8.150');
export const SUPABASE_LEGACY_URL  = trimSlash(readString('SUPABASE_LEGACY_URL', `http://${SUPABASE_LEGACY_HOST}:${SUPABASE_PORT}`));

export const FRONTEND_HOST        = readString('FRONTEND_HOST',         '100.105.211.46');

// Direct postgres connection used by the AI chat handler's "dumb tool" path.
export const DATABASE_URL         = readEnv('DATABASE_URL');

// Supabase keys (server-only — never imported into client code).
export const SUPABASE_SERVICE_ROLE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY') ?? '';
export const SUPABASE_ANON_KEY         = readEnv('PUBLIC_SUPABASE_ANON_KEY')  ?? '';

// ─── AI swarm models ─────────────────────────────────────────────────────────
// Defaults match the swarm laid out in CLAUDE.md and the user's RTX 5080 / 16GB
// VRAM budget.  Any of these can be overridden in .env without touching code.

export const ROUTER_MODEL    = readString('ROUTER_MODEL',
    'hf.co/mradermacher/c4ai-command-r7b-12-2024-abliterated-GGUF:Q4_K_M');
export const REASONING_MODEL = readString('REASONING_MODEL',  'deepseek-r1:14b');
export const ENGINEER_MODEL  = readString('ENGINEER_MODEL',
    'hf.co/ertghiu256/qwen-3-14b-code-and-math-reasoning-gguf:Q4_K_M');
export const VISION_MODEL    = readString('VISION_MODEL',     'llama3.2-vision');

// Default chat model used by the small synchronous endpoints (analyze-order,
// generate-description) and the "Hands" agent in the orchestrator.
export const OLLAMA_DEFAULT_MODEL = readString('OLLAMA_DEFAULT_MODEL', 'qwen2.5-coder:14b');

// Embedding model used by the crawlers and the auto-embed Edge Function.
export const EMBED_MODEL = readString('EMBED_MODEL', 'nomic-embed-text');

// ─── Timeouts / keep-alive ───────────────────────────────────────────────────

export const OLLAMA_TIMEOUT_MS    = readNumber('OLLAMA_TIMEOUT_MS',    60_000);
export const OLLAMA_PROBE_TIMEOUT = readNumber('OLLAMA_PROBE_TIMEOUT_MS', 3_000);
export const OLLAMA_KEEP_ALIVE    = readString('OLLAMA_KEEP_ALIVE',   '5m');
// The Windows CAD workstation runs OLLAMA_KEEP_ALIVE=0s to free VRAM (see
// CLAUDE.md "Windows CAD Protection").  Server jobs use 5m by default.

// ─── Misc URLs the UI needs ──────────────────────────────────────────────────
// These ARE the same as their server-side counterparts but the UI cannot read
// $env/dynamic/private.  Mirror as PUBLIC_* in .env so $lib/config exposes them.

export const PUBLIC_BASE_URL = readString('PUBLIC_BASE_URL', 'http://reclame-orch.local');
export const PUBLIC_APP_URL  = readString('PUBLIC_APP_URL',  PUBLIC_BASE_URL);
