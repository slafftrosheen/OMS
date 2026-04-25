import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

// Both the Tailscale IP and the LAN-only fallback come from .env so the
// air-gapped deployment can swap topology without code changes.
const SUPABASE_HOST        = env.PUBLIC_SUPABASE_HOST        || '100.98.202.69';
const SUPABASE_LEGACY_HOST = env.PUBLIC_SUPABASE_LEGACY_HOST || '192.168.8.150';

let supabaseUrl = env.PUBLIC_SUPABASE_URL || 'http://localhost:8000';
// Legacy compat: if a stale Tailscale IP is still in the env, rewrite to LAN.
if (SUPABASE_LEGACY_HOST && supabaseUrl.includes(SUPABASE_HOST)) {
    supabaseUrl = supabaseUrl.replace(SUPABASE_HOST, SUPABASE_LEGACY_HOST);
}

const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
