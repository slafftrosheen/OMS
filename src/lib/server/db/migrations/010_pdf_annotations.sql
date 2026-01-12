-- src/lib/server/db/migrations/010_pdf_annotations.sql
-- PDF annotations and document notes

-- ==========================================
-- PDF ANNOTATIONS (sticky notes)
-- ==========================================

CREATE TABLE pdf_annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  x_position DECIMAL(10,4) NOT NULL,
  y_position DECIMAL(10,4) NOT NULL,
  content TEXT,
  color VARCHAR(20) DEFAULT 'yellow',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE pdf_annotations IS 'PDF sticky note annotations';
CREATE INDEX idx_pdf_annotations_file ON pdf_annotations(file_id);
CREATE INDEX idx_pdf_annotations_page ON pdf_annotations(file_id, page_number);

-- ==========================================
-- PDF HIGHLIGHT RECTS
-- ==========================================

CREATE TABLE pdf_highlight_rects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  x DECIMAL(10,4) NOT NULL,
  y DECIMAL(10,4) NOT NULL,
  width DECIMAL(10,4) NOT NULL,
  height DECIMAL(10,4) NOT NULL,
  color VARCHAR(20) DEFAULT 'yellow',
  opacity DECIMAL(3,2) DEFAULT 0.30,
  label VARCHAR(200),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE pdf_highlight_rects IS 'PDF highlight rectangles';
CREATE INDEX idx_pdf_rects_file ON pdf_highlight_rects(file_id);
CREATE INDEX idx_pdf_rects_page ON pdf_highlight_rects(file_id, page_number);

-- ==========================================
-- TRIGGERS
-- ==========================================

CREATE TRIGGER update_pdf_annotations_updated_at BEFORE UPDATE ON pdf_annotations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
