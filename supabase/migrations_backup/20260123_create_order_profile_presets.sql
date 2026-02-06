-- Create order_profile_presets table
CREATE TABLE IF NOT EXISTS order_profile_presets (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  profile_code VARCHAR(50) NOT NULL DEFAULT 'P7st',
  configuration JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_order_profile_presets_created_by ON order_profile_presets(created_by);
CREATE INDEX idx_order_profile_presets_is_public ON order_profile_presets(is_public);
CREATE INDEX idx_order_profile_presets_profile_code ON order_profile_presets(profile_code);

-- Enable RLS
ALTER TABLE order_profile_presets ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own presets"
  ON order_profile_presets FOR SELECT
  USING (auth.uid() = created_by OR is_public = true);

CREATE POLICY "Users can create presets"
  ON order_profile_presets FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own presets"
  ON order_profile_presets FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own presets"
  ON order_profile_presets FOR DELETE
  USING (auth.uid() = created_by);

-- Create material_thickness_options table
CREATE TABLE IF NOT EXISTS material_thickness_options (
  id SERIAL PRIMARY KEY,
  material_type VARCHAR(50) NOT NULL, -- 'PVC', 'ACRYLIC', etc.
  thickness NUMERIC(10, 2) NOT NULL,
  unit VARCHAR(10) NOT NULL DEFAULT 'mm',
  color VARCHAR(100),
  display_name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index
CREATE INDEX idx_material_thickness_material_type ON material_thickness_options(material_type);
CREATE INDEX idx_material_thickness_is_active ON material_thickness_options(is_active);

-- Insert sample data
INSERT INTO material_thickness_options (material_type, thickness, unit, display_name, sort_order) VALUES
  ('PVC', 3, 'mm', '3mm PVC', 10),
  ('PVC', 5, 'mm', '5mm PVC', 20),
  ('PVC', 8, 'mm', '8mm PVC', 30),
  ('PVC', 10, 'mm', '10mm PVC', 40),
  ('ACRYLIC', 3, 'mm', '3mm Acrylic', 10),
  ('ACRYLIC', 5, 'mm', '5mm Acrylic', 20),
  ('ACRYLIC', 8, 'mm', '8mm Acrylic', 30),
  ('ACRYLIC', 10, 'mm', '10mm Acrylic', 40),
  ('DIBOND', 3, 'mm', '3mm Dibond', 10),
  ('DIBOND', 4, 'mm', '4mm Dibond', 20),
  ('DIBOND', 6, 'mm', '6mm Dibond', 30),
  ('ALUMINUM', 1.5, 'mm', '1.5mm Aluminum', 10),
  ('ALUMINUM', 2, 'mm', '2mm Aluminum', 20),
  ('ALUMINUM', 3, 'mm', '3mm Aluminum', 30);

-- Enable RLS
ALTER TABLE material_thickness_options ENABLE ROW LEVEL SECURITY;

-- Public read access for thickness options
CREATE POLICY "Anyone can view material thickness options"
  ON material_thickness_options FOR SELECT
  USING (is_active = true);

-- Comment
COMMENT ON TABLE order_profile_presets IS 'Stores reusable order profile templates';
COMMENT ON TABLE material_thickness_options IS 'Available material thickness options with units';