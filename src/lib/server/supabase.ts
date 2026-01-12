// src/lib/server/supabase.ts
import { createSupabaseServerClient } from '@supabase/auth-helpers-sveltekit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

/**
 * Supabase client for server-side usage.
 */
export const createSupabaseClient = (event) => {
  try {
    console.log('Creating Supabase client with URL:', PUBLIC_SUPABASE_URL);
    const client = createSupabaseServerClient({
      supabaseUrl: PUBLIC_SUPABASE_URL,
      supabaseKey: PUBLIC_SUPABASE_ANON_KEY,
      event,
    });
    console.log('Supabase client created successfully.');
    return client;
  } catch (error) {
    console.error('Error creating Supabase client:', error);
    throw error;
  }
};
