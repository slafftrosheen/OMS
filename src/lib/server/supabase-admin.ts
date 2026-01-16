import { createClient } from '@supabase/supabase-js';

// Create a single supabase client for interacting with your database
// This client has admin privileges and should only be used on the server
// Using process.env to handle environment variables properly during build
export const supabaseAdmin = createClient(
  process.env.PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);
