-- src/lib/server/db/migrations/004_add_metadata_to_fields.sql
-- Add metadata column to profile_section_fields for visual styling and conditional logic

ALTER TABLE profile_section_fields 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN profile_section_fields.metadata IS 'Visual styling and layout metadata (column, visualBox, fullWidth, etc.)';

-- Create index for faster metadata queries
CREATE INDEX IF NOT EXISTS idx_psf_metadata ON profile_section_fields USING GIN(metadata);

-- Add metadata columns to field_types for better type definition
ALTER TABLE field_types 
ADD COLUMN IF NOT EXISTS display_name_en VARCHAR(100),
ADD COLUMN IF NOT EXISTS display_name_ru VARCHAR(100),
ADD COLUMN IF NOT EXISTS display_name_lv VARCHAR(100),
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN field_types.display_name_en IS 'English display name for field type';
COMMENT ON COLUMN field_types.display_name_ru IS 'Russian display name for field type';
COMMENT ON COLUMN field_types.display_name_lv IS 'Latvian display name for field type';
COMMENT ON COLUMN field_types.metadata IS 'Additional field type metadata';
