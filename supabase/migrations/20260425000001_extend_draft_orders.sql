-- =================================================================
-- 20260425000001: EXTEND draft_orders
-- =================================================================
-- Adds columns expected by the API but missing from the original schema:
--   - updated_by  (audit / last-mutator FK)
--   - is_rd       (research & development flag)
--   - rd_notes    (R&D-specific notes)
--   - badges      (free-form JSONB metadata for UI badges)
--
-- Audit references:
--   - src/routes/api/orders/[id]/+server.ts:131,137,191
-- =================================================================

ALTER TABLE public.draft_orders
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS is_rd      BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS rd_notes   TEXT,
    ADD COLUMN IF NOT EXISTS badges     JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_draft_orders_updated_by
    ON public.draft_orders(updated_by);

CREATE INDEX IF NOT EXISTS idx_draft_orders_is_rd
    ON public.draft_orders(is_rd) WHERE is_rd = true;

-- Auto-update updated_at on every UPDATE so callers don't have to set it.
CREATE OR REPLACE FUNCTION public.draft_orders_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS draft_orders_touch_updated_at ON public.draft_orders;
CREATE TRIGGER draft_orders_touch_updated_at
    BEFORE UPDATE ON public.draft_orders
    FOR EACH ROW EXECUTE FUNCTION public.draft_orders_touch_updated_at();

COMMENT ON COLUMN public.draft_orders.updated_by IS 'Profile that performed the last mutation. Set by API on update.';
COMMENT ON COLUMN public.draft_orders.is_rd      IS 'True when this PO is an internal R&D run rather than a customer order.';
COMMENT ON COLUMN public.draft_orders.rd_notes   IS 'Internal R&D notes (only visible to engineering).';
COMMENT ON COLUMN public.draft_orders.badges     IS 'Free-form key/value metadata used by the UI for status badges (rush, vip, hot, etc.).';
