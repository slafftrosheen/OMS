-- Calendar events, loading days, capacity

-- Calendar events
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(20) NOT NULL,  -- 'loading', 'meeting', 'note'
  date DATE NOT NULL,
  title VARCHAR(200),
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Loading events
CREATE TABLE loading_events (
  id UUID PRIMARY KEY REFERENCES calendar_events(id) ON DELETE CASCADE,
  carrier VARCHAR(100),
  window_start TIME,
  window_end TIME
);

-- Loading event POs
CREATE TABLE loading_event_pos (
  id SERIAL PRIMARY KEY,
  loading_event_id UUID REFERENCES loading_events(id) ON DELETE CASCADE,
  draft_order_id INTEGER REFERENCES draft_orders(id) ON DELETE CASCADE,
  UNIQUE(loading_event_id, draft_order_id)
);

-- Capacity config
CREATE TABLE capacity_config (
  id SERIAL PRIMARY KEY,
  config_type VARCHAR(50) NOT NULL DEFAULT 'loading',
  default_capacity INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN DEFAULT true
);
