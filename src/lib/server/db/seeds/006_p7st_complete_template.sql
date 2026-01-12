-- src/lib/server/db/seeds/006_p7st_complete_template.sql
-- COMPLETE Profile 7st template matching PDF exactly

DO $$
DECLARE
  p7_template_id INTEGER;
  p7_cnc_id INTEGER;
  p7_bender_id INTEGER;
  p7_front_id INTEGER;
  p7_painting_id INTEGER;
  p7_assembling_id INTEGER;
  p7_delivery_id INTEGER;
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

BEGIN

-- Get field type IDs
SELECT id INTO material_field_type FROM field_types WHERE type_code = 'material_field' LIMIT 1;
SELECT id INTO dropdown_type FROM field_types WHERE type_code = 'dropdown' LIMIT 1;
SELECT id INTO toggle_type FROM field_types WHERE type_code = 'toggle' LIMIT 1;
SELECT id INTO number_type FROM field_types WHERE type_code = 'numeric_input' LIMIT 1;
SELECT id INTO color_ral_type FROM field_types WHERE type_code = 'color_ral' LIMIT 1;
SELECT id INTO textarea_type FROM field_types WHERE type_code = 'textarea' LIMIT 1;
SELECT id INTO date_type FROM field_types WHERE type_code = 'date_input' LIMIT 1;

-- Create custom field types if they don't exist
INSERT INTO field_types (type_code, display_name_en, display_name_ru, display_name_lv, metadata)
VALUES ('button_group', 'Button Group', 'Группа кнопок', 'Pogu grupa', '{}'::jsonb)
ON CONFLICT (type_code) DO NOTHING
RETURNING id INTO button_group_type;

IF button_group_type IS NULL THEN
  SELECT id INTO button_group_type FROM field_types WHERE type_code = 'button_group';
END IF;

INSERT INTO field_types (type_code, display_name_en, display_name_ru, display_name_lv, metadata)
VALUES ('oracal_selector', 'ORACAL Selector', 'Селектор ORACAL', 'ORACAL atlasītājs', '{}'::jsonb)
ON CONFLICT (type_code) DO NOTHING
RETURNING id INTO oracal_type;

IF oracal_type IS NULL THEN
  SELECT id INTO oracal_type FROM field_types WHERE type_code = 'oracal_selector';
END IF;

INSERT INTO field_types (type_code, display_name_en, display_name_ru, display_name_lv, metadata)
VALUES ('info_box', 'Info Box', 'Информационный блок', 'Informācijas logs', '{}'::jsonb)
ON CONFLICT (type_code) DO NOTHING
RETURNING id INTO info_box_type;

IF info_box_type IS NULL THEN
  SELECT id INTO info_box_type FROM field_types WHERE type_code = 'info_box';
END IF;

-- ==========================================
-- PROFILE 7st: OUTDOOR/INDOOR SIGN (Complete)
-- ==========================================

INSERT INTO profile_templates (code, name, description, version, is_active, metadata)
VALUES (
  'P7st',
  'Profile 7st - Super Pro',
  'Complete outdoor/indoor sign with all manufacturing stages',
  1,
  true,
  '{
    "icon": "award",
    "complexity": "complex",
    "typical_timeline": "8-10 days",
    "stages": ["CNC FREZER", "BENDER", "FRONT", "PAINTING", "ASSEMBLING", "DELIVERY"]
  }'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  version = EXCLUDED.version,
  metadata = EXCLUDED.metadata
RETURNING id INTO p7_template_id;

-- ==========================================
-- SECTION: CNC FREZER
-- ==========================================

-- Get or create section
INSERT INTO profile_sections (name, display_name_en, display_name_ru, display_name_lv, icon_id, order_index, is_standard)
VALUES ('CNC_FREZER', 'CNC FREZER', 'ЧПУ ФРЕЗЕР', 'CNC FRĒZE', 'cpu', 1, true)
ON CONFLICT (name) DO UPDATE SET
  display_name_en = EXCLUDED.display_name_en,
  display_name_ru = EXCLUDED.display_name_ru,
  display_name_lv = EXCLUDED.display_name_lv;

SELECT id INTO p7_cnc_id FROM profile_sections WHERE name = 'CNC_FREZER';

-- Clear existing fields for this template/section
DELETE FROM profile_section_fields WHERE profile_template_id = p7_template_id AND section_id = p7_cnc_id;

INSERT INTO profile_section_fields (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config, metadata) VALUES
-- FACE Material
(p7_template_id, p7_cnc_id, material_field_type, 'face_material', 'FACE', 'ЛИЦО', 'SEJA', true, 1,
  '{
    "materialTypes": ["ACRYLIC"],
    "defaultMaterial": "PLEXIGLAS_XT_WN071",
    "allowCustomThickness": false,
    "showThicknessAfterMaterial": true
  }'::jsonb,
  '{"column": 1, "visualBox": true}'::jsonb),

-- FACE Thickness
(p7_template_id, p7_cnc_id, dropdown_type, 'face_thickness', 'Face Thickness', 'Толщина лица', 'Sejas biezums', true, 2,
  '{"options": ["3mm", "5mm", "6mm", "8mm"], "default": "3mm"}'::jsonb,
  '{"column": 1, "linkedTo": "face_material"}'::jsonb),

-- BACK Material  
(p7_template_id, p7_cnc_id, material_field_type, 'back_material', 'BACK', 'ЗАДНИК', 'AIZMUGURE', true, 3,
  '{
    "materialTypes": ["ACRYLIC", "ALUMINUM", "PVC"],
    "allowCustomThickness": true
  }'::jsonb,
  '{"column": 2, "visualBox": true}'::jsonb),

-- Milling depth note
(p7_template_id, p7_cnc_id, info_box_type, 'face_milling_note', 'Milling Note', 'Примечание о фрезеровке', 'Frēzēšanas piezīme', false, 4,
  '{
    "content": "Акрил лицевик: фрезеруем / снимаем по максимуму (2-3mm in, 18-17mm out)",
    "type": "warning",
    "icon": "alert-circle"
  }'::jsonb,
  '{"fullWidth": true}'::jsonb);

-- ==========================================
-- SECTION: BENDER
-- ==========================================

SELECT id INTO p7_bender_id FROM profile_sections WHERE name = 'BENDER';
DELETE FROM profile_section_fields WHERE profile_template_id = p7_template_id AND section_id = p7_bender_id;

INSERT INTO profile_section_fields (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config, metadata) VALUES
-- SIDES Material
(p7_template_id, p7_bender_id, material_field_type, 'sides_material', 'SIDES', 'БОКОВИНЫ', 'SĀNI', true, 1,
  '{
    "materialTypes": ["ALUMINUM"],
    "defaultThickness": 1.2,
    "presetThicknesses": [1.0, 1.2, 1.5, 2.0]
  }'::jsonb,
  '{"column": 1, "visualBox": true}'::jsonb),

-- Sides Depth
(p7_template_id, p7_bender_id, number_type, 'sides_depth', 'Depth', 'Глубина', 'Dziļums', true, 2,
  '{
    "min": 30,
    "max": 200,
    "step": 10,
    "defaultValue": 60,
    "unit": "mm",
    "showInBox": true
  }'::jsonb,
  '{"column": 1}'::jsonb);

-- ==========================================
-- SECTION: FRONT
-- ==========================================

SELECT id INTO p7_front_id FROM profile_sections WHERE name = 'FRONT';
DELETE FROM profile_section_fields WHERE profile_template_id = p7_template_id AND section_id = p7_front_id;

INSERT INTO profile_section_fields (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config, metadata) VALUES
-- Film/Print option
(p7_template_id, p7_front_id, dropdown_type, 'front_finish', 'Finish', 'Отделка', 'Apdare', true, 1,
  '{"options": ["PRINT", "ORACAL 8500 Film", "Film from client", "NO FILM"], "default": "PRINT"}'::jsonb,
  '{"column": 1}'::jsonb),

-- ORACAL Film selector (conditional)
(p7_template_id, p7_front_id, oracal_type, 'oracal_film', 'ORACAL Film', 'Пленка ORACAL', 'ORACAL plēve', false, 2,
  '{
    "series": "8500",
    "showColorPreview": true
  }'::jsonb,
  '{"column": 2, "conditionalOn": "front_finish", "showIf": "ORACAL 8500 Film"}'::jsonb);

-- ==========================================
-- SECTION: PAINTING
-- ==========================================

SELECT id INTO p7_painting_id FROM profile_sections WHERE name = 'PAINTING';
DELETE FROM profile_section_fields WHERE profile_template_id = p7_template_id AND section_id = p7_painting_id;

INSERT INTO profile_section_fields (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config, metadata) VALUES
-- SIDES color
(p7_template_id, p7_painting_id, color_ral_type, 'sides_color', 'SIDES', 'БОКОВИНЫ', 'SĀNI', true, 1,
  '{
    "default": "3020",
    "showPreview": true,
    "previewSize": "lg",
    "allowCustom": true
  }'::jsonb,
  '{"column": 1, "visualBox": true, "boxColor": "ralValue"}'::jsonb),

-- BACK color
(p7_template_id, p7_painting_id, color_ral_type, 'back_color', 'BACK', 'ЗАДНИК', 'AIZMUGURE', true, 2,
  '{
    "default": "3020",
    "showPreview": true,
    "allowNoPaint": true
  }'::jsonb,
  '{"column": 2, "visualBox": true, "boxColor": "ralValue"}'::jsonb),

-- FRAME option
(p7_template_id, p7_painting_id, dropdown_type, 'frame_option', 'FRAME', 'РАМКА', 'RĀMIS', false, 3,
  '{"options": ["NO FRAME", "WHITE FRAME", "inside FRAME", "40mm SUPER PRO"], "default": "NO FRAME"}'::jsonb,
  '{"column": 3}'::jsonb),

-- Frame color (conditional)
(p7_template_id, p7_painting_id, color_ral_type, 'frame_color', 'Frame Color', 'Цвет рамки', 'Rāmja krāsa', false, 4,
  '{"showPreview": true}'::jsonb,
  '{"column": 3, "conditionalOn": "frame_option", "showIf": "!= NO FRAME"}'::jsonb);

-- ==========================================
-- SECTION: ASSEMBLING (Most Complex)
-- ==========================================

SELECT id INTO p7_assembling_id FROM profile_sections WHERE name = 'ASSEMBLING';
DELETE FROM profile_section_fields WHERE profile_template_id = p7_template_id AND section_id = p7_assembling_id;

INSERT INTO profile_section_fields (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config, metadata) VALUES
-- LED Type
(p7_template_id, p7_assembling_id, dropdown_type, 'led_type', 'LED', 'LED', 'LED', true, 1,
  '{"options": ["BaltLED", "SLOAN", "REGULAR", "NO LED - СТАВЯТ САМИ"], "default": "BaltLED"}'::jsonb,
  '{"column": 1, "visualBox": true, "boxColor": "#3B82F6"}'::jsonb),

-- LED Brand/Model (conditional)
(p7_template_id, p7_assembling_id, dropdown_type, 'led_brand', 'LED Brand', 'Бренд LED', 'LED zīmols', false, 2,
  '{"options": ["BaltLED 6500K", "SLOAN 6500K", "SLOAN inside FRAME", "6500K inside FRAME"]}'::jsonb,
  '{"column": 1, "conditionalOn": "led_type", "showIf": "!= NO LED"}'::jsonb),

-- LED Color Temperature
(p7_template_id, p7_assembling_id, button_group_type, 'led_kelvin', 'Color Temp', 'Цветовая темп.', 'Krāsas temp.', false, 3,
  '{
    "options": ["WARM WHITE 3000K", "WHITE 6000K", "9000K", "BLACK DAYNIGHT KVILLER"],
    "default": "WHITE 6000K",
    "visualStyle": "boxes"
  }'::jsonb,
  '{"column": 1, "conditionalOn": "led_type", "showIf": "!= NO LED"}'::jsonb),

-- TRAFO Type
(p7_template_id, p7_assembling_id, dropdown_type, 'trafo_type', 'TRAFO', 'ТРАНСФОРМАТОР', 'TRAFO', false, 4,
  '{"options": ["REGULAR", "SLOAN INSIDE SIGN", "BaltLED INSIDE BOX", "SEPARATE", "inside FRAME", "NO TRAFO"], "default": "REGULAR"}'::jsonb,
  '{"column": 2, "visualBox": true, "boxColor": "#F59E0B"}'::jsonb),

-- CABLES Type
(p7_template_id, p7_assembling_id, dropdown_type, 'cables_type', 'CABLES', 'КАБЕЛИ', 'KABEĻI', false, 5,
  '{"options": ["NO CABLES", "WAGO", "230V CABLE", "BLACK CABLE", "CABLES CLICK MINI"], "default": "WAGO"}'::jsonb,
  '{"column": 2, "visualBox": true}'::jsonb),

-- Cable Length (conditional)
(p7_template_id, p7_assembling_id, dropdown_type, 'cable_length', 'Cable Length', 'Длина кабеля', 'Kabeļa garums', false, 6,
  '{"options": ["43m", "48m", "Custom"], "placeholder": "e.g., 43m, 48m"}'::jsonb,
  '{"column": 2, "conditionalOn": "cables_type", "showIf": "!= NO CABLES"}'::jsonb),

-- FRAME assembly option
(p7_template_id, p7_assembling_id, dropdown_type, 'frame_assembly', 'FRAME', 'РАМКА', 'RĀMIS', false, 7,
  '{"options": ["NO FRAME", "FRAME", "inside FRAME", "40mm"], "default": "NO FRAME"}'::jsonb,
  '{"column": 3}'::jsonb),

-- WATERHOLES
(p7_template_id, p7_assembling_id, toggle_type, 'waterholes', 'WATERHOLES', 'ВОДООТВОДЫ', 'ŪDENS CAURUMI', false, 8,
  '{"default": false, "helpText": "Drainage holes for outdoor signs"}'::jsonb,
  '{"column": 4, "visualBox": true, "boxColor": "#10B981"}'::jsonb),

-- Waterholes size (conditional)
(p7_template_id, p7_assembling_id, dropdown_type, 'waterholes_size', 'Waterholes Size', 'Размер отверстий', 'Caurumu izmērs', false, 9,
  '{"options": ["3mm", "5mm", "8mm"], "default": "5mm"}'::jsonb,
  '{"column": 4, "conditionalOn": "waterholes", "showIf": "== true"}'::jsonb),

-- NO WATERHOLES option
(p7_template_id, p7_assembling_id, toggle_type, 'no_waterholes', 'NO WATERHOLES', 'БЕЗ ВОДООТВОДОВ', 'BEZ ŪDENS CAURUMIEM', false, 10,
  '{"default": false}'::jsonb,
  '{"column": 4}'::jsonb),

-- MOUNTING HOLES
(p7_template_id, p7_assembling_id, dropdown_type, 'mounting_holes', 'MOUNTING HOLES', 'МОНТАЖНЫЕ ОТВЕРСТИЯ', 'MONTĀŽAS CAURUMI', false, 11,
  '{"options": ["10-12mm Alu tube 8mm internal diam", "SCREWS ON BACKSIDE", "NO MOUNTING HOLES"], "default": "NO MOUNTING HOLES"}'::jsonb,
  '{"column": 5}'::jsonb),

-- SHABLON (Template)
(p7_template_id, p7_assembling_id, dropdown_type, 'shablon', 'SHABLON', 'ШАБЛОН', 'ŠABLONS', false, 12,
  '{"options": ["SHABLON", "NO SHABLON", "SHABLON e-mail file", "PAPER x2 U-type", "ROOF CONSTRUCTION", "HOOKS see drawing"], "default": "NO SHABLON"}'::jsonb,
  '{"column": 6, "visualBox": true}'::jsonb),

-- WARNING STICKERS
(p7_template_id, p7_assembling_id, dropdown_type, 'warning_stickers', 'WARNING STICKERS', 'ПРЕДУПРЕЖДАЮЩИЕ НАКЛЕЙКИ', 'BRĪDINĀJUMA UZLĪMES', false, 13,
  '{"options": ["ON CABLE PLACES", "NO STICKERS"], "default": "NO STICKERS"}'::jsonb,
  '{"column": 6}'::jsonb),

-- IP Rating
(p7_template_id, p7_assembling_id, dropdown_type, 'ip_rating', 'IP Rating', 'IP класс', 'IP klase', false, 14,
  '{"options": ["IP65 Box", "IP44", "NO IP"], "default": "NO IP"}'::jsonb,
  '{"column": 7, "visualBox": true, "boxColor": "#3B82F6"}'::jsonb),

-- Special Instructions (free text)
(p7_template_id, p7_assembling_id, textarea_type, 'special_instructions', 'Special Instructions', 'Особые указания', 'Īpašas instrukcijas', false, 15,
  '{"rows": 3, "placeholder": "Any special requirements: торцы стекла КРАСИМ, Film from client, etc."}'::jsonb,
  '{"fullWidth": true}'::jsonb);

-- ==========================================
-- SECTION: DELIVERY
-- ==========================================

SELECT id INTO p7_delivery_id FROM profile_sections WHERE name = 'DELIVERY';
DELETE FROM profile_section_fields WHERE profile_template_id = p7_template_id AND section_id = p7_delivery_id;

INSERT INTO profile_section_fields (profile_template_id, section_id, field_type_id, field_key, label_en, label_ru, label_lv, is_required, order_index, config, metadata) VALUES
-- Delivery Date
(p7_template_id, p7_delivery_id, date_type, 'delivery_date', 'Delivery Date', 'Дата доставки', 'Piegādes datums', true, 1,
  '{
    "minDate": "today",
    "highlightDeadlines": true
  }'::jsonb,
  '{"column": 1, "visualBox": true, "boxColor": "#1a1a1a", "boxTextColor": "#fff"}'::jsonb);

RAISE NOTICE 'Profile 7st complete template created successfully with ID: %', p7_template_id;

END $$;
