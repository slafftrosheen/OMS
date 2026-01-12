# Database Schema

Complete reference for the PostgreSQL database schema.

## Schema Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CORE ENTITIES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │    users     │    │draft_orders  │    │  materials   │                  │
│  ├──────────────┤    ├──────────────┤    ├──────────────┤                  │
│  │ id           │    │ id           │    │ id           │                  │
│  │ username     │◄───│ created_by   │    │ code         │                  │
│  │ display_name │    │ po_number    │    │ category     │                  │
│  │ roles (JSON) │    │ client       │    │ thickness    │                  │
│  │ stations[]   │    │ status       │    │ metadata     │                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│         │                   │                   │                           │
│         ▼                   ▼                   ▼                           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │user_sessions │    │order_profiles│    │inventory_stock│                  │
│  │user_preferences│  │              │    │stock_movements│                  │
│  │audit_log     │    │              │    │purchase_orders│                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Migration Files

| File | Description |
|------|-------------|
| `001_profiles_schema.sql` | Core tables: profiles, materials, colors, orders |
| `002_inventory_system.sql` | Inventory, suppliers, stock, purchase orders |
| `003_faq_system.sql` | FAQ and documentation system |
| `004_add_metadata_to_fields.sql` | Metadata column additions |
| `005_profile_templates_extended.sql` | Extended profile template fields |
| `006_inventory_items.sql` | Inventory item extensions |
| `007_users_auth_system.sql` | Users, sessions, preferences, audit |
| `008_calendar_system.sql` | Calendar events, loading days, capacity |
| `009_chat_notifications_system.sql` | Chat, messages, notifications |
| `010_pdf_annotations.sql` | PDF annotations and highlights |

---

## Users & Authentication

### users

Primary user account table.

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  email VARCHAR(200),
  password_hash VARCHAR(255) NOT NULL,
  primary_section VARCHAR(50) DEFAULT 'Production',
  sections TEXT[] DEFAULT ARRAY['Production'],
  roles JSONB DEFAULT '{"Admin": "Viewer", "Production": "Operator", "Logistics": "Viewer"}',
  stations TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `username` | VARCHAR(50) | Unique login identifier |
| `display_name` | VARCHAR(200) | Full name for display |
| `password_hash` | VARCHAR(255) | Bcrypt/SHA-256 hash |
| `primary_section` | VARCHAR(50) | Default section: Admin, Production, Logistics |
| `sections` | TEXT[] | Accessible sections array |
| `roles` | JSONB | Role per section: `{section: role}` |
| `stations` | TEXT[] | Assigned stations: CNC, SANDING, etc. |
| `is_active` | BOOLEAN | Account active status |

### user_sessions

Active authentication sessions.

```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_activity_at TIMESTAMP DEFAULT NOW()
);
```

### user_preferences

User UI and application preferences.

```sql
CREATE TABLE user_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  theme VARCHAR(50) DEFAULT 'DarkVim',
  locale VARCHAR(10) DEFAULT 'en',
  scale VARCHAR(10) DEFAULT 'normal',
  density VARCHAR(20) DEFAULT 'cozy',
  pdf_zoom DECIMAL(3,2) DEFAULT 1.00,
  sidebar_collapsed BOOLEAN DEFAULT false,
  notifications_enabled BOOLEAN DEFAULT true,
  custom_settings JSONB DEFAULT '{}'
);
```

### audit_log

System-wide audit trail.

```sql
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(50),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(100),
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  session_id UUID REFERENCES user_sessions(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Orders & Profiles

### draft_orders

Manufacturing orders.

```sql
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
```

**Status Values**: `draft`, `pending`, `approved`, `in_production`, `completed`

### order_profiles

Profile instances within orders.

```sql
CREATE TABLE order_profiles (
  id SERIAL PRIMARY KEY,
  draft_order_id INTEGER REFERENCES draft_orders(id) ON DELETE CASCADE,
  profile_template_id INTEGER REFERENCES profile_templates(id),
  quantity INTEGER CHECK (quantity BETWEEN 1 AND 4),
  configuration JSONB DEFAULT '{}',
  notes TEXT,
  order_index INTEGER DEFAULT 0
);
```

### profile_templates

Manufacturing profile definitions.

```sql
CREATE TABLE profile_templates (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);
```

---

## Inventory System

### materials

Material library.

```sql
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
```

### inventory_stock

Current stock levels.

```sql
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
```

### stock_movements

Inventory transaction log.

```sql
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
```

**Movement Types**: `PURCHASE`, `SALE`, `PRODUCTION_USE`, `WASTE`, `ADJUSTMENT`, `TRANSFER`, `RETURN`, `DAMAGE`, `STOCKTAKE`

### suppliers

Supplier/vendor information.

```sql
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
```

---

## Calendar & Scheduling

### calendar_events

Base calendar event table.

```sql
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind VARCHAR(20) NOT NULL,  -- 'loading', 'meeting', 'note'
  date DATE NOT NULL,
  title VARCHAR(200),
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### loading_events

Loading-specific event details.

```sql
CREATE TABLE loading_events (
  id UUID PRIMARY KEY REFERENCES calendar_events(id) ON DELETE CASCADE,
  carrier VARCHAR(100),
  window_start TIME,
  window_end TIME
);
```

### loading_event_pos

PO assignments to loading events.

```sql
CREATE TABLE loading_event_pos (
  id SERIAL PRIMARY KEY,
  loading_event_id UUID REFERENCES loading_events(id) ON DELETE CASCADE,
  draft_order_id INTEGER REFERENCES draft_orders(id) ON DELETE CASCADE,
  UNIQUE(loading_event_id, draft_order_id)
);
```

### capacity_config

Capacity settings.

```sql
CREATE TABLE capacity_config (
  id SERIAL PRIMARY KEY,
  config_type VARCHAR(50) NOT NULL DEFAULT 'loading',
  default_capacity INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN DEFAULT true
);
```

---

## Chat & Notifications

### chat_rooms

Chat channels and rooms.

```sql
CREATE TABLE chat_rooms (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  room_type VARCHAR(20) DEFAULT 'channel',  -- 'channel', 'direct', 'group'
  is_private BOOLEAN DEFAULT false,
  created_by INTEGER REFERENCES users(id)
);
```

### chat_messages

Chat message storage.

```sql
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id VARCHAR(100) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id),
  text TEXT NOT NULL,
  variant VARCHAR(20) DEFAULT 'user',  -- 'user', 'system', 'bot'
  mentions INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  is_edited BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### notifications

User notifications.

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT,
  link VARCHAR(500),
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### station_log

Production station activity log.

```sql
CREATE TABLE station_log (
  id SERIAL PRIMARY KEY,
  po_number VARCHAR(50) NOT NULL,
  station VARCHAR(50) NOT NULL,
  notes TEXT,
  redo_reason TEXT,
  logged_by INTEGER REFERENCES users(id),
  logged_at TIMESTAMP DEFAULT NOW()
);
```

---

## Indexes

Key indexes for performance:

```sql
-- Users
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = true;

-- Sessions
CREATE INDEX idx_sessions_token ON user_sessions(token_hash);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);

-- Orders
CREATE INDEX idx_draft_orders_po ON draft_orders(po_number);
CREATE INDEX idx_draft_orders_status ON draft_orders(status);
CREATE INDEX idx_draft_orders_due_date ON draft_orders(due_date);

-- Inventory
CREATE INDEX idx_inventory_stock_material ON inventory_stock(material_id);
CREATE INDEX idx_inventory_stock_low ON inventory_stock(quantity_in_stock)
  WHERE quantity_in_stock <= minimum_stock_level;

-- Calendar
CREATE INDEX idx_cal_events_date ON calendar_events(date);
CREATE INDEX idx_cal_events_kind ON calendar_events(kind);

-- Chat
CREATE INDEX idx_chat_messages_room ON chat_messages(room_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at DESC);

-- Audit
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
```

---

## Triggers

### Auto-update timestamps

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Auto-update inventory on movements

```sql
CREATE OR REPLACE FUNCTION update_inventory_from_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.movement_type IN ('PURCHASE', 'RETURN', 'ADJUSTMENT') THEN
    UPDATE inventory_stock
    SET quantity_in_stock = quantity_in_stock + NEW.quantity
    WHERE id = NEW.inventory_stock_id;
  ELSIF NEW.movement_type IN ('SALE', 'PRODUCTION_USE', 'WASTE', 'DAMAGE') THEN
    UPDATE inventory_stock
    SET quantity_in_stock = quantity_in_stock - NEW.quantity
    WHERE id = NEW.inventory_stock_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```
