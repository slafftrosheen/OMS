/**
 * Loading Capacity Management Migration
 * Adds capacity tracking and warnings for loading days
 */

-- Add capacity fields to loading_days table
ALTER TABLE loading_days
ADD COLUMN IF NOT EXISTS max_capacity INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS capacity_unit TEXT DEFAULT 'orders' CHECK (
  capacity_unit IN ('orders', 'pallets', 'crates', 'weight_kg', 'volume_m3')
),
ADD COLUMN IF NOT EXISTS current_capacity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS warning_threshold INTEGER DEFAULT 8, -- 80% by default
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

-- Add capacity tracking to orders
ALTER TABLE draft_orders
ADD COLUMN IF NOT EXISTS capacity_weight NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS pallet_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS crate_count INTEGER DEFAULT 1;

-- Create capacity history table
CREATE TABLE IF NOT EXISTS loading_capacity_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loading_day_id UUID NOT NULL REFERENCES loading_days(id) ON DELETE CASCADE,
  order_id UUID REFERENCES draft_orders(id) ON DELETE SET NULL,
  
  action TEXT NOT NULL CHECK (action IN ('added', 'removed', 'updated', 'locked', 'unlocked')),
  capacity_before INTEGER,
  capacity_after INTEGER,
  
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_capacity_history_day ON loading_capacity_history(loading_day_id);
CREATE INDEX idx_capacity_history_order ON loading_capacity_history(order_id);
CREATE INDEX idx_capacity_history_created ON loading_capacity_history(created_at DESC);

-- Function to calculate current capacity
CREATE OR REPLACE FUNCTION calculate_loading_day_capacity(p_loading_day_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM draft_orders
  WHERE loading_day_id = p_loading_day_id
    AND status NOT IN ('cancelled', 'completed');
  
  RETURN v_count;
END;
$$;

-- Function to check capacity before assigning order
CREATE OR REPLACE FUNCTION check_loading_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_capacity INTEGER;
  v_current_capacity INTEGER;
  v_is_locked BOOLEAN;
  v_capacity_unit TEXT;
BEGIN
  IF NEW.loading_day_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get loading day capacity settings
  SELECT max_capacity, is_locked, capacity_unit
  INTO v_max_capacity, v_is_locked, v_capacity_unit
  FROM loading_days
  WHERE id = NEW.loading_day_id;

  -- Check if day is locked
  IF v_is_locked THEN
    RAISE EXCEPTION 'Loading day is locked. Cannot assign new orders.';
  END IF;

  -- Calculate current capacity
  v_current_capacity := calculate_loading_day_capacity(NEW.loading_day_id);

  -- Check if over capacity
  IF v_current_capacity >= v_max_capacity THEN
    RAISE EXCEPTION 'Loading day at maximum capacity (% / %)', v_current_capacity, v_max_capacity;
  END IF;

  -- Update current capacity in loading_days
  UPDATE loading_days
  SET current_capacity = v_current_capacity + 1
  WHERE id = NEW.loading_day_id;

  -- Log capacity change
  INSERT INTO loading_capacity_history (
    loading_day_id,
    order_id,
    action,
    capacity_before,
    capacity_after,
    created_by
  )
  VALUES (
    NEW.loading_day_id,
    NEW.id,
    'added',
    v_current_capacity,
    v_current_capacity + 1,
    COALESCE(NEW.updated_by, NEW.created_by)
  );

  RETURN NEW;
END;
$$;

-- Trigger to check capacity on order assignment
CREATE TRIGGER trigger_check_loading_capacity
BEFORE INSERT OR UPDATE OF loading_day_id ON draft_orders
FOR EACH ROW
WHEN (NEW.loading_day_id IS NOT NULL)
EXECUTE FUNCTION check_loading_capacity();

-- Function to lock/unlock loading day
CREATE OR REPLACE FUNCTION toggle_loading_day_lock(
  p_loading_day_id UUID,
  p_lock BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can lock/unlock loading days';
  END IF;

  UPDATE loading_days
  SET 
    is_locked = p_lock,
    locked_by = CASE WHEN p_lock THEN auth.uid() ELSE NULL END,
    locked_at = CASE WHEN p_lock THEN NOW() ELSE NULL END
  WHERE id = p_loading_day_id;

  -- Log action
  INSERT INTO loading_capacity_history (
    loading_day_id,
    action,
    notes,
    created_by
  )
  VALUES (
    p_loading_day_id,
    CASE WHEN p_lock THEN 'locked' ELSE 'unlocked' END,
    CASE WHEN p_lock THEN 'Loading day locked' ELSE 'Loading day unlocked' END,
    auth.uid()
  );

  RETURN TRUE;
END;
$$;

-- View for capacity overview
CREATE OR REPLACE VIEW loading_capacity_overview AS
SELECT 
  ld.id,
  ld.date,
  ld.max_capacity,
  ld.current_capacity,
  ld.warning_threshold,
  ld.capacity_unit,
  ld.is_locked,
  (ld.current_capacity::FLOAT / ld.max_capacity::FLOAT * 100)::INTEGER as capacity_percentage,
  CASE 
    WHEN ld.current_capacity >= ld.max_capacity THEN 'full'
    WHEN ld.current_capacity >= ld.warning_threshold THEN 'warning'
    ELSE 'ok'
  END as capacity_status,
  COUNT(do.id) as order_count,
  ARRAY_AGG(do.po_number ORDER BY do.created_at) FILTER (WHERE do.id IS NOT NULL) as assigned_orders
FROM loading_days ld
LEFT JOIN draft_orders do ON do.loading_day_id = ld.id AND do.status NOT IN ('cancelled', 'completed')
GROUP BY ld.id, ld.date, ld.max_capacity, ld.current_capacity, ld.warning_threshold, ld.capacity_unit, ld.is_locked
ORDER BY ld.date;

COMMENT ON TABLE loading_capacity_history IS 'Audit trail for loading day capacity changes';
COMMENT ON FUNCTION check_loading_capacity IS 'Validates capacity before assigning orders to loading days';
COMMENT ON FUNCTION toggle_loading_day_lock IS 'Admin function to lock/unlock loading days';
COMMENT ON VIEW loading_capacity_overview IS 'Real-time overview of loading day capacities and status';