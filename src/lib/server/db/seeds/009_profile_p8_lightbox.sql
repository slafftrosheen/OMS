-- src/lib/server/db/seeds/009_profile_p8_lightbox.sql

-- Create Profile Template P8
INSERT INTO profile_templates (code, name, version, is_active, metadata) VALUES
  ('P8', 'Profile 8 - 5-Sided Lightbox', 1, true,
   '{"icon": "lightbulb", "description": {"en": "5-sided lightbox profile for indoor signage", "ru": "Профиль 5-сторонний световой короб для внутренних вывесок", "lv": "5-pušu gaismas kastes profils iekštelpu zīmēm"}, "category": "lightbox", "manufacturingTime": 10}'::jsonb)
RETURNING id AS p8_id \gset

-- Get field type IDs
SELECT id FROM field_types WHERE type_code = 'checkbox' \gset checkbox_type_
SELECT id FROM field_types WHERE type_code = 'material_selector' \gset material_type_
SELECT id FROM field_types WHERE type_code = 'thickness_selector' \gset thickness_type_
SELECT id FROM field_types WHERE type_code = 'color_ral' \gset color_ral_type_
SELECT id FROM field_types WHERE type_code = 'dropdown' \gset dropdown_type_
SELECT id FROM field_types WHERE type_code = 'numeric_input' \gset numeric_type_
SELECT id FROM field_types WHERE type_code = 'date_input' \gset date_type_

-- Get section IDs
SELECT id FROM profile_sections WHERE name = 'LINE_FREEZER' \gset cnc_section_
SELECT id FROM profile_sections WHERE name = 'PAINTING' \gset painting_section_
SELECT id FROM profile_sections WHERE name = 'ASSEMBLING' \gset assembling_section_
SELECT id FROM profile_sections WHERE name = 'DELIVERY' \gset delivery_section_

-- ==========================================
-- SECTION 1: CNC FREEZER
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  -- Face
  (:p8_id, :cnc_section_, :checkbox_type_, 'face', 'FACE', 'ЛИЦО', 'SEJA', false, 1, '{}'::jsonb),

  -- Base
  (:p8_id, :cnc_section_, :checkbox_type_, 'base', 'BASE', 'ОСНОВАНИЕ', 'BĀZE', false, 2, '{}'::jsonb),

  -- Sides
  (:p8_id, :cnc_section_, :checkbox_type_, 'sides', 'SIDES', 'СТОРОНЫ', 'MALAS', false, 3, '{}'::jsonb),

  -- Face Material
  (:p8_id, :cnc_section_, :material_type_, 'face_material', 'Face Material', 'Материал лица', 'Sejas materiāls', true, 4,
   '{"options": ["OPAL_WHITE", "ACRYLIC_CLEAR"]}'::jsonb),

  -- Face Thickness
  (:p8_id, :cnc_section_, :thickness_type_, 'face_thickness', 'Face Thickness', 'Толщина лица', 'Sejas biezums', true, 5,
   '{"unit": "mm", "step": 1, "min": 3, "max": 10, "defaultValue": 6}'::jsonb),

  -- Base Material
  (:p8_id, :cnc_section_, :material_type_, 'base_material', 'Base Material', 'Материал основания', 'Bāzes materiāls', true, 6,
   '{"options": ["ALU_1_5", "ALU_2_0", "ACRYLIC_WHITE"]}'::jsonb);

-- ==========================================
-- SECTION 2: PAINTING
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  -- Letters
  (:p8_id, :painting_section_, :checkbox_type_, 'letters', 'LETTERS', 'БУКВЫ', 'BURTI', false, 1, '{}'::jsonb),

  -- Letters Base
  (:p8_id, :painting_section_, :checkbox_type_, 'letters_base', 'LETTERS BASE', 'ОСНОВАНИЕ БУКВ', 'BURTU BĀZE', false, 2, '{}'::jsonb),

  -- Color with special RAL format
  (:p8_id, :painting_section_, :color_ral_type_, 'color_ral', 'Color (RAL)', 'Цвет (RAL)', 'Krāsa (RAL)', true, 3,
   '{"showPreview": true, "allowCustom": true, "note": "Example: RAL D2 160 40 35"}'::jsonb),

  -- Finish
  (:p8_id, :painting_section_, :dropdown_type_, 'finish', 'Finish', 'Отделка', 'Apdare', false, 4,
   '{"options": ["50% glossy", "matte", "gloss"]}'::jsonb);

-- ==========================================
-- SECTION 3: ASSEMBLING
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  -- LED (always required for lightbox)
  (:p8_id, :assembling_section_, :checkbox_type_, 'led', 'LED', 'LED', 'LED', true, 1, '{"defaultValue": true}'::jsonb),

  -- LED Temperature
  (:p8_id, :assembling_section_, :dropdown_type_, 'led_temperature', 'LED Temperature', 'Температура LED', 'LED Temperatūra', true, 2,
   '{"options": ["3500K", "4000K", "6500K"], "defaultValue": "3500K"}'::jsonb),

  -- LED Position
  (:p8_id, :assembling_section_, :dropdown_type_, 'led_position', 'LED Position', 'Позиция LED', 'LED Pozīcija', false, 3,
   '{"options": ["INSIDE BOX", "BEHIND FACE", "EDGE LIT"]}'::jsonb),

  -- Trafo
  (:p8_id, :assembling_section_, :dropdown_type_, 'trafo', 'Trafo', 'Трансформатор', 'Transformators', true, 4,
   '{"options": ["INSIDE BOX", "EXTERNAL", "NO TRAFO"]}'::jsonb),

  -- Cable Length
  (:p8_id, :assembling_section_, :numeric_type_, 'cable_length', 'Cable Length', 'Длина кабеля', 'Kabeļa garums', false, 5,
   '{"unit": "m", "step": 0.5, "min": 1, "max": 10, "defaultValue": 2}'::jsonb),

  -- Waterholes
  (:p8_id, :assembling_section_, :checkbox_type_, 'waterholes', 'NO WATERHOLES', 'БЕЗ ДРЕНАЖНЫХ ОТВЕРСТИЙ', 'BEZ ŪDENS CAURUMIEM', false, 6, '{}'::jsonb);

-- ==========================================
-- SECTION 4: DELIVERY
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  (:p8_id, :delivery_section_, :date_type_, 'delivery_date', 'Delivery Date', 'Дата доставки', 'Piegādes datums', true, 1,
   '{"format": "YYYY-MM-DD"}'::jsonb);
