import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import { env as private_env } from '$env/dynamic/private';

// Create a single supabase client for interacting with your database
// This client has admin privileges and should only be used on the server

const supabaseUrl = (
    env.PUBLIC_SUPABASE_URL ||
    process?.env?.PUBLIC_SUPABASE_URL ||
    ''
).trim();

const supabaseServiceKey = (
    private_env.SUPABASE_SERVICE_ROLE_KEY ||
    process?.env?.SUPABASE_SERVICE_ROLE_KEY ||
    ''
).trim();

if (!supabaseUrl || !supabaseServiceKey) {
    // We don't throw here to avoid crashing the app on startup if unused,
    // but operations using it will fail.
    console.warn('Supabase Admin Client missing credentials (PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).');
}

// Ensure we don't crash if credentials are missing (e.g. during build)
// createClient requires a non-empty string for URL
const url = supabaseUrl || 'https://placeholder.supabase.co';
const key = supabaseServiceKey || 'placeholder-key';

export const supabaseAdmin = createClient(url, key);
