-- Extended profile template fields

-- Profile template versions
CREATE TABLE profile_template_versions (
  id SERIAL PRIMARY KEY,
  profile_template_id INTEGER REFERENCES profile_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Profile sections
CREATE TABLE profile_sections (
  id SERIAL PRIMARY KEY,
  profile_template_version_id INTEGER REFERENCES profile_template_versions(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  order_index INTEGER DEFAULT 0
);

-- Profile fields
CREATE TABLE profile_fields (
  id SERIAL PRIMARY KEY,
  profile_section_id INTEGER REFERENCES profile_sections(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  field_type VARCHAR(50) NOT NULL,
  options JSONB DEFAULT '{}',
  order_index INTEGER DEFAULT 0
);
