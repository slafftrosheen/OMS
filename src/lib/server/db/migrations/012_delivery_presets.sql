-- src/lib/server/db/migrations/012_delivery_presets.sql
-- Delivery address presets for major customers

-- Create delivery_presets table
CREATE TABLE IF NOT EXISTS delivery_presets (
  id SERIAL PRIMARY KEY,
  client_name VARCHAR(200) NOT NULL,
  preset_name VARCHAR(100) NOT NULL,
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'Latvia',
  contact_person VARCHAR(200),
  contact_phone VARCHAR(50),
  contact_email VARCHAR(200),
  delivery_notes TEXT,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_delivery_presets_client ON delivery_presets(client_name);
CREATE INDEX idx_delivery_presets_active ON delivery_presets(is_active) WHERE is_active = true;

-- Add delivery_preset_id to draft_orders
ALTER TABLE draft_orders ADD COLUMN IF NOT EXISTS delivery_preset_id INTEGER REFERENCES delivery_presets(id);
ALTER TABLE draft_orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE draft_orders ADD COLUMN IF NOT EXISTS delivery_contact VARCHAR(200);
ALTER TABLE draft_orders ADD COLUMN IF NOT EXISTS delivery_phone VARCHAR(50);

-- Add priority column if not exists
ALTER TABLE draft_orders ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'NORMAL';

-- Add assigned_to for admin workflow
ALTER TABLE draft_orders ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id);

-- Insert default presets for major customers
INSERT INTO delivery_presets (client_name, preset_name, address_line1, city, postal_code, country, contact_person, is_default) VALUES
('Rimi Latvia', 'Warehouse Riga', 'Maskavas iela 257', 'Riga', 'LV-1063', 'Latvia', 'Logistics Dept.', true),
('Rimi Latvia', 'Store Delivery', 'Brivibas gatve 372', 'Riga', 'LV-1006', 'Latvia', 'Store Manager', false),
('Maxima', 'Central Warehouse', 'Katlakalna iela 11', 'Riga', 'LV-1073', 'Latvia', 'Reception', true),
('Maxima', 'Regional Office', 'Ieriku iela 3', 'Riga', 'LV-1084', 'Latvia', 'Admin Office', false),
('Circle K', 'Main Office', 'Duntes iela 6', 'Riga', 'LV-1013', 'Latvia', 'Marketing Dept.', true),
('Elvi', 'Headquarters', 'Maskavas iela 322', 'Riga', 'LV-1063', 'Latvia', 'Procurement', true),
('Narvesen', 'Distribution Center', 'Piedrujas iela 7', 'Riga', 'LV-1073', 'Latvia', 'Warehouse', true),
('Hesburger', 'Baltic Office', 'Audēju iela 16', 'Riga', 'LV-1050', 'Latvia', 'Operations', true),
('McDonald''s', 'Latvia Office', 'Brivibas gatve 214a', 'Riga', 'LV-1039', 'Latvia', 'Signage Dept.', true),
('Statoil/Circle K', 'Fuel Stations', 'Duntes iela 6', 'Riga', 'LV-1013', 'Latvia', 'Station Ops', false)
ON CONFLICT DO NOTHING;

-- Create order_files table for tracking uploaded files per order
CREATE TABLE IF NOT EXISTS order_files (
  id SERIAL PRIMARY KEY,
  draft_order_id INTEGER REFERENCES draft_orders(id) ON DELETE CASCADE,
  file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  file_type VARCHAR(50) NOT NULL, -- 'sketch_pdf', 'sketch_cdr', 'work_laser', 'work_router', 'work_bender', 'work_plotter', 'other'
  display_name VARCHAR(255),
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX idx_order_files_order ON order_files(draft_order_id);
CREATE INDEX idx_order_files_type ON order_files(file_type);

-- Update trigger for delivery_presets
CREATE TRIGGER update_delivery_presets_updated_at 
  BEFORE UPDATE ON delivery_presets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE delivery_presets IS 'Pre-configured delivery addresses for major customers';
COMMENT ON TABLE order_files IS 'Files attached to orders (sketches, work files, etc.)';
