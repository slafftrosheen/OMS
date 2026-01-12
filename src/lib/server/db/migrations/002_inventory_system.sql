-- Inventory, suppliers, stock, purchase orders

-- Suppliers
CREATE TABLE suppliers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(50) UNIQUE,
  contact_person VARCHAR(200),
  email VARCHAR(200),
  phone VARCHAR(50),
  address TEXT,
  country VARCHAR(100),
  payment_terms TEXT,
  delivery_time_days INTEGER,
  is_active BOOLEAN DEFAULT true
);

-- Inventory stock
CREATE TABLE inventory_stock (
  id SERIAL PRIMARY KEY,
  material_id INTEGER REFERENCES materials(id),
  thickness DECIMAL(5, 2),
  quantity_in_stock DECIMAL(10, 2) NOT NULL DEFAULT 0,
  unit_of_measure VARCHAR(20) NOT NULL,
  location VARCHAR(100),
  minimum_stock_level DECIMAL(10, 2),
  reorder_point DECIMAL(10, 2),
  cost_per_unit DECIMAL(10, 2),
  total_value DECIMAL(12, 2) GENERATED ALWAYS AS (quantity_in_stock * cost_per_unit) STORED
);

-- Stock movements
CREATE TABLE stock_movements (
  id SERIAL PRIMARY KEY,
  inventory_stock_id INTEGER REFERENCES inventory_stock(id),
  movement_type VARCHAR(20) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  reference_type VARCHAR(50),
  reference_id INTEGER,
  reason VARCHAR(100),
  moved_by VARCHAR(100),
  moved_at TIMESTAMP DEFAULT NOW()
);
