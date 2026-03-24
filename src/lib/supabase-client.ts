import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

// Use environment variables strictly — no cloud fallbacks
const supabaseUrl = env.PUBLIC_SUPABASE_URL || 'http://localhost:8000';
const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
