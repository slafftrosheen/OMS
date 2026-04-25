-- =================================================================
-- 20260425000010: NEUTRALIZE BROKEN AUTONOMOUS-MEMORY CRON
-- =================================================================
-- Migration 20260423000000_autonomous_memory_cron.sql scheduled a pg_cron job
-- that POSTed to /functions/v1/auto-embed with the literal string
-- "<YOUR_ANON_KEY_PLACEHOLDER>" as the bearer token, and the Edge Function it
-- targeted was never deployed.  The job runs every minute and fails silently.
--
-- This migration unschedules that job so logs stop spamming.  Phase 4 will
-- (re)schedule it AFTER the auto-embed Edge Function is deployed and the
-- service-role token is fetched from a secure setting instead of a placeholder.
-- =================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('process-embeddings')
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-embeddings');
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        -- pg_cron not installed in this environment; nothing to do.
        NULL;
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not unschedule process-embeddings cron: %', SQLERRM;
END $$;
