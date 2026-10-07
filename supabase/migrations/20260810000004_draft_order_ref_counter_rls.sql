-- ============================================================================
-- 20260810000004_draft_order_ref_counter_rls.sql
-- The BEFORE INSERT trigger draft_orders_assign_internal_ref() inserts into
-- draft_order_ref_counters, but the function was NOT SECURITY DEFINER. When the
-- app inserts a draft_order via the authenticated (anon/auth) client, the
-- trigger runs as that role and is blocked by RLS on draft_order_ref_counters
-- (which only had a SELECT policy) -> "new row violates row-level security
-- policy for table draft_order_ref_counters". Recreate the function as
-- SECURITY DEFINER (bypasses RLS for the counter update) and re-attach trigger.
-- Idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.draft_orders_assign_internal_ref()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS draft_orders_assign_internal_ref ON public.draft_orders;
CREATE TRIGGER draft_orders_assign_internal_ref
  BEFORE INSERT ON public.draft_orders
  FOR EACH ROW EXECUTE FUNCTION public.draft_orders_assign_internal_ref();
