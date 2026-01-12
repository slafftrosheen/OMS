-- src/lib/server/db/migrations/011_files_storage.sql
-- File storage system for CDR, PDF, and other uploads

-- ==========================================
-- FILES TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS files (
  id VARCHAR(50) PRIMARY KEY,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
  size BIGINT NOT NULL,
  path VARCHAR(500) NOT NULL,
  category VARCHAR(20),
  order_id VARCHAR(50),
  uploaded_by VARCHAR(50),
  uploaded_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT check_file_category CHECK (category IN ('cdr', 'pdf', 'image', 'other'))
);

COMMENT ON TABLE files IS 'Uploaded files storage (CDR, PDF, images)';

CREATE INDEX idx_files_order ON files(order_id);
CREATE INDEX idx_files_category ON files(category);
CREATE INDEX idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX idx_files_uploaded_at ON files(uploaded_at DESC);

-- ==========================================
-- ORDER FILES (Many-to-Many relationship)
-- ==========================================

CREATE TABLE IF NOT EXISTS order_files (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(50) NOT NULL,
  file_id VARCHAR(50) REFERENCES files(id) ON DELETE CASCADE,
  file_type VARCHAR(50) DEFAULT 'attachment',
  display_order INTEGER DEFAULT 0,
  added_at TIMESTAMP DEFAULT NOW(),
  added_by VARCHAR(50),
  notes TEXT,
  UNIQUE(order_id, file_id)
);

COMMENT ON TABLE order_files IS 'Links files to orders with additional metadata';

CREATE INDEX idx_order_files_order ON order_files(order_id);
CREATE INDEX idx_order_files_file ON order_files(file_id);

-- ==========================================
-- FILE VERSIONS (for tracking revisions)
-- ==========================================

CREATE TABLE IF NOT EXISTS file_versions (
  id SERIAL PRIMARY KEY,
  file_id VARCHAR(50) REFERENCES files(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  parent_file_id VARCHAR(50) REFERENCES files(id) ON DELETE SET NULL,
  change_note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(50),
  UNIQUE(file_id, version_number)
);

COMMENT ON TABLE file_versions IS 'Track file version history';

CREATE INDEX idx_file_versions_file ON file_versions(file_id);
