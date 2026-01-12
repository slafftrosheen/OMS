-- Core tables: profiles, materials, colors, orders

-- Files table (referenced by draft_orders)
CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  filepath VARCHAR(255) NOT NULL,
  mimetype VARCHAR(100) NOT NULL,
  size INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Profile templates
CREATE TABLE profile_templates (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Draft orders
CREATE TABLE draft_orders (
  id SERIAL PRIMARY KEY,
  po_number VARCHAR(50) UNIQUE NOT NULL,
  client VARCHAR(200),
  title VARCHAR(200),
  due_date DATE,
  loading_date DATE,
  cdr_file_id INTEGER REFERENCES files(id),
  pdf_file_id INTEGER REFERENCES files(id),
  status VARCHAR(20) DEFAULT 'draft',
  notes TEXT,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Order profiles
CREATE TABLE order_profiles (
  id SERIAL PRIMARY KEY,
  draft_order_id INTEGER REFERENCES draft_orders(id) ON DELETE CASCADE,
  profile_template_id INTEGER REFERENCES profile_templates(id),
  quantity INTEGER CHECK (quantity BETWEEN 1 AND 4),
  configuration JSONB DEFAULT '{}',
  notes TEXT,
  order_index INTEGER DEFAULT 0
);

-- Materials
CREATE TABLE materials (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  name_en VARCHAR(100),
  name_ru VARCHAR(100),
  name_lv VARCHAR(100),
  thickness_options JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}'
);
