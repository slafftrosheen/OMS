-- =================================================================
-- 20260425000005: MISSING TABLES (referenced in code, never created)
-- =================================================================
-- Creates the 12 tables the audit found missing.  Each is RLS-enabled and
-- gets the same "authenticated can read & write" baseline as the rest of the
-- schema (Q4c keeps the existing posture).
-- =================================================================

-- -----------------------------------------------------------------
-- Order activity log: per-order timeline events
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_activity_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES public.draft_orders(id) ON DELETE CASCADE,
    actor_id    UUID REFERENCES public.profiles(id),
    event_type  TEXT NOT NULL,         -- 'status_change', 'note', 'stage_advance', 'file_upload', ...
    payload     JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_activity_log_order_id   ON public.order_activity_log(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_activity_log_event_type ON public.order_activity_log(event_type);

-- -----------------------------------------------------------------
-- Order revisions: snapshot history of an order's spec
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_revisions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES public.draft_orders(id) ON DELETE CASCADE,
    revision_number INTEGER NOT NULL,
    snapshot        JSONB NOT NULL,                         -- full order JSON at moment of save
    note            TEXT,
    created_by      UUID REFERENCES public.profiles(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(order_id, revision_number)
);
CREATE INDEX IF NOT EXISTS idx_order_revisions_order_id ON public.order_revisions(order_id, revision_number DESC);

-- -----------------------------------------------------------------
-- Rework cycles: QC failure / rework tracking
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rework_cycles (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      UUID NOT NULL REFERENCES public.draft_orders(id) ON DELETE CASCADE,
    station       TEXT NOT NULL,
    reason        TEXT NOT NULL,
    severity      TEXT DEFAULT 'minor',                     -- minor | major | critical
    reported_by   UUID REFERENCES public.profiles(id),
    resolved_by   UUID REFERENCES public.profiles(id),
    resolved_at   TIMESTAMPTZ,
    notes         TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rework_cycles_order_id ON public.rework_cycles(order_id);
CREATE INDEX IF NOT EXISTS idx_rework_cycles_station  ON public.rework_cycles(station);
CREATE INDEX IF NOT EXISTS idx_rework_cycles_open     ON public.rework_cycles(order_id) WHERE resolved_at IS NULL;

-- -----------------------------------------------------------------
-- Change requests: engineering change control
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.change_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES public.draft_orders(id) ON DELETE CASCADE,
    description     TEXT NOT NULL,
    proposed_diff   JSONB DEFAULT '{}'::jsonb,              -- structured diff against the order spec
    status          TEXT DEFAULT 'pending',                 -- pending | approved | rejected | applied | cancelled
    requested_by    UUID NOT NULL REFERENCES public.profiles(id),
    reviewed_by     UUID REFERENCES public.profiles(id),
    reviewed_at     TIMESTAMPTZ,
    review_notes    TEXT,
    applied_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_change_requests_order_id ON public.change_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_status   ON public.change_requests(status);
CREATE INDEX IF NOT EXISTS idx_change_requests_pending  ON public.change_requests(order_id) WHERE status = 'pending';

-- -----------------------------------------------------------------
-- Order QR codes
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_qr_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES public.draft_orders(id) ON DELETE CASCADE,
    code        TEXT UNIQUE NOT NULL,                       -- the encoded QR payload
    label       TEXT,
    payload     JSONB DEFAULT '{}'::jsonb,
    created_by  UUID REFERENCES public.profiles(id),
    created_at  TIMESTAMPTZ DEFAULT now(),
    last_scanned_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_order_qr_codes_order_id ON public.order_qr_codes(order_id);

-- -----------------------------------------------------------------
-- Webhook endpoints + delivery log
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    url         TEXT NOT NULL,
    secret      TEXT NOT NULL,                              -- HMAC-SHA256 secret (Phase 2)
    events      TEXT[] DEFAULT '{}'::text[],                -- which event types to receive
    is_active   BOOLEAN DEFAULT true,
    created_by  UUID REFERENCES public.profiles(id),
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active ON public.webhook_endpoints(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id     UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL,
    response_status INTEGER,
    response_body   TEXT,
    attempted_at    TIMESTAMPTZ DEFAULT now(),
    success         BOOLEAN DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON public.webhook_deliveries(endpoint_id, attempted_at DESC);

-- -----------------------------------------------------------------
-- Saved filters: per-user search/filter presets
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_filters (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    scope       TEXT NOT NULL,                              -- 'orders', 'inventory', 'calendar', ...
    name        TEXT NOT NULL,
    filters     JSONB NOT NULL,
    is_shared   BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, scope, name)
);
CREATE INDEX IF NOT EXISTS idx_saved_filters_user_scope ON public.saved_filters(user_id, scope);
CREATE INDEX IF NOT EXISTS idx_saved_filters_shared     ON public.saved_filters(scope) WHERE is_shared = true;

-- -----------------------------------------------------------------
-- Backup history & restore operations
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.backup_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    status          TEXT DEFAULT 'running',                 -- running | success | failed
    location        TEXT,                                   -- nas://reclame-nas/oms-backups/...
    size_bytes      BIGINT,
    note            TEXT,
    triggered_by    UUID REFERENCES public.profiles(id),
    error_message   TEXT
);
CREATE INDEX IF NOT EXISTS idx_backup_history_started ON public.backup_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_history_status  ON public.backup_history(status);

CREATE TABLE IF NOT EXISTS public.restore_operations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id       UUID REFERENCES public.backup_history(id),
    started_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    status          TEXT DEFAULT 'running',
    triggered_by    UUID REFERENCES public.profiles(id),
    error_message   TEXT
);
CREATE INDEX IF NOT EXISTS idx_restore_operations_started ON public.restore_operations(started_at DESC);

-- -----------------------------------------------------------------
-- Exports: tracks every export job (CSV, PDF, Excel, iCal)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    format          TEXT NOT NULL,                          -- csv | xlsx | pdf | ics
    scope           TEXT NOT NULL,                          -- orders | calendar | inventory | analytics
    filters         JSONB DEFAULT '{}'::jsonb,
    file_id         UUID REFERENCES public.files(id) ON DELETE SET NULL,
    row_count       INTEGER,
    status          TEXT DEFAULT 'pending',                 -- pending | running | success | failed
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_exports_user_id ON public.exports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exports_status  ON public.exports(status);

-- -----------------------------------------------------------------
-- Integrations: third-party connections (Slack, e-mail relays, ERPs)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integrations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind        TEXT NOT NULL,                              -- slack | smtp | erp | bcamcnc | ...
    name        TEXT NOT NULL,
    config      JSONB NOT NULL DEFAULT '{}'::jsonb,         -- non-secret config
    secret_ref  TEXT,                                       -- reference to a secret (vault path, env name)
    is_active   BOOLEAN DEFAULT true,
    created_by  UUID REFERENCES public.profiles(id),
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integrations_kind   ON public.integrations(kind);
CREATE INDEX IF NOT EXISTS idx_integrations_active ON public.integrations(is_active) WHERE is_active = true;

-- -----------------------------------------------------------------
-- Code chunks: vector store for AI orchestrator (match_code_chunks RPC)
-- -----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.code_chunks (
    id          UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    file_path   TEXT NOT NULL,
    symbol      TEXT,                                       -- function/component/class name
    content     TEXT NOT NULL,
    embedding   vector(768) NOT NULL,
    line_start  INTEGER,
    line_end    INTEGER,
    crawled_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(file_path, line_start, line_end)
);
CREATE INDEX IF NOT EXISTS idx_code_chunks_embedding
    ON public.code_chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_code_chunks_file_path ON public.code_chunks(file_path);

-- =================================================================
-- RLS — match the existing posture (Q4c: keep as today)
-- =================================================================
ALTER TABLE public.order_activity_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_revisions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rework_cycles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_qr_codes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_filters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_history        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restore_operations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exports               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_chunks           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read order_activity_log" ON public.order_activity_log;
CREATE POLICY "auth read order_activity_log"   ON public.order_activity_log    FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth write order_activity_log" ON public.order_activity_log;
CREATE POLICY "auth write order_activity_log"  ON public.order_activity_log    FOR ALL    USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth read order_revisions" ON public.order_revisions;
CREATE POLICY "auth read order_revisions"      ON public.order_revisions       FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth write order_revisions" ON public.order_revisions;
CREATE POLICY "auth write order_revisions"     ON public.order_revisions       FOR ALL    USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth read rework_cycles" ON public.rework_cycles;
CREATE POLICY "auth read rework_cycles"        ON public.rework_cycles         FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth write rework_cycles" ON public.rework_cycles;
CREATE POLICY "auth write rework_cycles"       ON public.rework_cycles         FOR ALL    USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth read change_requests" ON public.change_requests;
CREATE POLICY "auth read change_requests"      ON public.change_requests       FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth write change_requests" ON public.change_requests;
CREATE POLICY "auth write change_requests"     ON public.change_requests       FOR ALL    USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth read order_qr_codes" ON public.order_qr_codes;
CREATE POLICY "auth read order_qr_codes"       ON public.order_qr_codes        FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth write order_qr_codes" ON public.order_qr_codes;
CREATE POLICY "auth write order_qr_codes"      ON public.order_qr_codes        FOR ALL    USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth read webhook_endpoints" ON public.webhook_endpoints;
CREATE POLICY "auth read webhook_endpoints"    ON public.webhook_endpoints     FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth write webhook_endpoints" ON public.webhook_endpoints;
CREATE POLICY "auth write webhook_endpoints"   ON public.webhook_endpoints     FOR ALL    USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth read webhook_deliveries" ON public.webhook_deliveries;
CREATE POLICY "auth read webhook_deliveries"   ON public.webhook_deliveries    FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth write webhook_deliveries" ON public.webhook_deliveries;
CREATE POLICY "auth write webhook_deliveries"  ON public.webhook_deliveries    FOR ALL    USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "users own saved_filters" ON public.saved_filters;
CREATE POLICY "users own saved_filters"        ON public.saved_filters         FOR ALL    USING (auth.uid() = user_id OR is_shared = true);
DROP POLICY IF EXISTS "auth read backup_history" ON public.backup_history;
CREATE POLICY "auth read backup_history"       ON public.backup_history        FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth write backup_history" ON public.backup_history;
CREATE POLICY "auth write backup_history"      ON public.backup_history        FOR ALL    USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth read restore_operations" ON public.restore_operations;
CREATE POLICY "auth read restore_operations"   ON public.restore_operations    FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth write restore_operations" ON public.restore_operations;
CREATE POLICY "auth write restore_operations"  ON public.restore_operations    FOR ALL    USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "users own exports" ON public.exports;
CREATE POLICY "users own exports"              ON public.exports               FOR ALL    USING (auth.uid() = user_id OR auth.role() = 'service_role');
DROP POLICY IF EXISTS "auth read integrations" ON public.integrations;
CREATE POLICY "auth read integrations"         ON public.integrations          FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth write integrations" ON public.integrations;
CREATE POLICY "auth write integrations"        ON public.integrations          FOR ALL    USING (auth.role() = 'authenticated');
-- code_chunks: only service_role bypasses; authenticated reads only.
DROP POLICY IF EXISTS "auth read code_chunks" ON public.code_chunks;
CREATE POLICY "auth read code_chunks"          ON public.code_chunks           FOR SELECT USING (auth.role() = 'authenticated');

COMMENT ON TABLE public.order_activity_log IS 'Per-order timeline of system events used by the order detail view.';
COMMENT ON TABLE public.order_revisions    IS 'Snapshot history of an order''s spec for rollback / audit.';
COMMENT ON TABLE public.rework_cycles      IS 'QC failures and the rework pipeline that follows them.';
COMMENT ON TABLE public.change_requests    IS 'Engineering change control: propose -> review -> apply.';
COMMENT ON TABLE public.order_qr_codes     IS 'QR codes generated for traveller cards / station scans.';
COMMENT ON TABLE public.webhook_endpoints  IS 'Outbound webhook subscriptions; secret used for HMAC signing.';
COMMENT ON TABLE public.webhook_deliveries IS 'Audit log of every webhook attempt + response.';
COMMENT ON TABLE public.saved_filters      IS 'User-saved filter presets across orders, inventory, calendar.';
COMMENT ON TABLE public.backup_history     IS 'pg_dump runs, location, status, size.';
COMMENT ON TABLE public.restore_operations IS 'Restore attempts referencing a backup_history row.';
COMMENT ON TABLE public.exports            IS 'Export job tracking (CSV / XLSX / PDF / iCal).';
COMMENT ON TABLE public.integrations       IS 'Third-party integrations (Slack, ERP, BCAMCNC, ...).';
COMMENT ON TABLE public.code_chunks        IS 'Vector store for codebase chunks. Backs the match_code_chunks RPC used by the AI orchestrator.';
