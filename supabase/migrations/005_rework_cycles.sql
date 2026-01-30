-- =====================================================
-- Migration 005: Rework Cycles
-- Description: Track rework history per station
-- Dependencies: 001_core_orders_schema.sql, 004_order_stages.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS rework_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  station station_type NOT NULL,
  cycle_index INTEGER NOT NULL DEFAULT 1,
  reason rework_reason NOT NULL,
  description TEXT,
  defect_category TEXT,
  root_cause TEXT,
  corrective_action TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  CONSTRAINT positive_cycle_index CHECK (cycle_index > 0)
);

CREATE INDEX idx_rework_cycles_order_id ON rework_cycles(order_id);
CREATE INDEX idx_rework_cycles_station ON rework_cycles(station);
CREATE INDEX idx_rework_cycles_reason ON rework_cycles(reason);
CREATE INDEX idx_rework_cycles_created_at ON rework_cycles(created_at DESC);
CREATE INDEX idx_rework_cycles_unresolved ON rework_cycles(station, created_at)
  WHERE resolved_at IS NULL;

-- Function to auto-increment cycle index
CREATE OR REPLACE FUNCTION set_rework_cycle_index()
RETURNS TRIGGER AS $$
BEGIN
  -- Get the next cycle number for this order and station
  SELECT COALESCE(MAX(cycle_index), 0) + 1
  INTO NEW.cycle_index
  FROM rework_cycles
  WHERE order_id = NEW.order_id
    AND station = NEW.station;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_cycle_index_trigger
  BEFORE INSERT ON rework_cycles
  FOR EACH ROW
  EXECUTE FUNCTION set_rework_cycle_index();

-- Function to update stage state when rework is created
CREATE OR REPLACE FUNCTION handle_rework_creation()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the corresponding stage to REWORK state
  UPDATE order_stages
  SET state = 'REWORK',
      updated_at = NOW(),
      updated_by = NEW.created_by
  WHERE order_id = NEW.order_id
    AND station = NEW.station;

  -- Create notification for station assignees
  INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type)
  SELECT
    oa.user_id,
    'Rework Required',
    format('Order %s requires rework at %s station: %s',
      (SELECT po_number FROM orders WHERE id = NEW.order_id),
      NEW.station,
      NEW.reason
    ),
    'REWORK',
    NEW.order_id,
    'order'
  FROM order_assignees oa
  WHERE oa.order_id = NEW.order_id
    AND oa.station = NEW.station;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rework_creation_trigger
  AFTER INSERT ON rework_cycles
  FOR EACH ROW
  EXECUTE FUNCTION handle_rework_creation();

-- Enable RLS
ALTER TABLE rework_cycles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view rework cycles if they can view the order"
  ON rework_cycles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = rework_cycles.order_id
    )
  );

CREATE POLICY "Station users and managers can create rework cycles"
  ON rework_cycles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.role IN ('admin', 'manager') OR
        p.station = rework_cycles.station
      )
    )
  );

CREATE POLICY "Creators and managers can update rework cycles"
  ON rework_cycles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

COMMENT ON TABLE rework_cycles IS 'Rework tracking with cycle counting per station';
