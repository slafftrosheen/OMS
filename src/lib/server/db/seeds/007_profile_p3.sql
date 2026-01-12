-- src/lib/server/db/seeds/007_profile_p3.sql

-- Create Profile Template P3
INSERT INTO profile_templates (code, name, version, is_active, metadata) VALUES
  ('P3', 'Profile 3 - Acrylic Channel', 1, true,
   '{"icon": "layers", "description": {"en": "Acrylic channel profile for indoor/outdoor signs", "ru": "Профиль акрилового канала для внутренних/наружных вывесок", "lv": "Akrilā kanāla profils iekštelpu/ārtelpu zīmēm"}, "category": "acrylic", "manufacturingTime": 7}'::jsonb)
RETURNING id AS p3_id \gset

-- Get field type IDs and sections (reuse from previous)
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
SELECT id FROM profile_sections WHERE name = 'LINE_FREEZER' \gset cnc_section_
SELECT id FROM profile_sections WHERE name = 'BENDER' \gset bender_section_
SELECT id FROM profile_sections WHERE name = 'BACKPANEL' \gset backpanel_section_
SELECT id FROM profile_sections WHERE name = 'PAINTING' \gset painting_section_
SELECT id FROM profile_sections WHERE name = 'ASSEMBLING' \gset assembling_section_
SELECT id FROM profile_sections WHERE name = 'DELIVERY' \gset delivery_section_

-- ==========================================
-- SECTION 1: CNC FREEZER (Acrylic Channel)
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  -- Face
  (:p3_id, :cnc_section_, :checkbox_type_, 'face', 'FACE', 'ЛИЦО', 'SEJA', false, 1, '{}'::jsonb),

  -- Back
  (:p3_id, :cnc_section_, :checkbox_type_, 'back', 'BACK', 'НАЗАД', 'ATPAKAĻ', false, 2, '{}'::jsonb),

  -- Clear Acrylic Channel
  (:p3_id, :cnc_section_, :checkbox_type_, 'clear_acrylic', 'CLEAR ACRYLIC CHANNEL', 'ПРОЗРАЧНЫЙ АКРИЛОВЫЙ КАНАЛ', 'CAURSPĪDĪGS AKRILĀ KANĀLS', false, 3, '{}'::jsonb),

  -- Milled depth
  (:p3_id, :cnc_section_, :dimension_type_, 'milled_depth', 'Milled Depth', 'Глубина фрезеровки', 'Frēzēšanas dziļums', false, 4,
   '{"unit": "mm", "step": 1, "min": 10, "max": 20, "defaultValue": 15}'::jsonb),

  -- Opal material
  (:p3_id, :cnc_section_, :material_type_, 'opal_material', 'Opal Material', 'Материал опал', 'Opāla materiāls', true, 5,
   '{"options": ["OPAL_WHITE", "OPAL_CLEAR"]}'::jsonb);

-- ==========================================
-- SECTION 2: BENDER (Optional)
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  -- Sides
  (:p3_id, :bender_section_, :checkbox_type_, 'sides', 'SIDES', 'СТОРОНЫ', 'MALAS', false, 1, '{}'::jsonb),

  -- Material
  (:p3_id, :bender_section_, :material_type_, 'material', 'Material', 'Материал', 'Materiāls', false, 2,
   '{"options": ["ALU_1_5", "NO_BENDER"]}'::jsonb);

-- ==========================================
-- SECTION 3: BACK PANEL
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  -- Back Panel option
  (:p3_id, :backpanel_section_, :dropdown_type_, 'backpanel_type', 'Back Panel Type', 'Тип задней панели', 'Aizmugures paneļa veids', false, 1,
   '{"options": ["NO PANEL", "ALU PANEL", "PVC PANEL"]}'::jsonb),

  -- Thickness (if panel selected)
  (:p3_id, :backpanel_section_, :thickness_type_, 'panel_thickness', 'Panel Thickness', 'Толщина панели', 'Paneļa biezums', false, 2,
   '{"unit": "mm", "step": 1, "min": 3, "max": 10}'::jsonb);

-- ==========================================
-- SECTION 4: PAINTING
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  -- Front
  (:p3_id, :painting_section_, :checkbox_type_, 'front', 'FRONT', 'ПЕРЕДНЯЯ', 'PRIEKŠPUSE', false, 1, '{}'::jsonb),

  -- Sides
  (:p3_id, :painting_section_, :checkbox_type_, 'sides', 'SIDES', 'СТОРОНЫ', 'MALAS', false, 2, '{}'::jsonb),

  -- Distance frame
  (:p3_id, :painting_section_, :checkbox_type_, 'distance_frame', 'DISTANCE FRAME', 'ДИСТАНЦИОННАЯ РАМКА', 'DISTANČU RĀMIS', false, 3, '{}'::jsonb),

  -- Back
  (:p3_id, :painting_section_, :checkbox_type_, 'back', 'BACK', 'НАЗАД', 'ATPAKAĻ', false, 4, '{}'::jsonb),

  -- Color
  (:p3_id, :painting_section_, :color_ral_type_, 'color_ral', 'Paint Color (RAL)', 'Цвет краски (RAL)', 'Krāsas krāsa (RAL)', false, 5,
   '{"showPreview": true}'::jsonb);

-- ==========================================
-- SECTION 5: ASSEMBLING
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config, conditional_logic)
VALUES
  -- LED
  (:p3_id, :assembling_section_, :checkbox_type_, 'led', 'LED', 'LED', 'LED', false, 1, '{}'::jsonb, '[]'::jsonb),

  -- LED Type
  (:p3_id, :assembling_section_, :dropdown_type_, 'led_type', 'LED Type', 'Тип LED', 'LED Veids', false, 2,
   '{"options": ["REGULA", "NO LED", "СТАВЯТ САМИ"]}'::jsonb,
   '[{"field_key": "led", "operator": "equals", "value": true, "action": "show"}]'::jsonb),

  -- Trafo
  (:p3_id, :assembling_section_, :dropdown_type_, 'trafo', 'Trafo', 'Трансформатор', 'Transformators', false, 3,
   '{"options": ["CABLES CLICK MINI", "NO CABLES", "WAGO"]}'::jsonb, '[]'::jsonb),

  -- Distance
  (:p3_id, :assembling_section_, :dimension_type_, 'distance', 'Distance', 'Расстояние', 'Attālums', false, 4,
   '{"unit": "mm", "step": 1, "min": 8, "max": 50, "defaultValue": 12}'::jsonb, '[]'::jsonb),

  -- Waterholes
  (:p3_id, :assembling_section_, :chips_type_, 'waterholes', 'Waterholes', 'Дренажные отверстия', 'Ūdens caurumi', false, 5,
   '{"options": ["WATERHOLES ON PLEXI BACK", "NO WATERHOLES", "WATERHOLES IN ALU PARTS"]}'::jsonb, '[]'::jsonb),

  -- Shablon
  (:p3_id, :assembling_section_, :toggle_type_, 'shablon', 'SHABLON', 'ШАБЛОН', 'ŠABLONS', false, 6, '{}'::jsonb, '[]'::jsonb);

-- ==========================================
-- SECTION 6: DELIVERY
-- ==========================================

INSERT INTO profile_section_fields
  (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config)
VALUES
  (:p3_id, :delivery_section_, :date_type_, 'delivery_date', 'Delivery Date', 'Дата доставки', 'Piegādes datums', true, 1,
   '{"format": "YYYY-MM-DD"}'::jsonb);
