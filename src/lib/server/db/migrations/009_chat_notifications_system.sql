-- src/lib/server/db/migrations/009_chat_notifications_system.sql
-- Chat rooms, messages, and notifications

-- ==========================================
-- CHAT ROOMS
-- ==========================================

CREATE TABLE chat_rooms (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  room_type VARCHAR(20) DEFAULT 'channel',
  is_private BOOLEAN DEFAULT false,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT check_room_type CHECK (room_type IN ('channel', 'direct', 'group'))
);

COMMENT ON TABLE chat_rooms IS 'Chat rooms and channels';
CREATE INDEX idx_chat_rooms_type ON chat_rooms(room_type);

-- Seed default rooms
INSERT INTO chat_rooms (id, name, room_type) VALUES
  ('general', 'General', 'channel'),
  ('workstations', 'Workstations', 'channel'),
  ('logistics', 'Logistics', 'channel');

-- ==========================================
-- CHAT ROOM MEMBERS
-- ==========================================

CREATE TABLE chat_room_members (
  id SERIAL PRIMARY KEY,
  room_id VARCHAR(100) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT NOW(),
  last_read_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(room_id, user_id),
  CONSTRAINT check_member_role CHECK (role IN ('owner', 'admin', 'member'))
);

COMMENT ON TABLE chat_room_members IS 'Chat room membership';
CREATE INDEX idx_room_members_room ON chat_room_members(room_id);
CREATE INDEX idx_room_members_user ON chat_room_members(user_id);

-- ==========================================
-- CHAT MESSAGES
-- ==========================================

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id VARCHAR(100) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  variant VARCHAR(20) DEFAULT 'user',
  mentions INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  event_type VARCHAR(50),
  event_data JSONB,
  is_edited BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  reply_to_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_message_variant CHECK (variant IN ('user', 'system', 'bot'))
);

COMMENT ON TABLE chat_messages IS 'Chat messages';
CREATE INDEX idx_chat_messages_room ON chat_messages(room_id);
CREATE INDEX idx_chat_messages_author ON chat_messages(author_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at DESC);
CREATE INDEX idx_chat_messages_mentions ON chat_messages USING GIN(mentions);

-- ==========================================
-- NOTIFICATIONS
-- ==========================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT,
  link VARCHAR(500),
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  source_type VARCHAR(50),
  source_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  read_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE notifications IS 'User notifications';
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- ==========================================
-- STATION LOG (Production logging)
-- ==========================================

CREATE TABLE station_log (
  id SERIAL PRIMARY KEY,
  po_number VARCHAR(50) NOT NULL,
  station VARCHAR(50) NOT NULL,
  notes TEXT,
  redo_reason TEXT,
  logged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  logged_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE station_log IS 'Production station activity log';
CREATE INDEX idx_station_log_po ON station_log(po_number);
CREATE INDEX idx_station_log_station ON station_log(station);
CREATE INDEX idx_station_log_logged ON station_log(logged_at DESC);

-- ==========================================
-- TRIGGERS
-- ==========================================

CREATE TRIGGER update_chat_rooms_updated_at BEFORE UPDATE ON chat_rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_messages_updated_at BEFORE UPDATE ON chat_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
