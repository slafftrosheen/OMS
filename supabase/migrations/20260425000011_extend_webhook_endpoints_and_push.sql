-- =================================================================
-- 20260425000011: EXTEND webhook_endpoints + ADD push_subscriptions
-- =================================================================
-- Phase 2 follow-up: align webhook_endpoints with the columns the
-- /api/webhooks endpoint already writes, and add the push_subscriptions
-- table the missing /api/push/subscribe endpoint will write to.
-- =================================================================

ALTER TABLE public.webhook_endpoints
    ADD COLUMN IF NOT EXISTS description       TEXT,
    ADD COLUMN IF NOT EXISTS auth_type         TEXT DEFAULT 'none',     -- none | bearer | api_key | basic
    ADD COLUMN IF NOT EXISTS auth_config       JSONB,
    ADD COLUMN IF NOT EXISTS filters           JSONB,
    ADD COLUMN IF NOT EXISTS headers           JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS timeout_seconds   INTEGER DEFAULT 30,
    ADD COLUMN IF NOT EXISTS retry_enabled     BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS max_retries       INTEGER DEFAULT 3;

-- Match WebhookService.processDeliveries column expectations.
ALTER TABLE public.webhook_deliveries
    ADD COLUMN IF NOT EXISTS status                TEXT DEFAULT 'pending',  -- pending|sending|success|failed
    ADD COLUMN IF NOT EXISTS sent_at               TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS response_status_code  INTEGER,
    ADD COLUMN IF NOT EXISTS duration_ms           INTEGER,
    ADD COLUMN IF NOT EXISTS retry_count           INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS error_message         TEXT,
    ADD COLUMN IF NOT EXISTS created_at            TIMESTAMPTZ DEFAULT now();

-- Default the secret if a row was created before secret was required.
UPDATE public.webhook_endpoints
   SET secret = encode(gen_random_bytes(32), 'hex')
 WHERE secret IS NULL OR secret = '';

ALTER TABLE public.webhook_endpoints
    ALTER COLUMN secret SET DEFAULT encode(gen_random_bytes(32), 'hex');

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status
    ON public.webhook_deliveries(status, created_at);

-- =================================================================
-- push_subscriptions: backs /api/push/subscribe
-- =================================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    endpoint    TEXT NOT NULL,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "users own push_subscriptions"
    ON public.push_subscriptions FOR ALL
    USING (auth.uid() = user_id);

COMMENT ON TABLE public.push_subscriptions IS
    'Web Push subscriptions per user. One row per (user, endpoint).';
