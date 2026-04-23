-- =================================================================
-- Migration: Autonomous Memory Cron and pg_net Setup
-- =================================================================

-- 1. Enable pg_net and pg_cron extensions
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA extensions;

-- 2. Alter embedding columns to allow NULLs for the embedding loop
-- This enables rows to be created without an embedding so the loop can process them.
ALTER TABLE IF EXISTS public.company_knowledge ALTER COLUMN embedding DROP NOT NULL;
ALTER TABLE IF EXISTS public.framework_docs ALTER COLUMN embedding DROP NOT NULL;

-- 3. Schedule the autonomous embedding loop via pg_cron
-- Using net.http_post to hit the Deno Edge Function running on the local network (Node 101)
SELECT cron.schedule(
    'process-embeddings', -- job name
    '* * * * *',          -- every minute
    $$
    SELECT net.http_post(
        url := 'http://100.98.202.69:54321/functions/v1/auto-embed',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer <YOUR_ANON_KEY_PLACEHOLDER>"}'::jsonb,
        body := '{}'::jsonb
    );
    $$
);
