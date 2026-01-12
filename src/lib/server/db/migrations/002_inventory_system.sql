-- src/lib/server/db/migrations/002_inventory_system.sql

-- ==========================================
-- SUPPLIERS & VENDORS
-- ==========================================

CREATE TABLE suppliers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(50) UNIQUE,
  contact_person VARCHAR(200),
  email VARCHAR(200),
  phone VARCHAR(50),
  address TEXT,
  country VARCHAR(100),
  website VARCHAR(255),
  payment_terms TEXT,
  delivery_time_days INTEGER,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE suppliers IS 'Suppliers and vendors (e.g., Proplastik)';
CREATE INDEX idx_suppliers_code ON suppliers(code);
CREATE INDEX idx_suppliers_active ON suppliers(is_active) WHERE is_active = true;

-- Seed main supplier
INSERT INTO suppliers (name, code, website, country, is_active) VALUES
  ('Proplastik', 'PROPLASTIK', 'https://proplastik.lv/', 'Latvia', true),
  ('Evonik (PLEXIGLAS)', 'EVONIK', 'https://www.plexiglas.de/', 'Germany', true),
  ('Oracal', 'ORACAL', 'https://www.orafol.com/', 'Germany', true);

-- ==========================================
-- MATERIAL SUPPLIERS (Many-to-Many)
-- ==========================================

CREATE TABLE material_suppliers (
  id SERIAL PRIMARY KEY,
  material_id INTEGER REFERENCES materials(id) ON DELETE CASCADE,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_code VARCHAR(100),
  unit_price DECIMAL(10, 2),
  currency VARCHAR(3) DEFAULT 'EUR',
  minimum_order_quantity DECIMAL(10, 2),
  unit_of_measure VARCHAR(20),
  lead_time_days INTEGER,
  is_preferred BOOLEAN DEFAULT false,
  last_price_update TIMESTAMP,
  notes TEXT,
  UNIQUE(material_id, supplier_id)
);

COMMENT ON TABLE material_suppliers IS 'Material pricing and supplier relationships';
CREATE INDEX idx_material_suppliers_material ON material_suppliers(material_id);
CREATE INDEX idx_material_suppliers_supplier ON material_suppliers(supplier_id);
CREATE INDEX idx_material_suppliers_preferred ON material_suppliers(is_preferred) WHERE is_preferred = true;

-- ==========================================
-- INVENTORY STOCK
-- ==========================================

CREATE TABLE inventory_stock (
  id SERIAL PRIMARY KEY,
  material_id INTEGER REFERENCES materials(id) ON DELETE RESTRICT,
  thickness DECIMAL(5, 2),
  quantity_in_stock DECIMAL(10, 2) NOT NULL DEFAULT 0,
  unit_of_measure VARCHAR(20) NOT NULL,
  location VARCHAR(100),
  minimum_stock_level DECIMAL(10, 2),
  reorder_point DECIMAL(10, 2),
  last_stocktake_date DATE,
  last_stocktake_quantity DECIMAL(10, 2),
  cost_per_unit DECIMAL(10, 2),
  total_value DECIMAL(12, 2) GENERATED ALWAYS AS (quantity_in_stock * cost_per_unit) STORED,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(material_id, thickness, location)
);

COMMENT ON TABLE inventory_stock IS 'Current inventory stock levels';
CREATE INDEX idx_inventory_stock_material ON inventory_stock(material_id);
CREATE INDEX idx_inventory_stock_low ON inventory_stock(quantity_in_stock)
  WHERE quantity_in_stock <= minimum_stock_level;

-- ==========================================
-- STOCK MOVEMENTS
-- ==========================================

CREATE TABLE stock_movements (
  id SERIAL PRIMARY KEY,
  inventory_stock_id INTEGER REFERENCES inventory_stock(id) ON DELETE CASCADE,
  movement_type VARCHAR(20) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  unit_of_measure VARCHAR(20) NOT NULL,
  reference_type VARCHAR(50),
  reference_id INTEGER,
  reason VARCHAR(100),
  notes TEXT,
  moved_by VARCHAR(100),
  moved_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_movement_type CHECK (movement_type IN (
    'PURCHASE', 'SALE', 'PRODUCTION_USE', 'WASTE', 'ADJUSTMENT',
    'TRANSFER', 'RETURN', 'DAMAGE', 'STOCKTAKE'
  ))
);

COMMENT ON TABLE stock_movements IS 'All inventory movements and transactions';
CREATE INDEX idx_stock_movements_inventory ON stock_movements(inventory_stock_id);
CREATE INDEX idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX idx_stock_movements_reference ON stock_movements(reference_type, reference_id);
CREATE INDEX idx_stock_movements_date ON stock_movements(moved_at DESC);

-- ==========================================
-- PURCHASE ORDERS
-- ==========================================

CREATE TABLE purchase_orders (
  id SERIAL PRIMARY KEY,
  po_number VARCHAR(50) UNIQUE NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id),
  order_date DATE NOT NULL,
  expected_delivery_date DATE,
  actual_delivery_date DATE,
  status VARCHAR(20) DEFAULT 'DRAFT',
  subtotal DECIMAL(12, 2),
  tax DECIMAL(12, 2),
  shipping_cost DECIMAL(10, 2),
  total DECIMAL(12, 2),
  currency VARCHAR(3) DEFAULT 'EUR',
  payment_status VARCHAR(20),
  notes TEXT,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_po_status CHECK (status IN (
    'DRAFT', 'SUBMITTED', 'CONFIRMED', 'PARTIALLY_RECEIVED',
    'RECEIVED', 'CANCELLED'
  ))
);

COMMENT ON TABLE purchase_orders IS 'Purchase orders to suppliers';
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_purchase_orders_date ON purchase_orders(order_date DESC);

-- ==========================================
-- PURCHASE ORDER ITEMS
-- ==========================================

CREATE TABLE purchase_order_items (
  id SERIAL PRIMARY KEY,
  purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
  material_id INTEGER REFERENCES materials(id),
  thickness DECIMAL(5, 2),
  quantity_ordered DECIMAL(10, 2) NOT NULL,
  quantity_received DECIMAL(10, 2) DEFAULT 0,
  unit_of_measure VARCHAR(20) NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  line_total DECIMAL(12, 2) GENERATED ALWAYS AS (quantity_ordered * unit_price) STORED,
  notes TEXT
);

COMMENT ON TABLE purchase_order_items IS 'Line items in purchase orders';
CREATE INDEX idx_po_items_po ON purchase_order_items(purchase_order_id);
CREATE INDEX idx_po_items_material ON purchase_order_items(material_id);

-- ==========================================
-- MATERIAL USAGE TRACKING (Production Orders)
-- ==========================================

CREATE TABLE material_usage (
  id SERIAL PRIMARY KEY,
  draft_order_id INTEGER REFERENCES draft_orders(id) ON DELETE CASCADE,
  order_profile_id INTEGER REFERENCES order_profiles(id),
  material_id INTEGER REFERENCES materials(id),
  thickness DECIMAL(5, 2),
  quantity_used DECIMAL(10, 2) NOT NULL,
  unit_of_measure VARCHAR(20) NOT NULL,
  waste_quantity DECIMAL(10, 2) DEFAULT 0,
  cost_per_unit DECIMAL(10, 2),
  total_cost DECIMAL(12, 2) GENERATED ALWAYS AS (quantity_used * cost_per_unit) STORED,
  usage_date TIMESTAMP DEFAULT NOW(),
  recorded_by VARCHAR(100),
  notes TEXT
);

COMMENT ON TABLE material_usage IS 'Material consumption per production order';
CREATE INDEX idx_material_usage_order ON material_usage(draft_order_id);
CREATE INDEX idx_material_usage_profile ON material_usage(order_profile_id);
CREATE INDEX idx_material_usage_material ON material_usage(material_id);
CREATE INDEX idx_material_usage_date ON material_usage(usage_date DESC);

-- ==========================================
-- COLOR INVENTORY (Paint, Films, etc.)
-- ==========================================

CREATE TABLE color_inventory (
  id SERIAL PRIMARY KEY,
  color_system_id INTEGER REFERENCES color_systems(id) ON DELETE RESTRICT,
  product_type VARCHAR(50) NOT NULL,
  brand VARCHAR(100),
  product_code VARCHAR(100),
  quantity_in_stock DECIMAL(10, 2) DEFAULT 0,
  unit_of_measure VARCHAR(20) NOT NULL,
  location VARCHAR(100),
  minimum_stock_level DECIMAL(10, 2),
  cost_per_unit DECIMAL(10, 2),
  expiry_date DATE,
  batch_number VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_product_type CHECK (product_type IN (
    'PAINT', 'FILM', 'VINYL', 'INK', 'OTHER'
  ))
);

COMMENT ON TABLE color_inventory IS 'Inventory for paints, films, and colored materials';
CREATE INDEX idx_color_inventory_color ON color_inventory(color_system_id);
CREATE INDEX idx_color_inventory_type ON color_inventory(product_type);
CREATE INDEX idx_color_inventory_low ON color_inventory(quantity_in_stock)
  WHERE quantity_in_stock <= minimum_stock_level;

-- ==========================================
-- MATERIAL COST HISTORY
-- ==========================================

CREATE TABLE material_cost_history (
  id SERIAL PRIMARY KEY,
  material_id INTEGER REFERENCES materials(id) ON DELETE CASCADE,
  thickness DECIMAL(5, 2),
  cost_per_unit DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  effective_date DATE NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id),
  changed_by VARCHAR(100),
  reason VARCHAR(200),
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE material_cost_history IS 'Historical material pricing for cost tracking';
CREATE INDEX idx_cost_history_material ON material_cost_history(material_id, effective_date DESC);

-- ==========================================
-- WASTE TRACKING
-- ==========================================

CREATE TABLE waste_tracking (
  id SERIAL PRIMARY KEY,
  material_id INTEGER REFERENCES materials(id),
  thickness DECIMAL(5, 2),
  quantity_wasted DECIMAL(10, 2) NOT NULL,
  unit_of_measure VARCHAR(20) NOT NULL,
  waste_type VARCHAR(50),
  reason TEXT,
  draft_order_id INTEGER REFERENCES draft_orders(id),
  cost_impact DECIMAL(10, 2),
  recorded_by VARCHAR(100),
  recorded_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_waste_type CHECK (waste_type IN (
    'OFFCUT', 'DEFECT', 'MEASUREMENT_ERROR', 'DAMAGE', 'EXPIRED', 'OTHER'
  ))
);

COMMENT ON TABLE waste_tracking IS 'Material waste tracking for cost analysis';
CREATE INDEX idx_waste_material ON waste_tracking(material_id);
CREATE INDEX idx_waste_order ON waste_tracking(draft_order_id);
CREATE INDEX idx_waste_date ON waste_tracking(recorded_at DESC);

-- ==========================================
-- TRIGGERS FOR STOCK UPDATES
-- ==========================================

-- Auto-update inventory on stock movements
CREATE OR REPLACE FUNCTION update_inventory_from_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.movement_type IN ('PURCHASE', 'RETURN', 'ADJUSTMENT') THEN
    UPDATE inventory_stock
    SET quantity_in_stock = quantity_in_stock + NEW.quantity,
        updated_at = NOW()
    WHERE id = NEW.inventory_stock_id;
  ELSIF NEW.movement_type IN ('SALE', 'PRODUCTION_USE', 'WASTE', 'DAMAGE') THEN
    UPDATE inventory_stock
    SET quantity_in_stock = quantity_in_stock - NEW.quantity,
        updated_at = NOW()
    WHERE id = NEW.inventory_stock_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_inventory_stock
  AFTER INSERT ON stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_from_movement();

-- Auto-update purchase order status
CREATE OR REPLACE FUNCTION update_purchase_order_status()
RETURNS TRIGGER AS $$
DECLARE
  total_ordered DECIMAL(10,2);
  total_received DECIMAL(10,2);
BEGIN
  SELECT
    SUM(quantity_ordered),
    SUM(quantity_received)
  INTO total_ordered, total_received
  FROM purchase_order_items
  WHERE purchase_order_id = NEW.purchase_order_id;

  IF total_received >= total_ordered THEN
    UPDATE purchase_orders
    SET status = 'RECEIVED', updated_at = NOW()
    WHERE id = NEW.purchase_order_id;
  ELSIF total_received > 0 THEN
    UPDATE purchase_orders
    SET status = 'PARTIALLY_RECEIVED', updated_at = NOW()
    WHERE id = NEW.purchase_order_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_po_status
  AFTER UPDATE OF quantity_received ON purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_purchase_order_status();

-- Update timestamps
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_stock_updated_at BEFORE UPDATE ON inventory_stock
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_color_inventory_updated_at BEFORE UPDATE ON color_inventory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
