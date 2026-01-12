
-- src/lib/server/db/migrations/001_profiles_schema.sql

-- Enable UUID extension 
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================ 
-- PROFILE SYSTEM TABLES 
-- ============================================================

-- Profile Templates (versioned) 
CREATE TABLE profile_templates (   id SERIAL PRIMARY KEY,   code VARCHAR(10) UNIQUE NOT NULL,   name VARCHAR(100) NOT NULL,   version INTEGER DEFAULT 1,   is_active BOOLEAN DEFAULT true,   created_at TIMESTAMP DEFAULT NOW(),   created_by VARCHAR(100),   updated_at TIMESTAMP DEFAULT NOW(),   metadata JSONB DEFAULT '{}'::jsonb,   CONSTRAINT check_version CHECK (version > 0) );

COMMENT ON TABLE profile_templates IS 'Manufacturing profile templates (P7st, P1, etc.)'; 
CREATE INDEX idx_profile_templates_code ON profile_templates(code); 
CREATE INDEX idx_profile_templates_active ON profile_templates(is_active) WHERE is_active = true;

-- Profile Sections (reusable across profiles) 
CREATE TABLE profile_sections (   id SERIAL PRIMARY KEY,   name VARCHAR(50) NOT NULL UNIQUE,   display_name_en VARCHAR(100),   display_name_ru VARCHAR(100),   display_name_lv VARCHAR(100),   icon_id VARCHAR(50),   order_index INTEGER DEFAULT 0,   is_standard BOOLEAN DEFAULT true,   metadata JSONB DEFAULT '{}'::jsonb );

COMMENT ON TABLE profile_sections IS 'Reusable manufacturing sections (LINE_FREEZER, BENDER, etc.)'; 
CREATE INDEX idx_profile_sections_name ON profile_sections(name);

-- Field Types Registry 
CREATE TABLE field_types (   id SERIAL PRIMARY KEY,   type_code VARCHAR(30) UNIQUE NOT NULL,   component_name VARCHAR(100),   validation_schema JSONB DEFAULT '{}'::jsonb,   default_config JSONB DEFAULT '{}'::jsonb );

COMMENT ON TABLE field_types IS 'Registry of available field types for profile builder';

-- Profile Section Fields (defines structure) 
CREATE TABLE profile_section_fields (   id SERIAL PRIMARY KEY,   profile_template_id INTEGER REFERENCES profile_templates(id) ON DELETE CASCADE,   section_id INTEGER REFERENCES profile_sections(id) ON DELETE CASCADE,   field_type_id INTEGER REFERENCES field_types(id),   field_key VARCHAR(50) NOT NULL,   label_en VARCHAR(100),   label_ru VARCHAR(100),   label_lv VARCHAR(100),   placeholder_en VARCHAR(200),   placeholder_ru VARCHAR(200),   placeholder_lv VARCHAR(200),   help_text_en TEXT,   help_text_ru TEXT,   help_text_lv TEXT,   is_required BOOLEAN DEFAULT false,   default_value TEXT,   options JSONB DEFAULT '[]'::jsonb,   conditional_logic JSONB DEFAULT '[]'::jsonb,   validation_rules JSONB DEFAULT '[]'::jsonb,   order_index INTEGER DEFAULT 0,   config JSONB DEFAULT '{}'::jsonb,   UNIQUE(profile_template_id, section_id, field_key) );

COMMENT ON TABLE profile_section_fields IS 'Field definitions for each profile template section'; 
CREATE INDEX idx_psf_template ON profile_section_fields(profile_template_id); 
CREATE INDEX idx_psf_section ON profile_section_fields(section_id);

-- ============================================================ 
-- MATERIAL AND COLOR LIBRARIES 
-- ============================================================

-- Material Library 
CREATE TABLE materials (   id SERIAL PRIMARY KEY,   category VARCHAR(50) NOT NULL,   code VARCHAR(50) UNIQUE NOT NULL,   name_en VARCHAR(100),   name_ru VARCHAR(100),   name_lv VARCHAR(100),   thickness_options JSONB DEFAULT '[]'::jsonb,   metadata JSONB DEFAULT '{}'::jsonb,   created_at TIMESTAMP DEFAULT NOW() );

COMMENT ON TABLE materials IS 'Manufacturing material library (ALU, OPAL, PVC, etc.)'; 
CREATE INDEX idx_materials_category ON materials(category); 
CREATE INDEX idx_materials_code ON materials(code);

-- Color Systems 
CREATE TABLE color_systems (   id SERIAL PRIMARY KEY,   system_type VARCHAR(20) NOT NULL,   code VARCHAR(50) NOT NULL,   name VARCHAR(100),   hex_value VARCHAR(7),   rgb_value JSONB,   cmyk_value JSONB,   finish VARCHAR(20),   metadata JSONB DEFAULT '{}'::jsonb,   UNIQUE(system_type, code) );

COMMENT ON TABLE color_systems IS 'Color system database (RAL, PANTONE, ORACAL, HEX)'; 
CREATE INDEX idx_color_systems_type ON color_systems(system_type); 
CREATE INDEX idx_color_systems_code ON color_systems(system_type, code);

-- ============================================================ 
-- FILES STORAGE 
-- ============================================================  
CREATE TABLE files (   id SERIAL PRIMARY KEY,   filename VARCHAR(255) NOT NULL,   original_name VARCHAR(255) NOT NULL,   mime_type VARCHAR(100),   size_bytes BIGINT,   storage_path TEXT NOT NULL,   uploaded_by VARCHAR(100),   uploaded_at TIMESTAMP DEFAULT NOW(),   metadata JSONB DEFAULT '{}'::jsonb );

COMMENT ON TABLE files IS 'File storage metadata (CDR, PDF, images)'; 
CREATE INDEX idx_files_uploaded_by ON files(uploaded_by); 
CREATE INDEX idx_files_mime_type ON files(mime_type);

-- ============================================================ 
-- DRAFT ORDERS AND PROFILES 
-- ============================================================

-- Draft Orders 
CREATE TABLE draft_orders (   id SERIAL PRIMARY KEY,   po_number VARCHAR(50) UNIQUE NOT NULL,   client VARCHAR(200),   title VARCHAR(200),   due_date DATE,   loading_date DATE,   cdr_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,   pdf_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,   status VARCHAR(20) DEFAULT 'draft',   notes TEXT,   created_by VARCHAR(100),   created_at TIMESTAMP DEFAULT NOW(),   updated_at TIMESTAMP DEFAULT NOW(),   metadata JSONB DEFAULT '{}'::jsonb,   CONSTRAINT check_status CHECK (status IN ('draft', 'pending', 'approved', 'in_production', 'completed')) );

COMMENT ON TABLE draft_orders IS 'Draft manufacturing orders'; 
CREATE INDEX idx_draft_orders_po ON draft_orders(po_number); 
CREATE INDEX idx_draft_orders_status ON draft_orders(status); 
CREATE INDEX idx_draft_orders_due_date ON draft_orders(due_date);

-- Order Profile Instances 
CREATE TABLE order_profiles (   id SERIAL PRIMARY KEY,   draft_order_id INTEGER REFERENCES draft_orders(id) ON DELETE CASCADE,   profile_template_id INTEGER REFERENCES profile_templates(id),   quantity INTEGER CHECK (quantity BETWEEN 1 AND 4),   configuration JSONB DEFAULT '{}'::jsonb,   notes TEXT,   order_index INTEGER DEFAULT 0,   created_at TIMESTAMP DEFAULT NOW() );

COMMENT ON TABLE order_profiles IS 'Profile instances within draft orders'; 
CREATE INDEX idx_order_profiles_order ON order_profiles(draft_order_id); 
CREATE INDEX idx_order_profiles_template ON order_profiles(profile_template_id);

-- ============================================================ 
-- FAQ DOCUMENTATION 
-- ============================================================  
CREATE TABLE faq_documents (   id SERIAL PRIMARY KEY,   profile_template_id INTEGER REFERENCES profile_templates(id) ON DELETE SET NULL,   title_en TEXT,   title_ru TEXT,   title_lv TEXT,   content_en TEXT,   content_ru TEXT,   content_lv TEXT,   category VARCHAR(50),   tags TEXT[],   attachments JSONB DEFAULT '[]'::jsonb,   order_index INTEGER DEFAULT 0,   is_published BOOLEAN DEFAULT true,   created_at TIMESTAMP DEFAULT NOW(),   updated_at TIMESTAMP DEFAULT NOW() );

COMMENT ON TABLE faq_documents IS 'Manufacturing documentation and FAQ entries'; 
CREATE INDEX idx_faq_profile ON faq_documents(profile_template_id); 
CREATE INDEX idx_faq_category ON faq_documents(category); 
CREATE INDEX idx_faq_tags ON faq_documents USING GIN(tags); 
CREATE INDEX idx_faq_published ON faq_documents(is_published) WHERE is_published = true;

-- ============================================================ 
-- VERSION HISTORY 
-- ============================================================  
CREATE TABLE profile_version_history (   id SERIAL PRIMARY KEY,   profile_template_id INTEGER REFERENCES profile_templates(id) ON DELETE CASCADE,   version INTEGER NOT NULL,   changes JSONB DEFAULT '{}'::jsonb,   changed_by VARCHAR(100),   changed_at TIMESTAMP DEFAULT NOW(),   change_description TEXT );

COMMENT ON TABLE profile_version_history IS 'Audit trail for profile template changes'; 
CREATE INDEX idx_pvh_template ON profile_version_history(profile_template_id, version DESC);

-- ============================================================ 
-- TRIGGERS FOR UPDATED_AT 
-- ============================================================  
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN     NEW.updated_at = NOW();
   RETURN NEW; END; $$ language 'plpgsql';

CREATE TRIGGER update_profile_templates_updated_at BEFORE UPDATE ON profile_templates     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_draft_orders_updated_at BEFORE UPDATE ON draft_orders     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_faq_documents_updated_at BEFORE UPDATE ON faq_documents     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
