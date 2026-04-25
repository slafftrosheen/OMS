-- =================================================================
-- 20260425000004: CREATE VIEW orders -> draft_orders  (Q1a)
-- =================================================================
-- Half the API calls `.from('orders')` while the schema only defines
-- `draft_orders`.  We expose `orders` as a simple updatable view so existing
-- code keeps working without a table rename.
--
-- A simple CREATE VIEW with no joins / aggregates / DISTINCT is automatically
-- updatable in PostgreSQL — INSERT / UPDATE / DELETE flow through to
-- draft_orders transparently.
-- =================================================================

DROP VIEW IF EXISTS public.orders CASCADE;

CREATE VIEW public.orders AS
SELECT * FROM public.draft_orders;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated, anon;

COMMENT ON VIEW public.orders IS
    'Updatable alias of draft_orders. Per Q1a, draft_orders remains canonical and `orders` exists for code parity. Writes flow through to draft_orders.';
