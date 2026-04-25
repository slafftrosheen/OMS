-- =================================================================
-- 20260425000009: COMPOSITE / PARTIAL INDEXES
-- =================================================================
-- Indexes the audit found missing for hot query paths.  All idempotent.
-- =================================================================

-- Existing index on (draft_order_id, state) survived the rename because
-- PostgreSQL renames index columns transparently.  We re-create with the
-- new name for clarity, gated on existence.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_order_stages_order_state') THEN
        CREATE INDEX idx_order_stages_order_state ON public.order_stages(order_id, state);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_materials_order   ON public.order_materials(order_id);
CREATE INDEX IF NOT EXISTS idx_order_files_order       ON public.order_files(order_id);
CREATE INDEX IF NOT EXISTS idx_order_assignees_order   ON public.order_assignees(order_id);
CREATE INDEX IF NOT EXISTS idx_order_profiles_order   ON public.order_profiles(order_id);
CREATE INDEX IF NOT EXISTS idx_order_fields_order      ON public.order_fields(order_id);

-- Chat
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created
    ON public.chat_messages(room_id, created_at DESC);

-- Activity log latest-N queries
CREATE INDEX IF NOT EXISTS idx_order_activity_log_latest
    ON public.order_activity_log(order_id, created_at DESC);

-- pg_trgm GIN indexes for global_search performance
CREATE INDEX IF NOT EXISTS idx_draft_orders_po_trgm
    ON public.draft_orders USING gin (po_number extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_draft_orders_client_trgm
    ON public.draft_orders USING gin (client extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_draft_orders_title_trgm
    ON public.draft_orders USING gin (title extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_full_name_trgm
    ON public.profiles USING gin (full_name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_materials_name_trgm
    ON public.materials USING gin (name_en extensions.gin_trgm_ops);
