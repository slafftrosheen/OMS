-- Add canvas_state column to draft_orders for persisting the tldraw JSON document.
-- This is a single lightweight JSONB column — no schema restructuring required.
ALTER TABLE draft_orders
  ADD COLUMN IF NOT EXISTS canvas_state jsonb DEFAULT NULL;

-- RLS: same policy as the rest of draft_orders (policy already exists via RLS hardening).
-- No new policies needed — the existing row-level security on draft_orders covers this column.

COMMENT ON COLUMN draft_orders.canvas_state IS
  'Serialised tldraw store snapshot (JSON) representing the visual canvas for this order.';
