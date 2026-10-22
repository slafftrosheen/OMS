-- The order-child policies still call this legacy helper after order_assignees
-- was renamed to draft_order_id. The stale column made profile/file/stage reads
-- fail, including reopening a successfully created draft.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_access_order(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.draft_orders
      WHERE id = p_order_id
        AND (created_by = auth.uid() OR public.is_admin())
    )
    OR EXISTS (
      SELECT 1 FROM public.order_assignees
      WHERE draft_order_id = p_order_id
        AND assignee_id = auth.uid()
    )
  );
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
