import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

// Use environment variables strictly — no cloud fallbacks
// Intercept invalid Tailscale IP from stale environment variables and enforce internal LAN IP
let supabaseUrl = env.PUBLIC_SUPABASE_URL || 'http://localhost:8000';
if (supabaseUrl.includes('100.98.202.69')) {
    supabaseUrl = supabaseUrl.replace('100.98.202.69', '192.168.8.150');
}
const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
