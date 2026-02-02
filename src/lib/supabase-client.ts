import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

// Robust fallback for build environments where env vars might be missing
const supabaseUrl = env.PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
