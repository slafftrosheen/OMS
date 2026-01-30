-- =====================================================
-- Migration 001: Core Orders Schema
-- Description: Base orders table with all essential fields
-- Dependencies: None (base migration)
-- =====================================================

-- Create station type enum
CREATE TYPE station_type AS ENUM (
  'CAD', 'CNC', 'SANDING', 'BENDING', 'WELDING',
  'PAINT', 'ASSEMBLY', 'QC', 'LOGISTICS'
);

-- Create stage state enum
CREATE TYPE stage_state AS ENUM (
  'NOT_STARTED', 'QUEUED', 'IN_PROGRESS',
  'BLOCKED', 'REWORK', 'COMPLETED'
);

-- Create rework reason enum
CREATE TYPE rework_reason AS ENUM (
  'RECUT', 'RESAND', 'REBEND', 'REWELD',
  'REPAINT', 'REASSEMBLE', 'RECHECK', 'CUSTOM'
);

-- Main orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE,
  title TEXT NOT NULL,
  client TEXT NOT NULL,
  due_date DATE NOT NULL,
  loading_date DATE,
  is_rd BOOLEAN DEFAULT false,
  rd_notes TEXT,
  badges TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled', 'on_hold')),
  priority INTEGER DEFAULT 0 CHECK (priority >= 0 AND priority <= 10),
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Create indexes for common queries
CREATE INDEX idx_orders_loading_date ON orders(loading_date) WHERE loading_date IS NOT NULL;
CREATE INDEX idx_orders_due_date ON orders(due_date);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_is_rd ON orders(is_rd) WHERE is_rd = true;
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_client ON orders(client);
CREATE INDEX idx_orders_po_number ON orders(po_number) WHERE po_number IS NOT NULL;

-- Add full-text search
CREATE INDEX idx_orders_search ON orders USING gin(
  to_tsvector('english',
    coalesce(po_number, '') || ' ' ||
    coalesce(title, '') || ' ' ||
    coalesce(client, '')
  )
);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at_trigger
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_orders_updated_at();

-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view all orders"
  ON orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their own orders or admins can update all"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Only admins can delete orders"
  ON orders FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Add comment
COMMENT ON TABLE orders IS 'Core orders table - main entity for production order management';
