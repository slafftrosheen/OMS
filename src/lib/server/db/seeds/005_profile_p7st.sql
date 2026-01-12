-- src/lib/server/db/seeds/005_profile_p7st.sql

-- Create Profile Template P7st
INSERT INTO profile_templates (code, name, version, is_active, metadata) VALUES
  ('P7st', 'Profile 7st - Outdoor/Indoor Sign', 1, true,
   '{"icon": "box", "description": {"en": "Standard outdoor/indoor signage profile with LED options", "ru": "Стандартный профиль для наружных/внутренних вывесок с LED", "lv": "Standarta ārtelpu/iekštelpu profils ar LED opcijām"}, "category": "standard", "manufacturingTime": 8}'::jsonb)
RETURNING id AS p7st_id \gset

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
SELECT id FROM profile_sections WHERE name = 'FRONT' \gset front_section_
SELECT id FROM profile_sections WHERE name = 'PAINTING' \gset painting_section_
SELECT id FROM profile_sections WHERE name = 'ASSEMBLING' \gset assembling_section_
SELECT id FROM profile_sections WHERE name = 'DELIVERY' \gset delivery_section_

-- ==========================================
-- SECTION 1: LINE_FREEZER (CNC Router)
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  -- Face checkbox
  (:p7st_id, :cnc_section_, :checkbox_type_, 'face', 'FACE', 'ЛИЦО', 'SEJA', false, 1, '{}'::jsonb),

  -- Back checkbox
  (:p7st_id, :cnc_section_, :checkbox_type_, 'back', 'BACK', 'НАЗАД', 'ATPAKAĻ', false, 2, '{}'::jsonb),

  -- Material selector
  (:p7st_id, :cnc_section_, :material_type_, 'material', 'Material', 'Материал', 'Materiāls', true, 3,
   '{"options": ["OPAL", "ALU_1_3", "ALU_1_5"]}'::jsonb),

  -- Thickness
  (:p7st_id, :cnc_section_, :thickness_type_, 'thickness', 'Thickness', 'Толщина', 'Biezums', true, 4,
   '{"unit": "mm", "step": 0.1, "min": 1, "max": 10}'::jsonb),

  -- Size
  (:p7st_id, :cnc_section_, :numeric_type_, 'size', 'Size', 'Размер', 'Izmērs', false, 5,
   '{"unit": "mm", "step": 1, "min": 10, "max": 500, "defaultValue": 60}'::jsonb);

-- ==========================================
-- SECTION 2: BENDER
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  -- Sides checkbox
  (:p7st_id, :bender_section_, :checkbox_type_, 'sides', 'SIDES', 'СТОРОНЫ', 'MALAS', false, 1, '{}'::jsonb),

  -- Material
  (:p7st_id, :bender_section_, :material_type_, 'material', 'Material', 'Материал', 'Materiāls', true, 2,
   '{"options": ["OPAL", "ALU_1_2", "ALU_1_5"]}'::jsonb);

-- ==========================================
-- SECTION 3: FRONT
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  -- Opal checkbox
  (:p7st_id, :front_section_, :checkbox_type_, 'opal', 'OPAL', 'ОПАЛ', 'OPĀLS', false, 1, '{}'::jsonb),

  -- Thickness
  (:p7st_id, :front_section_, :thickness_type_, 'thickness', 'Thickness', 'Толщина', 'Biezums', true, 2,
   '{"unit": "mm", "step": 0.5, "min": 2, "max": 10, "defaultValue": 3}'::jsonb),

  -- Primary Color (RAL)
  (:p7st_id, :front_section_, :color_ral_type_, 'color_ral_primary', 'Primary Color (RAL)', 'Основной цвет (RAL)', 'Galvenā krāsa (RAL)', false, 3,
   '{"showPreview": true, "previewSize": "md"}'::jsonb),

  -- Secondary Color (RAL)
  (:p7st_id, :front_section_, :color_ral_type_, 'color_ral_secondary', 'Secondary Color (RAL)', 'Вторичный цвет (RAL)', 'Sekundārā krāsa (RAL)', false, 4,
   '{"showPreview": true, "previewSize": "md"}'::jsonb),

  -- No Frame toggle
  (:p7st_id, :front_section_, :toggle_type_, 'no_frame', 'NO FRAME', 'БЕЗ РАМКИ', 'BEZ RĀMJA', false, 5, '{}'::jsonb),

  -- Print checkbox
  (:p7st_id, :front_section_, :checkbox_type_, 'print', 'PRINT', 'ПЕЧАТЬ', 'DRUKA', false, 6, '{}'::jsonb);

-- ==========================================
-- SECTION 4: PAINTING
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  -- Sides checkbox
  (:p7st_id, :painting_section_, :checkbox_type_, 'sides', 'SIDES', 'СТОРОНЫ', 'MALAS', false, 1, '{}'::jsonb),

  -- Back checkbox
  (:p7st_id, :painting_section_, :checkbox_type_, 'back', 'BACK', 'НАЗАД', 'ATPAKAĻ', false, 2, '{}'::jsonb),

  -- Frame checkbox
  (:p7st_id, :painting_section_, :checkbox_type_, 'frame', 'FRAME', 'РАМКА', 'RĀMIS', false, 3, '{}'::jsonb),

  -- Color (RAL)
  (:p7st_id, :painting_section_, :color_ral_type_, 'color_ral', 'Paint Color (RAL)', 'Цвет краски (RAL)', 'Krāsas krāsa (RAL)', false, 4,
   '{"showPreview": true, "previewSize": "md"}'::jsonb);

-- ==========================================
-- SECTION 5: ASSEMBLING
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config, conditional_logic)
VALUES
  -- LED checkbox
  (:p7st_id, :assembling_section_, :checkbox_type_, 'led', 'LED', 'LED', 'LED', false, 1, '{}'::jsonb, '[]'::jsonb),

  -- LED Type (conditional on LED checkbox)
  (:p7st_id, :assembling_section_, :dropdown_type_, 'led_type', 'LED Type', 'Тип LED', 'LED Veids', false, 2,
   '{"options": ["Bell LED", "SLOAN", "REGULAR", "WARM WHITE 3000K", "WHITE 6500K", "REGULA"]}'::jsonb,
   '[{"field_key": "led", "operator": "equals", "value": true, "action": "show"}]'::jsonb),

  -- LED Color Temperature (conditional on LED)
  (:p7st_id, :assembling_section_, :dropdown_type_, 'led_temperature', 'Color Temperature', 'Цветовая температура', 'Krāsas temperatūra', false, 3,
   '{"options": ["3000K", "6500K", "9000K"]}'::jsonb,
   '[{"field_key": "led", "operator": "equals", "value": true, "action": "show"}]'::jsonb),

  -- Waterproof options (multi-select chips)
  (:p7st_id, :assembling_section_, :chips_type_, 'waterproof', 'Waterproof', 'Водонепроницаемый', 'Ūdensnecaurlaidīgs', false, 4,
   '{"options": ["IP65", "OUTDOOR", "INDOOR", "WATERHOLES", "NO WATERHOLES"]}'::jsonb, '[]'::jsonb),

  -- WAGO toggle
  (:p7st_id, :assembling_section_, :toggle_type_, 'wago', 'WAGO', 'WAGO', 'WAGO', false, 5, '{}'::jsonb, '[]'::jsonb),

  -- SHABLON toggle
  (:p7st_id, :assembling_section_, :toggle_type_, 'shablon', 'SHABLON', 'ШАБЛОН', 'ŠABLONS', false, 6, '{}'::jsonb, '[]'::jsonb),

  -- Cable length
  (:p7st_id, :assembling_section_, :numeric_type_, 'cable_length', 'Cable Length', 'Длина кабеля', 'Kabeļa garums', false, 7,
   '{"unit": "m", "step": 0.5, "min": 0, "max": 100}'::jsonb,
   '[{"field_key": "led", "operator": "equals", "value": true, "action": "show"}]'::jsonb);

-- ==========================================
-- SECTION 6: DELIVERY
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  -- Delivery Date
  (:p7st_id, :delivery_section_, :date_type_, 'delivery_date', 'Delivery Date', 'Дата доставки', 'Piegādes datums', true, 1,
   '{"format": "YYYY-MM-DD"}'::jsonb);
