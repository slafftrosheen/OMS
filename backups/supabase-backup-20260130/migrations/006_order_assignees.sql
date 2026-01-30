-- =====================================================
-- Migration 006: Order Assignees
-- Description: Assign users to orders per station
-- Dependencies: 001_core_orders_schema.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS order_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  station station_type NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'worker' CHECK (role IN ('lead', 'worker', 'qc', 'assistant')),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  notes TEXT,
  UNIQUE(order_id, station, user_id)
);

CREATE INDEX idx_order_assignees_order_id ON order_assignees(order_id);
CREATE INDEX idx_order_assignees_user_id ON order_assignees(user_id);
CREATE INDEX idx_order_assignees_station ON order_assignees(station);
CREATE INDEX idx_order_assignees_order_station ON order_assignees(order_id, station);

-- Function to notify user when assigned
CREATE OR REPLACE FUNCTION notify_on_assignment()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type)
  VALUES (
    NEW.user_id,
    'New Order Assignment',
    format('You have been assigned to order %s at %s station',
      (SELECT po_number FROM orders WHERE id = NEW.order_id),
      NEW.station
    ),
    'ASSIGNMENT',
    NEW.order_id,
    'order'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assignee_notification_trigger
  AFTER INSERT ON order_assignees
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_assignment();

-- Enable RLS
ALTER TABLE order_assignees ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view assignees if they can view the order"
  ON order_assignees FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_assignees.order_id
    )
  );

CREATE POLICY "Managers can assign users to orders"
  ON order_assignees FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Managers can modify assignments"
  ON order_assignees FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Managers can remove assignments"
  ON order_assignees FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

COMMENT ON TABLE order_assignees IS 'User assignments to orders per station';
