-- =====================================================
-- Migration 007: Order Revisions
-- Description: Track file revisions and changes
-- Dependencies: 001_core_orders_schema.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS order_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  revision_number INTEGER NOT NULL DEFAULT 1,
  message TEXT,
  change_summary TEXT,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  UNIQUE(order_id, revision_number)
);

CREATE INDEX idx_order_revisions_order_id ON order_revisions(order_id);
CREATE INDEX idx_order_revisions_file_id ON order_revisions(file_id);
CREATE INDEX idx_order_revisions_current ON order_revisions(order_id, is_current)
  WHERE is_current = true;
CREATE INDEX idx_order_revisions_created_at ON order_revisions(created_at DESC);

-- Function to auto-increment revision number
CREATE OR REPLACE FUNCTION set_revision_number()
RETURNS TRIGGER AS $$
BEGIN
  -- Get the next revision number for this order
  SELECT COALESCE(MAX(revision_number), 0) + 1
  INTO NEW.revision_number
  FROM order_revisions
  WHERE order_id = NEW.order_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_revision_number_trigger
  BEFORE INSERT ON order_revisions
  FOR EACH ROW
  WHEN (NEW.revision_number IS NULL OR NEW.revision_number = 1)
  EXECUTE FUNCTION set_revision_number();

-- Function to ensure only one current revision per order
CREATE OR REPLACE FUNCTION ensure_single_current_revision()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = true THEN
    -- Unset all other current revisions for this order
    UPDATE order_revisions
    SET is_current = false
    WHERE order_id = NEW.order_id
      AND id != NEW.id
      AND is_current = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER single_current_revision_trigger
  AFTER INSERT OR UPDATE OF is_current ON order_revisions
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_current_revision();

-- Enable RLS
ALTER TABLE order_revisions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view revisions if they can view the order"
  ON order_revisions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_revisions.order_id
    )
  );

CREATE POLICY "Users can create revisions for orders they can edit"
  ON order_revisions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_revisions.order_id
      AND (
        auth.uid() = orders.created_by OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'manager')
        )
      )
    )
  );

CREATE POLICY "Only managers can approve or set current revision"
  ON order_revisions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

COMMENT ON TABLE order_revisions IS 'Version control for order files and specifications';
