-- Order ownership / lookups
CREATE INDEX IF NOT EXISTS idx_draft_orders_created_by
  ON draft_orders (created_by);

CREATE INDEX IF NOT EXISTS idx_draft_orders_status
  ON draft_orders (status);

CREATE INDEX IF NOT EXISTS idx_draft_orders_created_at
  ON draft_orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_profiles_draft_order_id
  ON order_profiles (draft_order_id);
