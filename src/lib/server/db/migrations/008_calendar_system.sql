-- src/lib/server/db/migrations/008_calendar_system.sql
-- Calendar Events, Loading Days, and Capacity Configuration

-- ==========================================
-- CALENDAR EVENTS
-- ==========================================

CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind VARCHAR(20) NOT NULL,
  date DATE NOT NULL,
  title VARCHAR(200),
  note TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT check_event_kind CHECK (kind IN ('loading', 'meeting', 'note'))
);

COMMENT ON TABLE calendar_events IS 'Calendar events (loading days, meetings, notes)';
CREATE INDEX idx_cal_events_date ON calendar_events(date);
CREATE INDEX idx_cal_events_kind ON calendar_events(kind);
CREATE INDEX idx_cal_events_created_by ON calendar_events(created_by);

-- ==========================================
-- LOADING EVENTS (extends calendar_events)
-- ==========================================

CREATE TABLE loading_events (
  id UUID PRIMARY KEY REFERENCES calendar_events(id) ON DELETE CASCADE,
  carrier VARCHAR(100),
  window_start TIME,
  window_end TIME
);

COMMENT ON TABLE loading_events IS 'Loading-specific event details';

-- ==========================================
-- LOADING EVENT POs (Many-to-Many)
-- ==========================================

CREATE TABLE loading_event_pos (
  id SERIAL PRIMARY KEY,
  loading_event_id UUID REFERENCES loading_events(id) ON DELETE CASCADE,
  draft_order_id INTEGER REFERENCES draft_orders(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(loading_event_id, draft_order_id)
);

COMMENT ON TABLE loading_event_pos IS 'PO assignments to loading events';
CREATE INDEX idx_loading_pos_event ON loading_event_pos(loading_event_id);
CREATE INDEX idx_loading_pos_order ON loading_event_pos(draft_order_id);

-- ==========================================
-- MEETING EVENTS (extends calendar_events)
-- ==========================================

CREATE TABLE meeting_events (
  id UUID PRIMARY KEY REFERENCES calendar_events(id) ON DELETE CASCADE,
  start_time TIME,
  end_time TIME,
  location VARCHAR(200),
  attendees INTEGER[] DEFAULT ARRAY[]::INTEGER[]
);

COMMENT ON TABLE meeting_events IS 'Meeting-specific event details';

-- ==========================================
-- LOADING DAYS (simplified toggle system)
-- ==========================================

CREATE TABLE IF NOT EXISTS loading_days (
  id VARCHAR(20) PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  carrier VARCHAR(100),
  note TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE loading_days IS 'Loading day toggles for calendar';
CREATE INDEX idx_loading_days_date ON loading_days(date);
CREATE INDEX idx_loading_days_active ON loading_days(is_active) WHERE is_active = true;

-- ==========================================
-- CAPACITY CONFIGURATION
-- ==========================================

CREATE TABLE capacity_config (
  id SERIAL PRIMARY KEY,
  config_type VARCHAR(50) NOT NULL DEFAULT 'loading',
  default_capacity INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(config_type)
);

COMMENT ON TABLE capacity_config IS 'Default capacity settings per config type';

-- Insert default config
INSERT INTO capacity_config (config_type, default_capacity) VALUES ('loading', 10);

-- ==========================================
-- CUSTOM DAY CAPACITIES
-- ==========================================

CREATE TABLE day_capacities (
  id SERIAL PRIMARY KEY,
  config_id INTEGER REFERENCES capacity_config(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  capacity INTEGER NOT NULL,
  note TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(config_id, date)
);

COMMENT ON TABLE day_capacities IS 'Custom capacity overrides per day';
CREATE INDEX idx_day_capacities_date ON day_capacities(date);

-- ==========================================
-- TRIGGERS
-- ==========================================

CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON calendar_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_loading_days_updated_at BEFORE UPDATE ON loading_days
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_capacity_config_updated_at BEFORE UPDATE ON capacity_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
