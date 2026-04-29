/**
 * Client-safe configuration — only reads PUBLIC_* env vars.
 * Mirrors a subset of src/lib/server/config.ts that the browser needs.
 *
 * IMPORTANT: never import this file from anything that should not reach the
 * client bundle.  Anything *secret* lives in src/lib/server/config.ts.
 */

import { env as pub } from '$env/dynamic/public';

function read(key: string, fallback: string): string {
    const v = (pub as Record<string, string | undefined>)[key];
    return v && v !== '' ? v : fallback;
}

export const PUBLIC_OLLAMA_WEBUI_URL = read('PUBLIC_OLLAMA_WEBUI_URL', 'http://100.93.147.108:3000');
export const PUBLIC_BASE_URL         = read('PUBLIC_BASE_URL',         'http://reclame-orch.local');
export const PUBLIC_APP_URL          = read('PUBLIC_APP_URL',          PUBLIC_BASE_URL);
export const PUBLIC_SUPABASE_URL     = read('PUBLIC_SUPABASE_URL',     'http://100.98.202.69:8000');
