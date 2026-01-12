-- src/lib/server/db/seeds/008_profile_p5_signtrim.sql

-- First, add SIGNTRIM color field type
INSERT INTO field_types (type_code, component_name, default_config) VALUES
  ('color_signtrim', 'ColorSigntrim.svelte', '{"showPreview": true, "previewSize": "md", "system": "SIGNTRIM"}'::jsonb)
ON CONFLICT (type_code) DO NOTHING;

SELECT id FROM field_types WHERE type_code = 'color_signtrim' \gset signtrim_color_type_

-- Create Profile Template P5
INSERT INTO profile_templates (code, name, version, is_active, metadata) VALUES
  ('P5', 'Profile 5 - SignTrim', 1, true,
   '{"icon": "palette", "description": {"en": "SignTrim profile with specialized trim color system", "ru": "Профиль SignTrim со специализированной системой цветов отделки", "lv": "SignTrim profils ar specializētu apdares krāsu sistēmu"}, "category": "signtrim", "manufacturingTime": 8}'::jsonb)
RETURNING id AS p5_id \gset

-- Get field type IDs
SELECT id FROM field_types WHERE type_code = 'checkbox' \gset checkbox_type_
SELECT id FROM field_types WHERE type_code = 'material_selector' \gset material_type_
SELECT id FROM field_types WHERE type_code = 'thickness_selector' \gset thickness_type_
SELECT id FROM field_types WHERE type_code = 'numeric_input' \gset numeric_type_
SELECT id FROM field_types WHERE type_code = 'color_ral' \gset color_ral_type_
SELECT id FROM field_types WHERE type_code = 'toggle' \gset toggle_type_
SELECT id FROM field_types WHERE type_code = 'dropdown' \gset dropdown_type_
SELECT id FROM field_types WHERE type_code = 'multi_select_chips' \gset chips_type_
SELECT id FROM field_types WHERE type_code = 'date_input' \gset date_type_

-- Get section IDs
SELECT id FROM profile_sections WHERE name = 'LINE_FREEZER' \gset cnc_section_
SELECT id FROM profile_sections WHERE name = 'BENDER' \gset bender_section_
SELECT id FROM profile_sections WHERE name = 'TRIM' \gset trim_section_
SELECT id FROM profile_sections WHERE name = 'PAINTING' \gset painting_section_
SELECT id FROM profile_sections WHERE name = 'ASSEMBLING' \gset assembling_section_
SELECT id FROM profile_sections WHERE name = 'DELIVERY' \gset delivery_section_

-- ==========================================
-- SECTION 1: CNC FREEZER
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  (:p5_id, :cnc_section_, :checkbox_type_, 'face', 'FACE', 'ЛИЦО', 'SEJA', false, 1, '{}'::jsonb),
  (:p5_id, :cnc_section_, :material_type_, 'material', 'Material', 'Материал', 'Materiāls', true, 2,
   '{"options": ["OPAL_WHITE", "ALU_1_5"]}'::jsonb),
  (:p5_id, :cnc_section_, :thickness_type_, 'thickness', 'Thickness', 'Толщина', 'Biezums', true, 3,
   '{"unit": "mm", "step": 0.5, "min": 3, "max": 10, "defaultValue": 3}'::jsonb);

-- ==========================================
-- SECTION 2: BENDER
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  (:p5_id, :bender_section_, :checkbox_type_, 'sides', 'SIDES', 'СТОРОНЫ', 'MALAS', false, 1, '{}'::jsonb),
  (:p5_id, :bender_section_, :checkbox_type_, 'back', 'BACK', 'НАЗАД', 'ATPAKAĻ', false, 2, '{}'::jsonb),
  (:p5_id, :bender_section_, :material_type_, 'material', 'Material', 'Материал', 'Materiāls', true, 3,
   '{"options": ["ALU_1_2", "ALU_1_5"]}'::jsonb);

-- ==========================================
-- SECTION 3: TRIM (SignTrim Colors)
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  -- Primary Trim Color
  (:p5_id, :trim_section_, :signtrim_color_type_, 'trim_color_primary', 'Primary Trim Color', 'Основной цвет отделки', 'Galvenā apdares krāsa', true, 1,
   '{"showPreview": true, "previewSize": "lg"}'::jsonb),

  -- Secondary Trim Color
  (:p5_id, :trim_section_, :signtrim_color_type_, 'trim_color_secondary', 'Secondary Trim Color', 'Вторичный цвет отделки', 'Sekundārā apdares krāsa', false, 2,
   '{"showPreview": true, "previewSize": "md"}'::jsonb),

  -- Print option
  (:p5_id, :trim_section_, :dropdown_type_, 'print_type', 'Print Type', 'Тип печати', 'Drukas veids', false, 3,
   '{"options": ["PRINT", "PERFO PRINT", "NO PRINT"]}'::jsonb);

-- ==========================================
-- SECTION 4: PAINTING
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  (:p5_id, :painting_section_, :checkbox_type_, 'face', 'FACE', 'ЛИЦО', 'SEJA', false, 1, '{}'::jsonb),
  (:p5_id, :painting_section_, :checkbox_type_, 'back', 'BACK', 'НАЗАД', 'ATPAKAĻ', false, 2, '{}'::jsonb),
  (:p5_id, :painting_section_, :checkbox_type_, 'sides', 'SIDES', 'СТОРОНЫ', 'MALAS', false, 3, '{}'::jsonb),
  (:p5_id, :painting_section_, :color_ral_type_, 'color_ral', 'Paint Color (RAL)', 'Цвет краски (RAL)', 'Krāsas krāsa (RAL)', false, 4,
   '{"showPreview": true}'::jsonb);

-- ==========================================
-- SECTION 5: ASSEMBLING (Special LED options)
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config, conditional_logic)
VALUES
  -- LED checkbox
  (:p5_id, :assembling_section_, :checkbox_type_, 'led', 'LED', 'LED', 'LED', false, 1, '{}'::jsonb, '[]'::jsonb),

  -- Special LED types for P5
  (:p5_id, :assembling_section_, :dropdown_type_, 'led_type', 'LED Type', 'Тип LED', 'LED Veids', false, 2,
   '{"options": ["REGULA 5-years LED", "ELLIPTICA", "RED LED", "BLUE LED", "NO LED"]}'::jsonb,
   '[{"field_key": "led", "operator": "equals", "value": true, "action": "show"}]'::jsonb),

  -- DIMM SYSTEM
  (:p5_id, :assembling_section_, :toggle_type_, 'dimm_system', 'DIMM SYSTEM', 'СИСТЕМА ДИММИРОВАНИЯ', 'DIMM SISTĒMA', false, 3, '{}'::jsonb, '[]'::jsonb),

  -- GS option
  (:p5_id, :assembling_section_, :toggle_type_, 'gs', 'GS', 'GS', 'GS', false, 4, '{}'::jsonb, '[]'::jsonb);

-- ==========================================
-- SECTION 6: DELIVERY
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  (:p5_id, :delivery_section_, :date_type_, 'delivery_date', 'Delivery Date', 'Дата доставки', 'Piegādes datums', true, 1,
   '{"format": "YYYY-MM-DD"}'::jsonb);
