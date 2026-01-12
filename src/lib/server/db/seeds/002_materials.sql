-- src/lib/server/db/seeds/002_materials_extended.sql
-- Extended material library with Proplastik specifications

-- Clear existing materials if needed
-- TRUNCATE TABLE materials CASCADE;

-- ==========================================
-- PLEXIGLAS® ACRYLIC MATERIALS (Evonik/Röhm)
-- ==========================================

-- PLEXIGLAS XT Series (Extruded)
INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
  ('ACRYLIC_XT', 'PLEXIGLAS_XT_0F00', 'PLEXIGLAS® XT Clear', 'PLEXIGLAS® XT Прозрачный', 'PLEXIGLAS® XT Caurspīdīgs',
   '[1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25]'::jsonb,
   '{"brand": "PLEXIGLAS®", "colorCode": "0F00", "transmittance": "92%", "type": "extruded", "hex": "#FFFFFF", "transparent": true}'::jsonb),

  ('ACRYLIC_XT', 'PLEXIGLAS_XT_WN071', 'PLEXIGLAS® XT White Opal WN071', 'PLEXIGLAS® XT Белый Опал WN071', 'PLEXIGLAS® XT Balts Opāls WN071',
   '[2, 3, 4, 5, 6, 8, 10]'::jsonb,
   '{"brand": "PLEXIGLAS®", "colorCode": "WN071", "transmittance": "30%", "type": "extruded", "hex": "#F5F5F0", "translucent": true}'::jsonb),

  ('ACRYLIC_XT', 'PLEXIGLAS_XT_WN297', 'PLEXIGLAS® XT White WN297', 'PLEXIGLAS® XT Белый WN297', 'PLEXIGLAS® XT Balts WN297',
   '[2, 3, 4, 5, 6, 8, 10]'::jsonb,
   '{"brand": "PLEXIGLAS®", "colorCode": "WN297", "transmittance": "25%", "type": "extruded", "hex": "#FAFAFA"}'::jsonb),

  ('ACRYLIC_XT', 'PLEXIGLAS_XT_WN970', 'PLEXIGLAS® XT White WN970', 'PLEXIGLAS® XT Белый WN970', 'PLEXIGLAS® XT Balts WN970',
   '[2, 3, 4, 5, 6, 8, 10]'::jsonb,
   '{"brand": "PLEXIGLAS®", "colorCode": "WN970", "transmittance": "35%", "type": "extruded", "hex": "#FFFFFF"}'::jsonb),

  ('ACRYLIC_XT', 'PLEXIGLAS_XT_1N870', 'PLEXIGLAS® XT Yellow 1N870', 'PLEXIGLAS® XT Желтый 1N870', 'PLEXIGLAS® XT Dzeltens 1N870',
   '[2, 3, 4, 5, 6, 8, 10]'::jsonb,
   '{"brand": "PLEXIGLAS®", "colorCode": "1N870", "transmittance": "20%", "hex": "#FFD700"}'::jsonb),

  ('ACRYLIC_XT', 'PLEXIGLAS_XT_3N570', 'PLEXIGLAS® XT Red 3N570', 'PLEXIGLAS® XT Красный 3N570', 'PLEXIGLAS® XT Sarkans 3N570',
   '[2, 3, 4, 5, 6, 8, 10]'::jsonb,
   '{"brand": "PLEXIGLAS®", "colorCode": "3N570", "transmittance": "15%", "hex": "#DC143C"}'::jsonb),

  ('ACRYLIC_XT', 'PLEXIGLAS_XT_5N870', 'PLEXIGLAS® XT Blue 5N870', 'PLEXIGLAS® XT Синий 5N870', 'PLEXIGLAS® XT Zils 5N870',
   '[2, 3, 4, 5, 6, 8, 10]'::jsonb,
   '{"brand": "PLEXIGLAS®", "colorCode": "5N870", "transmittance": "18%", "hex": "#0047AB"}'::jsonb),

  ('ACRYLIC_XT', 'PLEXIGLAS_XT_6N570', 'PLEXIGLAS® XT Green 6N570', 'PLEXIGLAS® XT Зеленый 6N570', 'PLEXIGLAS® XT Zaļš 6N570',
   '[2, 3, 4, 5, 6, 8, 10]'::jsonb,
   '{"brand": "PLEXIGLAS®", "colorCode": "6N570", "transmittance": "20%", "hex": "#228B22"}'::jsonb),

  ('ACRYLIC_XT', 'PLEXIGLAS_XT_9N870', 'PLEXIGLAS® XT Black 9N870', 'PLEXIGLAS® XT Черный 9N870', 'PLEXIGLAS® XT Melns 9N870',
   '[2, 3, 4, 5, 6, 8, 10, 12, 15]'::jsonb,
   '{"brand": "PLEXIGLAS®", "colorCode": "9N870", "transmittance": "0%", "hex": "#000000", "opaque": true}'::jsonb),

  ('ACRYLIC_XT', 'PLEXIGLAS_XT_7A670', 'PLEXIGLAS® XT Grey 7A670', 'PLEXIGLAS® XT Серый 7A670', 'PLEXIGLAS® XT Pelēks 7A670',
   '[2, 3, 4, 5, 6, 8, 10]'::jsonb,
   '{"brand": "PLEXIGLAS®", "colorCode": "7A670", "transmittance": "71%", "hex": "#808080"}'::jsonb);

-- PLEXIGLAS GS Series (Cast)
INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
  ('ACRYLIC_GS', 'PLEXIGLAS_GS_WH10', 'PLEXIGLAS® GS White Opaque WH10', 'PLEXIGLAS® GS Белый Непрозрачный WH10', 'PLEXIGLAS® GS Balts Necaurspīdīgs WH10',
   '[3, 4, 5, 6, 8, 10, 12, 15, 20]'::jsonb,
   '{"brand": "PLEXIGLAS®", "colorCode": "WH10", "transmittance": "0%", "type": "cast", "hex": "#FFFFFF", "opaque": true}'::jsonb),

  ('ACRYLIC_GS', 'PLEXIGLAS_GS_WH73', 'PLEXIGLAS® GS White WH73', 'PLEXIGLAS® GS Белый WH73', 'PLEXIGLAS® GS Balts WH73',
   '[3, 4, 5, 6, 8, 10, 12]'::jsonb,
   '{"brand": "PLEXIGLAS®", "colorCode": "WH73", "transmittance": "50%", "type": "cast", "hex": "#FEFEFE"}'::jsonb);

-- PLEXIGLAS LED Series
INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
  ('ACRYLIC_LED', 'PLEXIGLAS_LED_0E010', 'PLEXIGLAS® LED Clear 0E010', 'PLEXIGLAS® LED Прозрачный 0E010', 'PLEXIGLAS® LED Caurspīdīgs 0E010',
   '[2, 3, 4, 5, 6, 8, 10, 12]'::jsonb,
   '{"brand": "PLEXIGLAS®", "colorCode": "0E010", "transmittance": "92%", "type": "extruded", "ledOptimized": true, "hex": "#FFFFFF"}'::jsonb);

-- ==========================================
-- PVC FOAM BOARDS
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
  ('PVC_FOAM', 'PVC_FOAM_WHITE', 'PVC Foam Board White', 'ПВХ Вспененный Белый', 'PVC Putas Balts',
   '[3, 5, 8, 10, 12, 15, 18, 19]'::jsonb,
   '{"brand": "Palight®", "density": "0.45-0.57", "finish": "matte", "hex": "#FFFFFF", "standardSize": "1220x2440mm"}'::jsonb),

  ('PVC_FOAM', 'PVC_FOAM_BLACK', 'PVC Foam Board Black', 'ПВХ Вспененный Черный', 'PVC Putas Melns',
   '[3, 5, 8, 10, 15, 18]'::jsonb,
   '{"brand": "Palight®", "density": "0.50", "finish": "matte", "hex": "#000000"}'::jsonb),

  ('PVC_FOAM', 'PVC_FOAM_RED', 'PVC Foam Board Red', 'ПВХ Вспененный Красный', 'PVC Putas Sarkans',
   '[5, 8, 10, 15, 18]'::jsonb,
   '{"brand": "Palight®", "density": "0.50", "finish": "gloss", "hex": "#DC143C"}'::jsonb),

  ('PVC_FOAM', 'PVC_FOAM_BLUE', 'PVC Foam Board Blue', 'ПВХ Вспененный Синий', 'PVC Putas Zils',
   '[5, 10, 15]'::jsonb,
   '{"brand": "Palight®", "density": "0.50", "finish": "gloss", "hex": "#0047AB"}'::jsonb),

  ('PVC_FOAM', 'PVC_FOAM_GREEN', 'PVC Foam Board Green', 'ПВХ Вспененный Зеленый', 'PVC Putas Zaļš',
   '[5, 10, 15]'::jsonb,
   '{"brand": "Palight®", "density": "0.50", "finish": "gloss", "hex": "#228B22"}'::jsonb),

  ('PVC_FOAM', 'PVC_FOAM_YELLOW', 'PVC Foam Board Yellow', 'ПВХ Вспененный Желтый', 'PVC Putas Dzeltens',
   '[5, 10, 15]'::jsonb,
   '{"brand": "Palight®", "density": "0.50", "finish": "gloss", "hex": "#FFD700"}'::jsonb),

  ('PVC_FOAM', 'PVC_FOAM_GREY', 'PVC Foam Board Grey', 'ПВХ Вспененный Серый', 'PVC Putas Pelēks',
   '[5, 10, 15]'::jsonb,
   '{"brand": "Palight®", "density": "0.50", "finish": "matte", "hex": "#808080"}'::jsonb),

  ('PVC_FOAM', 'FOREX_WHITE', 'Forex Classic White', 'Forex Белый', 'Forex Balts',
   '[3, 5, 10, 19]'::jsonb,
   '{"brand": "Forex®", "density": "0.55", "hex": "#FFFFFF"}'::jsonb),

  ('PVC_FOAM', 'VEKAPLAN_WHITE', 'Vekaplan White', 'Vekaplan Белый', 'Vekaplan Balts',
   '[3, 5, 8, 10, 19]'::jsonb,
   '{"brand": "Vekaplan®", "density": "0.50", "hex": "#FFFFFF"}'::jsonb);

-- ==========================================
-- ALUMINUM SHEETS & PROFILES
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
  ('ALU_SHEET', 'ALU_MILL_1_0', 'Aluminum Sheet 1.0mm Mill', 'Алюминий 1.0мм', 'Alumīnijs 1.0mm',
   '[1.0]'::jsonb,
   '{"alloy": "AlMg3", "finish": "mill", "hex": "#C0C0C0", "standardSize": "2000x1000mm"}'::jsonb),

  ('ALU_SHEET', 'ALU_MILL_1_2', 'Aluminum Sheet 1.2mm Mill', 'Алюминий 1.2мм', 'Alumīnijs 1.2mm',
   '[1.2]'::jsonb,
   '{"alloy": "AlMg3", "finish": "mill", "hex": "#C0C0C0"}'::jsonb),

  ('ALU_SHEET', 'ALU_MILL_1_3', 'Aluminum Sheet 1.3mm Mill', 'Алюминий 1.3мм', 'Alumīnijs 1.3mm',
   '[1.3]'::jsonb,
   '{"alloy": "AlMg3", "finish": "mill", "hex": "#C0C0C0"}'::jsonb),

  ('ALU_SHEET', 'ALU_MILL_1_5', 'Aluminum Sheet 1.5mm Mill', 'Алюминий 1.5мм', 'Alumīnijs 1.5mm',
   '[1.5]'::jsonb,
   '{"alloy": "AlMg3", "finish": "mill", "hex": "#C0C0C0"}'::jsonb),

  ('ALU_SHEET', 'ALU_MILL_2_0', 'Aluminum Sheet 2.0mm Mill', 'Алюминий 2.0мм', 'Alumīnijs 2.0mm',
   '[2.0]'::jsonb,
   '{"alloy": "AlMg3", "finish": "mill", "hex": "#C0C0C0"}'::jsonb),

  ('ALU_SHEET', 'ALU_MILL_3_0', 'Aluminum Sheet 3.0mm Mill', 'Алюминий 3.0мм', 'Alumīnijs 3.0mm',
   '[3.0]'::jsonb,
   '{"alloy": "AlMg3", "finish": "mill", "hex": "#C0C0C0"}'::jsonb),

  ('ALU_SHEET', 'ALU_BRUSHED_1_5', 'Aluminum Sheet 1.5mm Brushed', 'Алюминий 1.5мм Матовый', 'Alumīnijs 1.5mm Matēts',
   '[1.5]'::jsonb,
   '{"alloy": "AlMg3", "finish": "brushed_horizontal", "hex": "#B8B8B8", "decorative": true}'::jsonb),

  ('ALU_SHEET', 'ALU_BRUSHED_2_0', 'Aluminum Sheet 2.0mm Brushed', 'Алюминий 2.0мм Матовый', 'Alumīnijs 2.0mm Matēts',
   '[2.0]'::jsonb,
   '{"alloy": "AlMg3", "finish": "brushed_horizontal", "hex": "#B8B8B8"}'::jsonb),

  ('ALU_SHEET', 'ALU_ANODIZED_NATURAL_1_5', 'Aluminum Sheet 1.5mm Anodized Natural', 'Алюминий 1.5мм Анодированный', 'Alumīnijs 1.5mm Anodizēts',
   '[1.5]'::jsonb,
   '{"alloy": "AlMg3", "finish": "anodized", "hex": "#D3D3D3", "premium": true}'::jsonb),

  ('ALU_SHEET', 'ALU_ANODIZED_BLACK_1_5', 'Aluminum Sheet 1.5mm Anodized Black', 'Алюминий 1.5мм Анодированный Черный', 'Alumīnijs 1.5mm Anodizēts Melns',
   '[1.5]'::jsonb,
   '{"alloy": "AlMg3", "finish": "anodized", "hex": "#1C1C1C", "premium": true}'::jsonb);

-- Aluminum Profiles/Tubes
INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
  ('ALU_PROFILE', 'ALU_TUBE_SQUARE_10', 'Aluminum Square Tube 10x10mm', 'Алюминиевая Труба 10x10мм', 'Alumīnija Caurule 10x10mm',
   '[]'::jsonb,
   '{"type": "tube", "dimensions": "10x10mm", "wallThickness": 1.0, "hex": "#C0C0C0", "standardLength": "6000mm"}'::jsonb),

  ('ALU_PROFILE', 'ALU_TUBE_SQUARE_15', 'Aluminum Square Tube 15x15mm', 'Алюминиевая Труба 15x15мм', 'Alumīnija Caurule 15x15mm',
   '[]'::jsonb,
   '{"type": "tube", "dimensions": "15x15mm", "wallThickness": 1.5, "hex": "#C0C0C0"}'::jsonb),

  ('ALU_PROFILE', 'ALU_TUBE_SQUARE_20', 'Aluminum Square Tube 20x20mm', 'Алюминиевая Труба 20x20мм', 'Alumīnija Caurule 20x20mm',
   '[]'::jsonb,
   '{"type": "tube", "dimensions": "20x20mm", "wallThickness": 1.5, "hex": "#C0C0C0"}'::jsonb),

  ('ALU_PROFILE', 'ALU_TUBE_ROUND_8', 'Aluminum Round Tube 8mm', 'Алюминиевая Круглая Труба 8мм', 'Alumīnija Apaļa Caurule 8mm',
   '[]'::jsonb,
   '{"type": "tube", "diameter": 8, "wallThickness": 1.0, "hex": "#C0C0C0"}'::jsonb),

  ('ALU_PROFILE', 'ALU_TUBE_ROUND_10', 'Aluminum Round Tube 10mm', 'Алюминиевая Круглая Труба 10мм', 'Alumīnija Apaļa Caurule 10mm',
   '[]'::jsonb,
   '{"type": "tube", "diameter": 10, "wallThickness": 1.0, "hex": "#C0C0C0"}'::jsonb);

-- Aluminum Composite (Dibond)
INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
  ('ALU_COMPOSITE', 'DIBOND_WHITE_3', 'Dibond White 3mm', 'Дибонд Белый 3мм', 'Dibond Balts 3mm',
   '[3]'::jsonb,
   '{"brand": "Dibond®", "construction": "ALU-PE-ALU", "finish": "white_coated", "hex": "#FFFFFF", "standardSize": "2440x1220mm"}'::jsonb),

  ('ALU_COMPOSITE', 'DIBOND_SILVER_3', 'Dibond Silver Brushed 3mm', 'Дибонд Серебро 3мм', 'Dibond Sudrabs 3mm',
   '[3]'::jsonb,
   '{"brand": "Dibond®", "construction": "ALU-PE-ALU", "finish": "brushed_silver", "hex": "#C0C0C0"}'::jsonb);
