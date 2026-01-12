-- PDF annotations and highlights

CREATE TABLE pdf_annotations (
  id SERIAL PRIMARY KEY,
  file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  page_number INTEGER NOT NULL,
  annotation_type VARCHAR(50) NOT NULL,
  annotation_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
