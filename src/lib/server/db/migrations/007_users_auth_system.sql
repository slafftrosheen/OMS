-- src/lib/server/db/migrations/007_users_auth_system.sql
-- Users, Authentication, Sessions, and Audit Logging

-- ==========================================
-- USERS TABLE
-- ==========================================

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  email VARCHAR(200),
  password_hash VARCHAR(255) NOT NULL,
  primary_section VARCHAR(50) DEFAULT 'Production',
  sections TEXT[] DEFAULT ARRAY['Production'],
  roles JSONB DEFAULT '{"Admin": "Viewer", "Production": "Operator", "Logistics": "Viewer"}'::jsonb,
  stations TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT check_primary_section CHECK (primary_section IN ('Admin', 'Production', 'Logistics'))
);

COMMENT ON TABLE users IS 'System users with role-based access control';
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = true;
CREATE INDEX idx_users_sections ON users USING GIN(sections);

-- Seed default users
INSERT INTO users (username, display_name, password_hash, primary_section, sections, roles, stations) VALUES
  ('boss', 'Boss Director', '$2b$10$placeholder_boss_hash', 'Admin', 
   ARRAY['Admin', 'Production', 'Logistics'], 
   '{"Admin": "SuperAdmin", "Production": "SuperAdmin", "Logistics": "SuperAdmin"}'::jsonb, 
   ARRAY[]::TEXT[]),
  ('admin', 'Lina Ops', '$2b$10$placeholder_admin_hash', 'Admin', 
   ARRAY['Admin', 'Production', 'Logistics'], 
   '{"Admin": "SuperAdmin", "Production": "StationLead", "Logistics": "StationLead"}'::jsonb, 
   ARRAY[]::TEXT[]),
  ('cnc', 'Marta Jansone', '$2b$10$placeholder_cnc_hash', 'Production', 
   ARRAY['Production'], 
   '{"Admin": "Viewer", "Production": "Operator", "Logistics": "Viewer"}'::jsonb, 
   ARRAY['CNC']),
  ('sanding', 'Igor Petrovs', '$2b$10$placeholder_sanding_hash', 'Production', 
   ARRAY['Production'], 
   '{"Admin": "Viewer", "Production": "Operator", "Logistics": "Viewer"}'::jsonb, 
   ARRAY['SANDING']),
  ('logistics', 'Ravi Nair', '$2b$10$placeholder_logistics_hash', 'Logistics', 
   ARRAY['Logistics', 'Production'], 
   '{"Admin": "Viewer", "Production": "Viewer", "Logistics": "StationLead"}'::jsonb, 
   ARRAY['LOGISTICS']);

-- ==========================================
-- USER SESSIONS
-- ==========================================

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

COMMENT ON TABLE user_sessions IS 'Active user sessions for authentication';
CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_token ON user_sessions(token_hash);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);

-- ==========================================
-- USER PREFERENCES (theme, locale, scale)
-- ==========================================

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
  custom_settings JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE user_preferences IS 'User UI preferences and settings';
CREATE INDEX idx_user_prefs_user ON user_preferences(user_id);

-- Insert default preferences for seeded users
INSERT INTO user_preferences (user_id, theme, locale, scale)
SELECT id, 'DarkVim', 'en', 'normal' FROM users;

-- ==========================================
-- AUDIT LOG
-- ==========================================

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
  user_agent TEXT,
  session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE audit_log IS 'System-wide audit trail for all user actions';
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- ==========================================
-- TRIGGERS
-- ==========================================

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-update last_activity on session access
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
