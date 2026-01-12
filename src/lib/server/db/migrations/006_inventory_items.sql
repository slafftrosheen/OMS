-- Migration: 006_inventory_items.sql
-- Comprehensive inventory system with items, movements, and loading calendar

-- ============================================================
-- INVENTORY ITEMS (replaces localStorage rf_items)
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_items (
  id VARCHAR(50) PRIMARY KEY,
  sku VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL,
  section VARCHAR(50) DEFAULT 'materials',
  item_group VARCHAR(100),
  subgroup VARCHAR(100),
  unit VARCHAR(20) DEFAULT 'PCS',
  stock DECIMAL(12,2) DEFAULT 0,
  min_stock DECIMAL(12,2) DEFAULT 0,
  thickness_mm DECIMAL(8,2),
  location VARCHAR(100),
  vendor VARCHAR(200),
  color_code VARCHAR(50),
  barcode VARCHAR(100),
  note TEXT,
  leftover_data JSONB DEFAULT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_category CHECK (category IN ('ACRYLIC', 'ALUMINIUM', 'STEEL', 'ACP', 'VINYL', 'PAINT', 'ADHESIVE', 'HARDWARE', 'INSTRUMENT')),
  CONSTRAINT check_section CHECK (section IN ('materials', 'leftovers', 'paints', 'tools', 'cons')),
  CONSTRAINT check_unit CHECK (unit IN ('PCS', 'M', 'M2', 'KG', 'L', 'ROLL'))
);

CREATE INDEX idx_inventory_items_sku ON inventory_items(sku);
CREATE INDEX idx_inventory_items_category ON inventory_items(category);
CREATE INDEX idx_inventory_items_section ON inventory_items(section);
CREATE INDEX idx_inventory_items_low_stock ON inventory_items(stock, min_stock) WHERE stock <= min_stock;

COMMENT ON TABLE inventory_items IS 'Inventory items with stock levels';

-- ============================================================
-- INVENTORY MOVEMENTS (replaces localStorage movements)
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_movements (
  id VARCHAR(50) PRIMARY KEY,
  item_id VARCHAR(50) NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL,
  qty DECIMAL(12,2) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  performed_by VARCHAR(100) DEFAULT 'system',
  ref_po VARCHAR(50),
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_kind CHECK (kind IN ('IN', 'OUT', 'ADJUST'))
);

CREATE INDEX idx_inventory_movements_item ON inventory_movements(item_id);
CREATE INDEX idx_inventory_movements_date ON inventory_movements(created_at DESC);
CREATE INDEX idx_inventory_movements_kind ON inventory_movements(kind);

COMMENT ON TABLE inventory_movements IS 'Stock movement history';

-- ============================================================
-- LOADING DAYS CALENDAR (replaces localStorage rf_loading_days)
-- ============================================================

CREATE TABLE IF NOT EXISTS loading_days (
  id VARCHAR(20) PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  carrier VARCHAR(200),
  note TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_loading_days_date ON loading_days(date);
CREATE INDEX idx_loading_days_active ON loading_days(is_active, date) WHERE is_active = true;

COMMENT ON TABLE loading_days IS 'Loading/shipping calendar';

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER update_inventory_items_updated_at 
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_loading_days_updated_at 
  BEFORE UPDATE ON loading_days
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SEED DATA (default inventory items)
-- ============================================================

INSERT INTO inventory_items (id, sku, name, category, section, item_group, subgroup, unit, stock, min_stock, thickness_mm, location) VALUES
  ('A-001', 'ACR-CL-3', 'Acrylic Clear 3mm', 'ACRYLIC', 'materials', 'Acrylic', 'Sheets', 'M2', 24.5, 10, 3, 'RACK A1'),
  ('A-002', 'ACR-OP-5', 'Acrylic Opal 5mm', 'ACRYLIC', 'materials', 'Acrylic', 'Sheets', 'M2', 18.0, 8, 5, 'RACK A2'),
  ('L-050', 'ALU-OFF-1200', 'Aluminium Offcut 1200mm', 'ALUMINIUM', 'leftovers', 'Aluminium', 'Profiles', 'PCS', 3, 1, NULL, 'LEFT B2'),
  ('P-010', 'RAL-3020', 'Paint RAL 3020 Red', 'PAINT', 'paints', 'RAL', 'Red tones', 'L', 7, 5, NULL, 'PAINT CAB'),
  ('I-101', 'BIT-6MM', 'CNC Endmill 6mm', 'INSTRUMENT', 'tools', 'CNC', 'Cutters', 'PCS', 12, 8, NULL, 'TOOLBOX C')
ON CONFLICT (id) DO NOTHING;
