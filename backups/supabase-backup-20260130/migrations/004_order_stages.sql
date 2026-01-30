-- =====================================================
-- Migration 004: Order Stages
-- Description: Track order progress through stations
-- Dependencies: 001_core_orders_schema.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS order_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  station station_type NOT NULL,
  state stage_state DEFAULT 'NOT_STARTED',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  blocked_reason TEXT,
  estimated_hours DECIMAL(5,2),
  actual_hours DECIMAL(5,2),
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(order_id, station)
);

CREATE INDEX idx_order_stages_order_id ON order_stages(order_id);
CREATE INDEX idx_order_stages_station ON order_stages(station);
CREATE INDEX idx_order_stages_state ON order_stages(state);
CREATE INDEX idx_order_stages_blocked ON order_stages(station, state) WHERE state = 'BLOCKED';

-- Function to auto-set timestamps based on state
CREATE OR REPLACE FUNCTION update_stage_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  -- Set started_at when moving to IN_PROGRESS
  IF NEW.state = 'IN_PROGRESS' AND OLD.state != 'IN_PROGRESS' THEN
    NEW.started_at = NOW();
  END IF;

  -- Set completed_at when moving to COMPLETED
  IF NEW.state = 'COMPLETED' AND OLD.state != 'COMPLETED' THEN
    NEW.completed_at = NOW();
    -- Auto-calculate actual hours if started_at exists
    IF NEW.started_at IS NOT NULL THEN
      NEW.actual_hours = EXTRACT(EPOCH FROM (NOW() - NEW.started_at)) / 3600;
    END IF;
  END IF;

  -- Clear completed_at if moving away from COMPLETED
  IF NEW.state != 'COMPLETED' AND OLD.state = 'COMPLETED' THEN
    NEW.completed_at = NULL;
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_stages_timestamps_trigger
  BEFORE UPDATE ON order_stages
  FOR EACH ROW
  EXECUTE FUNCTION update_stage_timestamps();

-- Function to initialize stages for new order
CREATE OR REPLACE FUNCTION initialize_order_stages()
RETURNS TRIGGER AS $$
BEGIN
  -- Create stage entries for all stations
  INSERT INTO order_stages (order_id, station, state)
  SELECT NEW.id, unnest(enum_range(NULL::station_type)), 'NOT_STARTED'
  ON CONFLICT (order_id, station) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER initialize_stages_on_order_create
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION initialize_order_stages();

-- Enable RLS
ALTER TABLE order_stages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view stages if they can view the order"
  ON order_stages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_stages.order_id
    )
  );

CREATE POLICY "Station users can update their station stages"
  ON order_stages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.role IN ('admin', 'manager') OR
        p.station = order_stages.station
      )
    )
  );

COMMENT ON TABLE order_stages IS 'Production stage tracking for each order through all stations';
