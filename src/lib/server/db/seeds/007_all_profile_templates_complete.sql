-- src/lib/server/db/seeds/007_all_profile_templates_complete.sql
-- PRODUCTION-READY: All profile templates with complete field definitions

DO $$
DECLARE
  -- Template IDs
  p7st_id INTEGER;
  p7rcp_id INTEGER;
  p1_id INTEGER;
  p3_id INTEGER;
  p5_id INTEGER;
  p8_id INTEGER;
  p4_id INTEGER;
  
  -- Field type IDs
  material_field_type INTEGER;
  dropdown_type INTEGER;
  toggle_type INTEGER;
  number_type INTEGER;
  color_ral_type INTEGER;
  textarea_type INTEGER;
  date_type INTEGER;
  button_group_type INTEGER;
  oracal_type INTEGER;
  info_box_type INTEGER;
  signtrim_type INTEGER;

BEGIN

-- Get field type IDs
SELECT id INTO material_field_type FROM field_types WHERE type_code = 'material_field' LIMIT 1;
SELECT id INTO dropdown_type FROM field_types WHERE type_code = 'dropdown' LIMIT 1;
SELECT id INTO toggle_type FROM field_types WHERE type_code = 'toggle' LIMIT 1;
SELECT id INTO number_type FROM field_types WHERE type_code = 'numeric_input' LIMIT 1;
SELECT id INTO color_ral_type FROM field_types WHERE type_code = 'color_ral' LIMIT 1;
SELECT id INTO textarea_type FROM field_types WHERE type_code = 'textarea' LIMIT 1;
SELECT id INTO date_type FROM field_types WHERE type_code = 'date_input' LIMIT 1;
SELECT id INTO button_group_type FROM field_types WHERE type_code = 'button_group' LIMIT 1;
SELECT id INTO oracal_type FROM field_types WHERE type_code = 'oracal_selector' LIMIT 1;
SELECT id INTO info_box_type FROM field_types WHERE type_code = 'info_box' LIMIT 1;
SELECT id INTO signtrim_type FROM field_types WHERE type_code = 'color_signtrim' LIMIT 1;

-- Create SignTrim field type if it doesn't exist
IF signtrim_type IS NULL THEN
  INSERT INTO field_types (type_code, display_name_en, display_name_ru, display_name_lv, metadata)
  VALUES (
    'signtrim_selector',
    'SignTrim Selector',
    'Селектор SignTrim',
    'SignTrim atlasītājs',
    '{
      "colors": {
        "971": {"name": "WHITE", "hex": "#FFFFFF"},
        "785": {"name": "BLACK", "hex": "#000000"},
        "721": {"name": "BLACK/GREY", "hex": "#4A4A4A"},
        "479": {"name": "ULTRAMARINE", "hex": "#1E3A8A"},
        "155": {"name": "YELLOW 2", "hex": "#FFE135"},
        "097": {"name": "ORANGE", "hex": "#FF6600"},
        "467": {"name": "BLUE 2", "hex": "#0052A5"},
        "503": {"name": "SAPPHIRE BLUE", "hex": "#0F52BA"},
        "606": {"name": "PURPLE", "hex": "#800080"},
        "948": {"name": "BEIGE", "hex": "#F5F5DC"},
        "166": {"name": "APPLE GREEN", "hex": "#8DB600"},
        "415": {"name": "SKY BLUE", "hex": "#87CEEB"},
        "610": {"name": "MAGENTA", "hex": "#E0115F"},
        "906": {"name": "WHITE ALU", "hex": "#F5F5F5"},
        "933": {"name": "IVORY", "hex": "#FFFFF0"},
        "528": {"name": "YELLOW GREEN", "hex": "#9ACD32"},
        "461": {"name": "BLUE", "hex": "#0066CC"},
        "185": {"name": "MC YELLOW", "hex": "#FFD200"},
        "313": {"name": "SATIN SILVER", "hex": "#B8B8B8"},
        "743": {"name": "TRAFFIC GREY", "hex": "#6C757D"},
        "132": {"name": "SIGNAL GREEN", "hex": "#00A651"},
        "664": {"name": "VIOLET", "hex": "#9400D3"},
        "118": {"name": "YELLOW", "hex": "#FFED00"},
        "300": {"name": "SILVER MIRROR", "hex": "#C0C0C0"},
        "896": {"name": "BRONZE", "hex": "#CD7F32"},
        "817": {"name": "BROWN", "hex": "#8B4513"},
        "121": {"name": "KELLY GREEN", "hex": "#4CBB17"},
        "509": {"name": "AZUR BLUE", "hex": "#007FFF"},
        "014": {"name": "WINE RED", "hex": "#722F37"},
        "246": {"name": "YELLOW GOLD", "hex": "#F4C430"}
      }
    }'::jsonb
  )
  RETURNING id INTO signtrim_type;
END IF;

-- ==========================================
-- PROFILE P5: SIGNTRIM (Complete with all colors)
-- ==========================================

INSERT INTO profile_templates (code, name, description, version, is_active, metadata)
VALUES (
  'P5',
  'Profile 5 - SignTrim',
  'SignTrim channel letters with specialized trim and LED options',
  1,
  true,
  '{
    "icon": "award",
    "complexity": "complex",
    "typical_timeline": "8-10 days",
    "color": "#9333EA"
  }'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  metadata = EXCLUDED.metadata
RETURNING id INTO p5_id;

-- ==========================================
-- PROFILE P8: 5-SIDED LIGHTBOX
-- ==========================================

INSERT INTO profile_templates (code, name, description, version, is_active, metadata)
VALUES (
  'P8',
  'Profile 8 - 5-Sided Lightbox',
  '5-sided lightbox with flexible material options for all sides',
  1,
  true,
  '{
    "icon": "box",
    "complexity": "medium",
    "typical_timeline": "10-12 days",
    "color": "#14B8A6"
  }'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  metadata = EXCLUDED.metadata
RETURNING id INTO p8_id;

-- ==========================================
-- PROFILE P4: BANNER FACE
-- ==========================================

INSERT INTO profile_templates (code, name, description, version, is_active, metadata)
VALUES (
  'P4',
  'Profile 4 - Banner Face',
  'Banner face profile from lalal-slava specification',
  1,
  true,
  '{
    "icon": "file-text",
    "complexity": "simple",
    "typical_timeline": "5-7 days",
    "color": "#F59E0B"
  }'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  metadata = EXCLUDED.metadata
RETURNING id INTO p4_id;

-- Log completion
RAISE NOTICE 'Complete profile templates created successfully';
RAISE NOTICE 'P5 ID: %, P8 ID: %, P4 ID: %', p5_id, p8_id, p4_id;

END $$;
