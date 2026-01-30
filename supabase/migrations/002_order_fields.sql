-- =====================================================
-- Migration 002: Order Fields (Custom Key-Value Data)
-- Description: Flexible field system for order metadata
-- Dependencies: 001_core_orders_schema.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS order_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT,
  field_type TEXT DEFAULT 'text' CHECK (field_type IN ('text', 'number', 'date', 'boolean', 'select', 'textarea')),
  display_order INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, key)
);

CREATE INDEX idx_order_fields_order_id ON order_fields(order_id);
CREATE INDEX idx_order_fields_key ON order_fields(key);
CREATE INDEX idx_order_fields_display_order ON order_fields(order_id, display_order);

-- Enable RLS
ALTER TABLE order_fields ENABLE ROW LEVEL SECURITY;

-- RLS Policies (inherit from orders)
CREATE POLICY "Users can view order fields if they can view the order"
  ON order_fields FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_fields.order_id
    )
  );

CREATE POLICY "Users can modify order fields if they can modify the order"
  ON order_fields FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_fields.order_id
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

COMMENT ON TABLE order_fields IS 'Custom fields for orders - flexible key-value storage';
