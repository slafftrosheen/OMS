-- =====================================================
-- Migration 008: Order Activity Log
-- Description: Comprehensive audit trail for orders
-- Dependencies: 001_core_orders_schema.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS order_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'CREATED', 'UPDATED', 'STATUS_CHANGED', 'STAGE_CHANGED',
    'ASSIGNED', 'UNASSIGNED', 'REWORK_ADDED', 'COMMENT_ADDED',
    'FILE_UPLOADED', 'REVISION_CREATED', 'LOADING_DATE_SET',
    'PRIORITY_CHANGED', 'MATERIAL_ADDED', 'MATERIAL_UPDATED'
  )),
  description TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_log_order_id ON order_activity_log(order_id);
CREATE INDEX idx_activity_log_created_at ON order_activity_log(created_at DESC);
CREATE INDEX idx_activity_log_activity_type ON order_activity_log(activity_type);
CREATE INDEX idx_activity_log_user_id ON order_activity_log(user_id);

-- Partition by month for better performance
CREATE TABLE order_activity_log_2026_01 PARTITION OF order_activity_log
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE order_activity_log_2026_02 PARTITION OF order_activity_log
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Function to log order changes
CREATE OR REPLACE FUNCTION log_order_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO order_activity_log (
      order_id, activity_type, description, new_value, user_id, user_name
    ) VALUES (
      NEW.id,
      'CREATED',
      format('Order %s created', NEW.po_number),
      to_jsonb(NEW),
      NEW.created_by,
      (SELECT full_name FROM profiles WHERE id = NEW.created_by)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Status changed
    IF OLD.status != NEW.status THEN
      INSERT INTO order_activity_log (
        order_id, activity_type, description, old_value, new_value, user_id, user_name
      ) VALUES (
        NEW.id,
        'STATUS_CHANGED',
        format('Status changed from %s to %s', OLD.status, NEW.status),
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status),
        NEW.updated_by,
        (SELECT full_name FROM profiles WHERE id = NEW.updated_by)
      );
    END IF;

    -- Priority changed
    IF OLD.priority != NEW.priority THEN
      INSERT INTO order_activity_log (
        order_id, activity_type, description, old_value, new_value, user_id, user_name
      ) VALUES (
        NEW.id,
        'PRIORITY_CHANGED',
        format('Priority changed from %s to %s', OLD.priority, NEW.priority),
        jsonb_build_object('priority', OLD.priority),
        jsonb_build_object('priority', NEW.priority),
        NEW.updated_by,
        (SELECT full_name FROM profiles WHERE id = NEW.updated_by)
      );
    END IF;

    -- Loading date set
    IF OLD.loading_date IS DISTINCT FROM NEW.loading_date THEN
      INSERT INTO order_activity_log (
        order_id, activity_type, description, old_value, new_value, user_id, user_name
      ) VALUES (
        NEW.id,
        'LOADING_DATE_SET',
        format('Loading date changed from %s to %s',
          COALESCE(OLD.loading_date::text, 'unset'),
          COALESCE(NEW.loading_date::text, 'unset')
        ),
        jsonb_build_object('loading_date', OLD.loading_date),
        jsonb_build_object('loading_date', NEW.loading_date),
        NEW.updated_by,
        (SELECT full_name FROM profiles WHERE id = NEW.updated_by)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_order_changes_trigger
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION log_order_changes();

-- Enable RLS
ALTER TABLE order_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view activity log if they can view the order"
  ON order_activity_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_activity_log.order_id
    )
  );

-- No insert/update/delete policies - only system triggers should modify this table

COMMENT ON TABLE order_activity_log IS 'Comprehensive audit trail for all order changes';
