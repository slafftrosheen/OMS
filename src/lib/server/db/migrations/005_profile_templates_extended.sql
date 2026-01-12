-- src/lib/server/db/migrations/005_profile_templates_extended.sql

-- ============================================================================
-- Profile Templates System Extensions - Phase 3
-- Adds version control, audit logging, and enhanced template management
-- ============================================================================

-- ============================================================================
-- 1. Extend profile_templates table
-- ============================================================================

-- Add description column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='profile_templates' AND column_name='description') THEN
        ALTER TABLE profile_templates ADD COLUMN description TEXT;
    END IF;
END $$;

-- Alter code column to support longer codes
ALTER TABLE profile_templates ALTER COLUMN code TYPE VARCHAR(20);

-- Change version to VARCHAR for semantic versioning
ALTER TABLE profile_templates ALTER COLUMN version TYPE VARCHAR(20) USING version::VARCHAR;
ALTER TABLE profile_templates ALTER COLUMN version SET DEFAULT '1.0';

-- Add updated_by column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='profile_templates' AND column_name='updated_by') THEN
        ALTER TABLE profile_templates ADD COLUMN updated_by VARCHAR(100);
    END IF;
END $$;

-- Update check constraint for version format
ALTER TABLE profile_templates DROP CONSTRAINT IF EXISTS check_version;
ALTER TABLE profile_templates ADD CONSTRAINT version_format CHECK (version ~ '^\d+\.\d+$');

-- Add check constraint for code format
ALTER TABLE profile_templates DROP CONSTRAINT IF EXISTS code_format;
ALTER TABLE profile_templates ADD CONSTRAINT code_format CHECK (code ~ '^P[0-9A-Za-z\-_]+$');


-- ============================================================================
-- 2. Create new profile_sections table (template-specific)
-- This replaces the old standalone profile_sections approach
-- ============================================================================

-- Rename old table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_name='profile_sections' AND table_schema='public') THEN
        -- Drop old profile_sections if it has no data or rename it
        ALTER TABLE IF EXISTS profile_sections RENAME TO profile_sections_old;
    END IF;
END $$;

-- Create new profile_sections table linked to templates
CREATE TABLE IF NOT EXISTS profile_sections (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES profile_templates(id) ON DELETE CASCADE,
    
    name VARCHAR(100) NOT NULL,
    display_name_en VARCHAR(255) NOT NULL,
    display_name_ru VARCHAR(255),
    display_name_lv VARCHAR(255),
    
    order_index INTEGER NOT NULL DEFAULT 0,
    is_required BOOLEAN DEFAULT false,
    
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_section_name_per_template UNIQUE(template_id, name),
    CONSTRAINT section_name_uppercase CHECK (name = UPPER(name))
);

-- Indexes
CREATE INDEX idx_sections_template ON profile_sections(template_id);
CREATE INDEX idx_sections_order ON profile_sections(template_id, order_index);

-- Metadata structure comment
COMMENT ON COLUMN profile_sections.metadata IS 'JSON structure: {
    "color": "#1a1a1a",
    "icon": "square|circle|star",
    "collapsible": true,
    "description": "Section description"
}';


-- ============================================================================
-- 3. Create profile_fields table (replaces profile_section_fields)
-- ============================================================================

-- Rename old table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_name='profile_section_fields' AND table_schema='public') THEN
        ALTER TABLE IF EXISTS profile_section_fields RENAME TO profile_section_fields_old;
    END IF;
END $$;

-- Create new profile_fields table
CREATE TABLE IF NOT EXISTS profile_fields (
    id SERIAL PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES profile_sections(id) ON DELETE CASCADE,
    
    field_key VARCHAR(100) NOT NULL,
    field_type VARCHAR(50) NOT NULL,
    
    label_en VARCHAR(255) NOT NULL,
    label_ru VARCHAR(255),
    label_lv VARCHAR(255),
    
    order_index INTEGER NOT NULL DEFAULT 0,
    is_required BOOLEAN DEFAULT false,
    
    options JSONB DEFAULT '[]',
    config JSONB DEFAULT '{}',
    validation_rules JSONB DEFAULT '[]',
    conditional_logic JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_field_key_per_section UNIQUE(section_id, field_key),
    CONSTRAINT field_key_lowercase CHECK (field_key = LOWER(field_key)),
    CONSTRAINT valid_field_type CHECK (field_type IN (
        'material_field',
        'color_ral',
        'color_pantone',
        'oracal_selector',
        'signtrim_selector',
        'dropdown',
        'button_group',
        'toggle',
        'number',
        'text',
        'textarea',
        'date',
        'multi_select_chips',
        'info_box',
        'computed_field'
    ))
);

-- Indexes
CREATE INDEX idx_fields_section ON profile_fields(section_id);
CREATE INDEX idx_fields_order ON profile_fields(section_id, order_index);
CREATE INDEX idx_fields_type ON profile_fields(field_type);

-- Column comments
COMMENT ON COLUMN profile_fields.config IS 'Field-specific configuration (JSON)';
COMMENT ON COLUMN profile_fields.validation_rules IS 'Validation rules array (JSON)';
COMMENT ON COLUMN profile_fields.conditional_logic IS 'Show/hide conditions (JSON)';
COMMENT ON COLUMN profile_fields.metadata IS 'JSON structure: {
    "visualBox": true,
    "boxColor": "#F5F5F0",
    "column": 1,
    "fullWidth": false,
    "help_text": "Helper text"
}';


-- ============================================================================
-- 4. Template Versions Table (Version Control)
-- ============================================================================

CREATE TABLE IF NOT EXISTS template_versions (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES profile_templates(id) ON DELETE CASCADE,
    
    version VARCHAR(20) NOT NULL,
    template_snapshot JSONB NOT NULL,
    notes TEXT,
    changes_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    
    CONSTRAINT unique_version_per_template UNIQUE(template_id, version),
    CONSTRAINT version_format_check CHECK (version ~ '^\d+\.\d+$')
);

-- Indexes
CREATE INDEX idx_versions_template ON template_versions(template_id, created_at DESC);
CREATE INDEX idx_versions_created ON template_versions(created_at DESC);

COMMENT ON TABLE template_versions IS 'Complete snapshots of templates at each version for rollback capability';
COMMENT ON COLUMN template_versions.template_snapshot IS 'Complete JSON snapshot including all sections and fields';


-- ============================================================================
-- 5. Template Change Log (Audit Trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS template_changes (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES profile_templates(id) ON DELETE CASCADE,
    
    change_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER,
    
    old_value JSONB,
    new_value JSONB,
    description TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    
    CONSTRAINT valid_change_type CHECK (change_type IN (
        'CREATED',
        'UPDATED',
        'DELETED',
        'CLONED',
        'ROLLED_BACK',
        'ACTIVATED',
        'DEACTIVATED'
    )),
    CONSTRAINT valid_entity_type CHECK (entity_type IN (
        'TEMPLATE',
        'SECTION',
        'FIELD'
    ))
);

-- Indexes
CREATE INDEX idx_changes_template ON template_changes(template_id, created_at DESC);
CREATE INDEX idx_changes_user ON template_changes(created_by, created_at DESC);
CREATE INDEX idx_changes_type ON template_changes(change_type);

COMMENT ON TABLE template_changes IS 'Detailed audit log of all template modifications';


-- ============================================================================
-- 6. Update existing triggers
-- ============================================================================

-- Trigger for profile_sections
DROP TRIGGER IF EXISTS update_sections_timestamp ON profile_sections;
CREATE TRIGGER update_sections_timestamp
    BEFORE UPDATE ON profile_sections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for profile_fields
DROP TRIGGER IF EXISTS update_fields_timestamp ON profile_fields;
CREATE TRIGGER update_fields_timestamp
    BEFORE UPDATE ON profile_fields
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 7. Function: Log template changes automatically
-- ============================================================================

CREATE OR REPLACE FUNCTION log_template_change()
RETURNS TRIGGER AS $$
DECLARE
    change_type_val VARCHAR(50);
    template_id_val INTEGER;
BEGIN
    IF TG_OP = 'INSERT' THEN
        change_type_val := 'CREATED';
        template_id_val := NEW.id;
        
        INSERT INTO template_changes (
            template_id, change_type, entity_type, new_value, created_by
        ) VALUES (
            template_id_val, change_type_val, 'TEMPLATE', 
            to_jsonb(NEW), NEW.created_by
        );
        
    ELSIF TG_OP = 'UPDATE' THEN
        change_type_val := 'UPDATED';
        template_id_val := NEW.id;
        
        INSERT INTO template_changes (
            template_id, change_type, entity_type, old_value, new_value, created_by
        ) VALUES (
            template_id_val, change_type_val, 'TEMPLATE',
            to_jsonb(OLD), to_jsonb(NEW), NEW.updated_by
        );
        
    ELSIF TG_OP = 'DELETE' THEN
        change_type_val := 'DELETED';
        template_id_val := OLD.id;
        
        INSERT INTO template_changes (
            template_id, change_type, entity_type, old_value, created_by
        ) VALUES (
            template_id_val, change_type_val, 'TEMPLATE',
            to_jsonb(OLD), NULL
        );
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic change logging
DROP TRIGGER IF EXISTS log_template_changes ON profile_templates;
CREATE TRIGGER log_template_changes
    AFTER INSERT OR UPDATE OR DELETE ON profile_templates
    FOR EACH ROW
    EXECUTE FUNCTION log_template_change();


-- ============================================================================
-- 8. Sample Data Migration (if old tables exist)
-- ============================================================================

-- Migrate data from old profile_section_fields to new structure if needed
-- This is a placeholder - actual migration would depend on existing data

-- Note: In production, you would need to:
-- 1. Migrate existing profile_section_fields data to the new profile_fields structure
-- 2. Create appropriate profile_sections entries
-- 3. Link everything properly
-- 4. Verify data integrity before dropping old tables


-- ============================================================================
-- 9. Cleanup (commented out for safety)
-- ============================================================================

-- After verifying migration:
-- DROP TABLE IF EXISTS profile_sections_old CASCADE;
-- DROP TABLE IF EXISTS profile_section_fields_old CASCADE;
-- DROP TABLE IF EXISTS profile_version_history CASCADE; -- replaced by template_versions


-- ============================================================================
-- 10. Sample Template Data (P7st example)
-- ============================================================================

-- Insert sample template (P7st) if it doesn't exist
INSERT INTO profile_templates (code, name, description, version, is_active, metadata, created_by, updated_by) 
VALUES (
    'P7st',
    'Profile 7st - Super Pro',
    'Complete outdoor/indoor sign with full manufacturing workflow',
    '1.0',
    true,
    '{"icon": "award", "complexity": "complex", "typical_timeline": "8-10 days", "color": "#E91E63"}',
    'system',
    'system'
) ON CONFLICT (code) DO UPDATE SET
    description = EXCLUDED.description,
    metadata = EXCLUDED.metadata;

-- Get the template ID and insert sections/fields
DO $$
DECLARE
    template_id_var INTEGER;
    section_cnc_id INTEGER;
    section_bender_id INTEGER;
    section_painting_id INTEGER;
BEGIN
    SELECT id INTO template_id_var FROM profile_templates WHERE code = 'P7st';
    
    IF template_id_var IS NOT NULL THEN
        -- Insert sections (delete existing first to avoid conflicts)
        DELETE FROM profile_sections WHERE template_id = template_id_var;
        
        INSERT INTO profile_sections (template_id, name, display_name_en, display_name_ru, order_index, is_required, metadata)
        VALUES 
            (template_id_var, 'CNC_FREZER', 'CNC FREZER', 'ЧПУ ФРЕЗЕР', 1, true, '{"color": "#1a1a1a"}'),
            (template_id_var, 'BENDER', 'BENDER', 'ГИБКА', 2, true, '{"color": "#4A5568"}'),
            (template_id_var, 'PAINTING', 'PAINTING', 'ПОКРАСКА', 3, true, '{"color": "#E53E3E"}');
        
        -- Get section IDs
        SELECT id INTO section_cnc_id FROM profile_sections WHERE template_id = template_id_var AND name = 'CNC_FREZER';
        SELECT id INTO section_bender_id FROM profile_sections WHERE template_id = template_id_var AND name = 'BENDER';
        SELECT id INTO section_painting_id FROM profile_sections WHERE template_id = template_id_var AND name = 'PAINTING';
        
        -- Insert fields for CNC section
        IF section_cnc_id IS NOT NULL THEN
            INSERT INTO profile_fields (section_id, field_key, field_type, label_en, order_index, is_required, config, metadata)
            VALUES 
                (section_cnc_id, 'face_material', 'material_field', 'FACE', 1, true, 
                 '{"materialTypes": ["ACRYLIC"], "showThickness": true}', 
                 '{"visualBox": true}'),
                (section_cnc_id, 'back_material', 'material_field', 'BACK', 2, true,
                 '{"materialTypes": ["ALUMINUM", "PVC"]}',
                 '{"visualBox": true}')
            ON CONFLICT (section_id, field_key) DO NOTHING;
        END IF;
        
        -- Insert fields for BENDER section
        IF section_bender_id IS NOT NULL THEN
            INSERT INTO profile_fields (section_id, field_key, field_type, label_en, order_index, is_required, config, metadata)
            VALUES 
                (section_bender_id, 'sides_material', 'material_field', 'SIDES', 1, true,
                 '{"materialTypes": ["ALUMINUM"], "defaultThickness": 1.2}',
                 '{"visualBox": true}'),
                (section_bender_id, 'sides_depth', 'number', 'Depth', 2, true,
                 '{"min": 30, "max": 200, "step": 10, "default": 60, "unit": "mm"}',
                 '{}')
            ON CONFLICT (section_id, field_key) DO NOTHING;
        END IF;
        
        -- Insert fields for PAINTING section
        IF section_painting_id IS NOT NULL THEN
            INSERT INTO profile_fields (section_id, field_key, field_type, label_en, order_index, is_required, config, metadata)
            VALUES 
                (section_painting_id, 'sides_color', 'color_ral', 'SIDES', 1, true,
                 '{"default": "3020", "showPreview": true}',
                 '{"visualBox": true, "boxColor": "ralValue"}'),
                (section_painting_id, 'back_color', 'color_ral', 'BACK', 2, true,
                 '{"default": "3020", "showPreview": true}',
                 '{"visualBox": true, "boxColor": "ralValue"}')
            ON CONFLICT (section_id, field_key) DO NOTHING;
        END IF;
        
        -- Create initial version snapshot
        INSERT INTO template_versions (
            template_id, version, template_snapshot, notes, created_by
        )
        SELECT 
            template_id_var,
            '1.0',
            jsonb_build_object(
                'template', row_to_json(pt.*),
                'sections', (
                    SELECT json_agg(
                        jsonb_build_object(
                            'section', row_to_json(ps.*),
                            'fields', (
                                SELECT json_agg(pf.* ORDER BY pf.order_index)
                                FROM profile_fields pf
                                WHERE pf.section_id = ps.id
                            )
                        ) ORDER BY ps.order_index
                    )
                    FROM profile_sections ps
                    WHERE ps.template_id = template_id_var
                )
            ),
            'Initial version from migration',
            'system'
        FROM profile_templates pt
        WHERE pt.id = template_id_var
        ON CONFLICT (template_id, version) DO NOTHING;
    END IF;
END $$;


-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Verify tables
SELECT 'Migration 005 completed successfully' as status;
SELECT 
    'profile_templates' as table_name, 
    COUNT(*) as row_count 
FROM profile_templates
UNION ALL
SELECT 
    'profile_sections' as table_name, 
    COUNT(*) as row_count 
FROM profile_sections
UNION ALL
SELECT 
    'profile_fields' as table_name, 
    COUNT(*) as row_count 
FROM profile_fields
UNION ALL
SELECT 
    'template_versions' as table_name, 
    COUNT(*) as row_count 
FROM template_versions
UNION ALL
SELECT 
    'template_changes' as table_name, 
    COUNT(*) as row_count 
FROM template_changes;
