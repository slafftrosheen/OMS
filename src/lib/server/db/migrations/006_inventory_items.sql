-- Inventory item extensions

CREATE TABLE inventory_items (
  id SERIAL PRIMARY KEY,
  inventory_stock_id INTEGER REFERENCES inventory_stock(id) ON DELETE CASCADE,
  sku VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'in_stock',
  location VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);
