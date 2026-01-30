-- =====================================================
-- Migration 003: Order Materials
-- Description: Materials and specifications per order
-- Dependencies: 001_core_orders_schema.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS order_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  material_type TEXT NOT NULL,
  material_category TEXT,
  thickness TEXT,
  dimensions TEXT,
  color TEXT,
  ral_code TEXT,
  pantone_code TEXT,
  hex_code TEXT,
  oracal_code TEXT,
  quantity DECIMAL(10,2),
  unit TEXT DEFAULT 'pcs' CHECK (unit IN ('pcs', 'sqm', 'lm', 'kg', 'sheets')),
  supplier TEXT,
  notes TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_materials_order_id ON order_materials(order_id);
CREATE INDEX idx_order_materials_type ON order_materials(material_type);
CREATE INDEX idx_order_materials_category ON order_materials(material_category);
CREATE INDEX idx_order_materials_ral ON order_materials(ral_code) WHERE ral_code IS NOT NULL;

-- Validation: at least one color code if color is specified
CREATE OR REPLACE FUNCTION validate_material_color()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.color IS NOT NULL AND NEW.color != '' THEN
    IF NEW.ral_code IS NULL AND NEW.pantone_code IS NULL AND NEW.hex_code IS NULL AND NEW.oracal_code IS NULL THEN
      RAISE EXCEPTION 'At least one color code (RAL, Pantone, HEX, or Oracal) must be provided when color is specified';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_material_color_trigger
  BEFORE INSERT OR UPDATE ON order_materials
  FOR EACH ROW
  EXECUTE FUNCTION validate_material_color();

-- Enable RLS
ALTER TABLE order_materials ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view materials if they can view the order"
  ON order_materials FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_materials.order_id
    )
  );

CREATE POLICY "Users can modify materials if they can modify the order"
  ON order_materials FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_materials.order_id
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

COMMENT ON TABLE order_materials IS 'Materials specifications for each order';
