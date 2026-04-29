-- =================================================================
-- 20260425000012: CONVERSATIONS + RESCHEDULED auto-embed CRON
-- =================================================================
-- Phase 4 lays the storage for chat persistence (Q5a) and reschedules the
-- pg_cron job that drives the auto-embed Edge Function (Q9a) — this time with
-- the bearer token sourced from a database setting instead of a hard-coded
-- placeholder.  The operator runs:
--
--   ALTER DATABASE postgres
--       SET app.auto_embed_url = 'http://100.98.202.69:54321/functions/v1/auto-embed';
--   ALTER DATABASE postgres
--       SET app.supabase_service_role_key = '<service-role-key>';
--
-- before the cron will succeed.  Until those are set, the job runs but the
-- HTTP call inside it returns null and is silently skipped — no log spam.
-- =================================================================

-- -----------------------------------------------------------------
-- Conversations / messages (Q5a)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title       TEXT,
    agent       TEXT,                -- router | reasoning | engineer | vision
    metadata    JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,   -- user | assistant | system | tool
    content         TEXT NOT NULL,
    images          TEXT[],
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
    ON public.conversations(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_convo
    ON public.conversation_messages(conversation_id, created_at);

ALTER TABLE public.conversations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own conversations" ON public.conversations;
CREATE POLICY "users own conversations"
    ON public.conversations FOR ALL
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users own conversation messages" ON public.conversation_messages;
CREATE POLICY "users own conversation messages"
    ON public.conversation_messages FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
             WHERE c.id = conversation_messages.conversation_id
               AND c.user_id = auth.uid()
        )
    );

-- Auto-touch updated_at on the parent conversation when a message lands.
CREATE OR REPLACE FUNCTION public.conversations_touch_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.conversations
       SET updated_at = now()
     WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS conversations_touch_on_message ON public.conversation_messages;
CREATE TRIGGER conversations_touch_on_message
    AFTER INSERT ON public.conversation_messages
    FOR EACH ROW EXECUTE FUNCTION public.conversations_touch_on_message();

COMMENT ON TABLE public.conversations         IS 'Chat conversation thread (per-user).';
COMMENT ON TABLE public.conversation_messages IS 'Chat messages within a conversation, in order.';

-- -----------------------------------------------------------------
-- (Re)schedule the auto-embed cron with config-based auth
-- -----------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        RAISE NOTICE 'pg_cron not installed — skipping schedule.';
        RETURN;
    END IF;

    -- Drop any prior version of the job (idempotent).
    PERFORM cron.unschedule('process-embeddings')
     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-embeddings');

    -- Schedule every minute.
    PERFORM cron.schedule(
        'process-embeddings',
        '* * * * *',
        $cron$
        SELECT CASE
            WHEN coalesce(current_setting('app.auto_embed_url', true), '') = ''
              OR coalesce(current_setting('app.supabase_service_role_key', true), '') = ''
            THEN NULL
            ELSE net.http_post(
                url     := current_setting('app.auto_embed_url', true),
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
                ),
                body    := '{}'::jsonb
            )::text
        END;
        $cron$
    );
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'pg_cron tables not present — skipping schedule.';
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not (re)schedule process-embeddings: %', SQLERRM;
END $$;
