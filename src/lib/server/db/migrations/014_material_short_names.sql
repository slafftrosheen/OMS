-- src/lib/server/db/migrations/014_material_short_names.sql
-- Add short display names to materials metadata for compact badge display
-- Short names: ACRYLIC=colorCode, ALU=thickness, ORACAL=series_code, RAL=4digits, LED=brand+temp, PSU=brand+watts

-- For ACRYLIC - use colorCode from metadata (e.g., 3N570, WN071)
UPDATE materials SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{short_name}', 
  COALESCE(metadata->'colorCode', to_jsonb(REGEXP_REPLACE(code, '^PLEXIGLAS_(XT|GS|LED)_', '', 'i')))
)
WHERE category LIKE 'ACRYLIC%' AND metadata->>'short_name' IS NULL;

-- For ALU SHEET - show ALU + first thickness (e.g., ALU 1.5)
UPDATE materials SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{short_name}', 
  to_jsonb('ALU ' || COALESCE(thickness_options->>0, REGEXP_REPLACE(code, '^ALU_SHEET_?', '')))
)
WHERE category = 'ALU_SHEET' AND metadata->>'short_name' IS NULL;

-- For ALU PROFILE - show profile dimensions (e.g., ALU 40x40)
UPDATE materials SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{short_name}', 
  to_jsonb('ALU ' || COALESCE(metadata->>'dimensions', REGEXP_REPLACE(code, '^ALU_PROFILE_?', '')))
)
WHERE category = 'ALU_PROFILE' AND metadata->>'short_name' IS NULL;

-- For ALU COMPOSITE - ACP
UPDATE materials SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{short_name}', '"ACP"') 
WHERE category = 'ALU_COMPOSITE' AND metadata->>'short_name' IS NULL;

-- For PVC - PVC + thickness
UPDATE materials SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{short_name}', '"PVC"') 
WHERE category LIKE 'PVC%' AND metadata->>'short_name' IS NULL;

-- For VINYL/ORACAL - full code like 8500_064 (series + color)
UPDATE materials SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{short_name}', 
  to_jsonb(REPLACE(REGEXP_REPLACE(code, '^ORACAL_', ''), '-', '_'))
)
WHERE category LIKE 'VINYL%' AND metadata->>'short_name' IS NULL;

-- For PAINT RAL - just the 4-digit code (e.g., 9005)
UPDATE materials SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{short_name}', to_jsonb(
  REGEXP_REPLACE(code, '^RAL_', '')
)) 
WHERE category = 'PAINT_RAL' AND metadata->>'short_name' IS NULL;

-- For PAINT PANTONE - code without prefix
UPDATE materials SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{short_name}', to_jsonb(
  REGEXP_REPLACE(code, '^PANTONE_', '')
)) 
WHERE category = 'PAINT_PANTONE' AND metadata->>'short_name' IS NULL;

-- For LED modules - Brand + Color Temp from metadata
UPDATE materials SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{short_name}', 
  to_jsonb(COALESCE(metadata->>'brand', 'LED') || ' ' || COALESCE(metadata->>'colorTemp', ''))
)
WHERE category LIKE 'LED%' AND metadata->>'short_name' IS NULL;

-- For PSU - Brand + Watts
UPDATE materials SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{short_name}', 
  to_jsonb(COALESCE(metadata->>'brand', 'PSU') || ' ' || COALESCE(metadata->>'watts', '') || 'W')
)
WHERE category LIKE 'PSU%' AND metadata->>'short_name' IS NULL;

-- For WIRE - dimensions + color
UPDATE materials SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{short_name}', 
  to_jsonb(COALESCE(metadata->>'dimensions', '2x0.75') || ' ' || UPPER(COALESCE(metadata->>'color', '')))
)
WHERE category = 'WIRE' AND metadata->>'short_name' IS NULL;

COMMENT ON COLUMN materials.metadata IS 'JSON metadata including: hex (color), short_name (display), colorCode, brand, type, colorTemp, watts, dimensions, etc.';
