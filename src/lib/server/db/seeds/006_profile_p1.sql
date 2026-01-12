-- src/lib/server/db/seeds/006_profile_p1.sql

-- Create Profile Template P1
INSERT INTO profile_templates (code, name, version, is_active, metadata) VALUES
  ('P1', 'Profile 1 - Outdoor Sign', 1, true,
   '{"icon": "box", "description": {"en": "Standard outdoor signage profile", "ru": "Стандартный профиль наружной вывески", "lv": "Standarta ārtelpu zīmju profils"}, "category": "standard", "manufacturingTime": 6}'::jsonb)
RETURNING id AS p1_id \gset

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
SELECT id FROM field_types WHERE type_code = 'dimension_input' \gset dimension_type_

-- Get section IDs
SELECT id FROM profile_sections WHERE name = 'BENDER' \gset bender_section_
SELECT id FROM profile_sections WHERE name = 'FRONT' \gset front_section_
SELECT id FROM profile_sections WHERE name = 'PAINTING' \gset painting_section_
SELECT id FROM profile_sections WHERE name = 'ASSEMBLING' \gset assembling_section_
SELECT id FROM profile_sections WHERE name = 'DELIVERY' \gset delivery_section_

-- ==========================================
-- SECTION 1: BENDER
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  -- Sides
  (:p1_id, :bender_section_, :checkbox_type_, 'sides', 'SIDES', 'СТОРОНЫ', 'MALAS', false, 1, '{}'::jsonb),

  -- Material
  (:p1_id, :bender_section_, :material_type_, 'material', 'Material', 'Материал', 'Materiāls', true, 2,
   '{"options": ["ALU_1_0", "ALU_1_2", "ALU_1_5"]}'::jsonb),

  -- Dimensions
  (:p1_id, :bender_section_, :dimension_type_, 'dimensions', 'Dimensions', 'Размеры', 'Izmēri', false, 3,
   '{"unit": "mm", "fields": ["width", "height"]}'::jsonb);

-- ==========================================
-- SECTION 2: FRONT
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  -- Opal
  (:p1_id, :front_section_, :checkbox_type_, 'opal', 'OPAL', 'ОПАЛ', 'OPĀLS', false, 1, '{}'::jsonb),

  -- Thickness
  (:p1_id, :front_section_, :thickness_type_, 'thickness', 'Thickness', 'Толщина', 'Biezums', true, 2,
   '{"unit": "mm", "step": 1, "min": 3, "max": 10, "defaultValue": 3}'::jsonb),

  -- Close to option
  (:p1_id, :front_section_, :dropdown_type_, 'close_to', 'Close To', 'Близко к', 'Tuvu pie', false, 3,
   '{"options": ["CLOSE TO THE FILM", "CLOSE TO ACRYLIC"]}'::jsonb),

  -- Primary Color
  (:p1_id, :front_section_, :color_ral_type_, 'color_ral', 'Color (RAL)', 'Цвет (RAL)', 'Krāsa (RAL)', false, 4,
   '{"showPreview": true, "previewSize": "md"}'::jsonb);

-- ==========================================
-- SECTION 3: PAINTING
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  -- Frame
  (:p1_id, :painting_section_, :checkbox_type_, 'frame', 'FRAME', 'РАМКА', 'RĀMIS', false, 1, '{}'::jsonb),

  -- Sides
  (:p1_id, :painting_section_, :checkbox_type_, 'sides', 'SIDES', 'СТОРОНЫ', 'MALAS', false, 2, '{}'::jsonb),

  -- Frame Color
  (:p1_id, :painting_section_, :color_ral_type_, 'frame_color', 'Frame Color (RAL)', 'Цвет рамки (RAL)', 'Rāmja krāsa (RAL)', false, 3,
   '{"showPreview": true}'::jsonb),

  -- Distance tube
  (:p1_id, :painting_section_, :dimension_type_, 'distance_tube', 'Distance Tube', 'Дистанционная трубка', 'Distanču caurule', false, 4,
   '{"unit": "mm", "step": 1, "min": 8, "max": 50}'::jsonb);

-- ==========================================
-- SECTION 4: ASSEMBLING
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config, conditional_logic)
VALUES
  -- LED
  (:p1_id, :assembling_section_, :checkbox_type_, 'led', 'LED', 'LED', 'LED', false, 1, '{}'::jsonb, '[]'::jsonb),

  -- LED Type
  (:p1_id, :assembling_section_, :dropdown_type_, 'led_type', 'LED Type', 'Тип LED', 'LED Veids', false, 2,
   '{"options": ["Bell LED", "SLOAN", "REGULAR SEPARATE", "NO LED"]}'::jsonb,
   '[{"field_key": "led", "operator": "equals", "value": true, "action": "show"}]'::jsonb),

  -- Trafo
  (:p1_id, :assembling_section_, :dropdown_type_, 'trafo', 'Trafo', 'Трансформатор', 'Transformators', false, 3,
   '{"options": ["REGULAR", "WAGO", "NO CABLES"]}'::jsonb, '[]'::jsonb),

  -- Mount holes
  (:p1_id, :assembling_section_, :checkbox_type_, 'mount_holes', 'Mount Holes', 'Монтажные отверстия', 'Montāžas caurumi', false, 4, '{}'::jsonb, '[]'::jsonb),

  -- Brushed finish
  (:p1_id, :assembling_section_, :dropdown_type_, 'alu_finish', 'Alu Finish', 'Отделка алюминия', 'Alumīnija apdare', false, 5,
   '{"options": ["ALU BRUSHED", "Horizontal BRUSHED", "NO BRUSHED"]}'::jsonb, '[]'::jsonb),

  -- Waterholes options
  (:p1_id, :assembling_section_, :chips_type_, 'waterproof', 'Waterproof', 'Водонепроницаемость', 'Ūdensnecaurlaidīgums', false, 6,
   '{"options": ["WATERHOLES", "NO WATERHOLES", "PVC 19mm", "GLUED ON BACKSIDE"]}'::jsonb, '[]'::jsonb);

-- ==========================================
-- SECTION 5: DELIVERY
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  -- Delivery Date
  (:p1_id, :delivery_section_, :date_type_, 'delivery_date', 'Delivery Date', 'Дата доставки', 'Piegādes datums', true, 1,
   '{"format": "YYYY-MM-DD"}'::jsonb);
