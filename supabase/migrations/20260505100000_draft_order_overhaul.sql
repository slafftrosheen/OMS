-- =================================================================
-- 20260505100000: Draft Order System Overhaul (Slice 1)
-- =================================================================
-- Foundation for the new order lifecycle:
--   DRAFT  -> PENDING_REVIEW  -> CONFIRMED  -> IN_PRODUCTION
--          -> READY_TO_LOAD   -> DISPATCHED -> ARCHIVED
--          (+ CANCELLED / ON_HOLD side states)
--
-- Key changes:
--   1. po_number is now NULLABLE. PO is supplied by Boss at confirmation,
--      not auto-generated. Uniqueness still enforced when present.
--   2. Add lifecycle timestamps + actors:
--        confirmed_at / confirmed_by, dispatched_at / dispatched_by,
--        archived_at, voided_at / voided_by / voided_reason.
--   3. Add internal_ref auto-assigned on insert (DRAFT-yyMMdd-NNNN) so
--      pre-confirmation orders have a stable display handle.
--   4. RLS: drafts pre-confirmation are visible only to RD / Boss /
--      HeadOfProduction and the creator. Once status >= CONFIRMED the
--      order is visible to everyone authenticated.
--   5. Status CHECK constraint covers all new states + back-compat
--      legacy values (draft, approved, rejected, queued, in_progress,
--      completed, cancelled, archived) so existing rows keep working.
-- =================================================================

-- ---------------------------------------------------------------
-- 1. po_number nullable + unique-when-set
-- ---------------------------------------------------------------
ALTER TABLE public.draft_orders
    ALTER COLUMN po_number DROP NOT NULL;

-- The original UNIQUE constraint already permits multiple NULLs in
-- Postgres, so no change needed there. Verify length cap (<=16 chars).
ALTER TABLE public.draft_orders
    DROP CONSTRAINT IF EXISTS draft_orders_po_number_length_check;
ALTER TABLE public.draft_orders
    ADD CONSTRAINT draft_orders_po_number_length_check
    CHECK (po_number IS NULL OR char_length(po_number) BETWEEN 1 AND 16);

-- ---------------------------------------------------------------
-- 2. Lifecycle columns
-- ---------------------------------------------------------------
ALTER TABLE public.draft_orders
    ADD COLUMN IF NOT EXISTS internal_ref     TEXT,
    ADD COLUMN IF NOT EXISTS confirmed_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS confirmed_by     UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS dispatched_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS dispatched_by    UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS archived_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS voided_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS voided_by        UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS voided_reason    TEXT,
    ADD COLUMN IF NOT EXISTS reissued_from_id UUID REFERENCES public.draft_orders(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_orders_internal_ref
    ON public.draft_orders(internal_ref)
    WHERE internal_ref IS NOT NULL;

COMMENT ON COLUMN public.draft_orders.internal_ref IS
    'Auto-assigned pre-confirmation handle (DRAFT-yyMMdd-NNNN). Stable id for display before PO is assigned.';
COMMENT ON COLUMN public.draft_orders.confirmed_at IS
    'Timestamp when Boss/HoP confirmed the draft and assigned the PO.';
COMMENT ON COLUMN public.draft_orders.voided_reason IS
    'Reason supplied during void & reissue. The replacement order links back via reissued_from_id.';

-- ---------------------------------------------------------------
-- 3. internal_ref auto-assignment trigger
-- ---------------------------------------------------------------
-- Per-day sequence for human-friendly references. Uses a small
-- counter table rather than a sequence so we can reset per day
-- without permission gymnastics.
CREATE TABLE IF NOT EXISTS public.draft_order_ref_counters (
    day DATE PRIMARY KEY,
    last_seq INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.draft_order_ref_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Counters readable by authenticated" ON public.draft_order_ref_counters;
CREATE POLICY "Counters readable by authenticated"
    ON public.draft_order_ref_counters FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.draft_orders_assign_internal_ref()
RETURNS TRIGGER AS $$
DECLARE
    v_day DATE := CURRENT_DATE;
    v_seq INTEGER;
BEGIN
    IF NEW.internal_ref IS NOT NULL AND NEW.internal_ref <> '' THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.draft_order_ref_counters(day, last_seq)
    VALUES (v_day, 1)
    ON CONFLICT (day) DO UPDATE
        SET last_seq = public.draft_order_ref_counters.last_seq + 1
    RETURNING last_seq INTO v_seq;

    NEW.internal_ref := 'DRAFT-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS draft_orders_assign_internal_ref ON public.draft_orders;
CREATE TRIGGER draft_orders_assign_internal_ref
    BEFORE INSERT ON public.draft_orders
    FOR EACH ROW EXECUTE FUNCTION public.draft_orders_assign_internal_ref();

-- Backfill existing rows that don't have an internal_ref yet.
DO $$
DECLARE
    r RECORD;
    v_seq INTEGER;
    v_day DATE;
BEGIN
    FOR r IN
        SELECT id, created_at
        FROM public.draft_orders
        WHERE internal_ref IS NULL
        ORDER BY created_at
    LOOP
        v_day := r.created_at::date;
        INSERT INTO public.draft_order_ref_counters(day, last_seq)
        VALUES (v_day, 1)
        ON CONFLICT (day) DO UPDATE
            SET last_seq = public.draft_order_ref_counters.last_seq + 1
        RETURNING last_seq INTO v_seq;

        UPDATE public.draft_orders
        SET internal_ref = 'DRAFT-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 4, '0')
        WHERE id = r.id;
    END LOOP;
END $$;

-- ---------------------------------------------------------------
-- 4. Status CHECK constraint
-- ---------------------------------------------------------------
ALTER TABLE public.draft_orders
    DROP CONSTRAINT IF EXISTS draft_orders_status_check;
ALTER TABLE public.draft_orders
    ADD CONSTRAINT draft_orders_status_check CHECK (status IN (
        -- New canonical states
        'DRAFT', 'PENDING_REVIEW', 'CONFIRMED', 'IN_PRODUCTION',
        'READY_TO_LOAD', 'DISPATCHED', 'ARCHIVED',
        'CANCELLED', 'ON_HOLD', 'VOIDED',
        -- Legacy states retained for back-compat with rows already in the wild
        'draft', 'approved', 'rejected', 'queued', 'in_progress',
        'completed', 'cancelled', 'archived'
    ));

CREATE INDEX IF NOT EXISTS idx_draft_orders_confirmed_at
    ON public.draft_orders(confirmed_at) WHERE confirmed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_draft_orders_dispatched_at
    ON public.draft_orders(dispatched_at) WHERE dispatched_at IS NOT NULL;

-- ---------------------------------------------------------------
-- 5. Pre-confirmation visibility helper + RLS
-- ---------------------------------------------------------------
-- Pre-confirmation visibility = creator OR role IN (RD, Boss, HeadOfProduction).
-- After confirmation (status not in DRAFT/PENDING_REVIEW/legacy 'draft') the
-- order is visible to all authenticated users.
CREATE OR REPLACE FUNCTION public.is_draft_visible_to_user(
    p_status TEXT,
    p_created_by UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_role TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Public lifecycle states: anyone authenticated may view
    IF p_status NOT IN ('DRAFT', 'PENDING_REVIEW', 'draft') THEN
        RETURN TRUE;
    END IF;

    -- Pre-confirmation: creator can see own
    IF p_created_by = v_uid THEN
        RETURN TRUE;
    END IF;

    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = v_uid;

    RETURN v_role IN ('RD', 'Boss', 'HeadOfProduction');
END;
$$;

COMMENT ON FUNCTION public.is_draft_visible_to_user(TEXT, UUID) IS
    'RLS helper: pre-confirmation drafts are visible only to creator + RD/Boss/HeadOfProduction.';

-- Drop the old permissive SELECT policy and replace with the gated one.
DROP POLICY IF EXISTS "Orders viewable by all authenticated" ON public.draft_orders;
DROP POLICY IF EXISTS "Orders viewable by role-aware policy" ON public.draft_orders;
CREATE POLICY "Orders viewable by role-aware policy"
    ON public.draft_orders FOR SELECT
    USING (public.is_draft_visible_to_user(status, created_by));

-- Cascade the same gating to child tables (profiles/files/materials/fields/stages/assignees).
-- Each has a corresponding parent draft_orders row; we hide the child if
-- the parent is not visible.
CREATE OR REPLACE FUNCTION public.is_order_child_visible(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status TEXT;
    v_creator UUID;
BEGIN
    SELECT status, created_by INTO v_status, v_creator
    FROM public.draft_orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    RETURN public.is_draft_visible_to_user(v_status, v_creator);
END;
$$;

DROP POLICY IF EXISTS "Order profiles viewable by all authenticated" ON public.order_profiles;
DROP POLICY IF EXISTS "Order profiles viewable by role-aware policy" ON public.order_profiles;
CREATE POLICY "Order profiles viewable by role-aware policy"
    ON public.order_profiles FOR SELECT
    USING (public.is_order_child_visible(draft_order_id));

DROP POLICY IF EXISTS "Order files viewable by all authenticated" ON public.order_files;
DROP POLICY IF EXISTS "Order files viewable by role-aware policy" ON public.order_files;
CREATE POLICY "Order files viewable by role-aware policy"
    ON public.order_files FOR SELECT
    USING (public.is_order_child_visible(draft_order_id));

DROP POLICY IF EXISTS "Order materials viewable by all authenticated" ON public.order_materials;
DROP POLICY IF EXISTS "Order materials viewable by role-aware policy" ON public.order_materials;
CREATE POLICY "Order materials viewable by role-aware policy"
    ON public.order_materials FOR SELECT
    USING (public.is_order_child_visible(draft_order_id));

DROP POLICY IF EXISTS "Order fields viewable by all authenticated" ON public.order_fields;
DROP POLICY IF EXISTS "Order fields viewable by role-aware policy" ON public.order_fields;
CREATE POLICY "Order fields viewable by role-aware policy"
    ON public.order_fields FOR SELECT
    USING (public.is_order_child_visible(draft_order_id));

DROP POLICY IF EXISTS "Order stages viewable by all authenticated" ON public.order_stages;
DROP POLICY IF EXISTS "Order stages viewable by role-aware policy" ON public.order_stages;
CREATE POLICY "Order stages viewable by role-aware policy"
    ON public.order_stages FOR SELECT
    USING (public.is_order_child_visible(draft_order_id));

DROP POLICY IF EXISTS "Order assignees viewable by all authenticated" ON public.order_assignees;
DROP POLICY IF EXISTS "Order assignees viewable by role-aware policy" ON public.order_assignees;
CREATE POLICY "Order assignees viewable by role-aware policy"
    ON public.order_assignees FOR SELECT
    USING (public.is_order_child_visible(draft_order_id));

-- ---------------------------------------------------------------
-- 6. Convenience view: orders awaiting HoP review
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS public.orders_pending_review CASCADE;
CREATE VIEW public.orders_pending_review AS
SELECT
    o.id,
    o.internal_ref,
    o.po_number,
    o.client,
    o.title,
    o.due_date,
    o.loading_date,
    o.priority,
    o.status,
    o.notes,
    o.created_at,
    o.created_by,
    p.display_name      AS created_by_name,
    p.username          AS created_by_username,
    p.role              AS created_by_role,
    (
        SELECT COUNT(*) FROM public.order_files f
        WHERE f.draft_order_id = o.id
    ) AS file_count,
    (
        SELECT COUNT(*) FROM public.order_profiles op
        WHERE op.draft_order_id = o.id
    ) AS profile_count
FROM public.draft_orders o
LEFT JOIN public.profiles p ON p.id = o.created_by
WHERE o.status IN ('PENDING_REVIEW', 'draft');

COMMENT ON VIEW public.orders_pending_review IS
    'Drafts awaiting Head of Production confirmation. Surfaced on /orders/review.';

-- ---------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------
