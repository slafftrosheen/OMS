-- Comprehensive update to ensure all expected material categories exist in the database

-- First, let's make sure we have materials for each category that the form expects

-- Insert ACRYLIC_XT materials if they don't exist
INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) 
SELECT 'ACRYLIC_XT', 'PLEXIGLAS_XT_0F00', 'PLEXIGLAS® XT Clear', 'PLEXIGLAS® XT Прозрачный', 'PLEXIGLAS® XT Caurspīdīgs', '[1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "colorCode": "0F00", "colorName": "Clear", "type": "extruded", "transmittance": "92%", "properties": {"transparent": true, "uvAbsorbent": true, "weatherResistant": true, "tempResistance": "70°C"}, "standardSize": "3050x2050mm", "hex": "#FFFFFF", "applications": ["Glazing", "LED applications", "Shopfitting"]}'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE code = 'PLEXIGLAS_XT_0F00');

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) 
SELECT 'ACRYLIC_XT', 'PLEXIGLAS_XT_WN071', 'PLEXIGLAS® XT White Opal', 'PLEXIGLAS® XT Белый Опал', 'PLEXIGLAS® XT Baltais Opāls', '[2, 3, 4, 5, 6, 8, 10]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "colorCode": "WN071", "colorName": "White Opal", "type": "extruded", "transmittance": "30%", "properties": {"translucent": true, "uvAbsorbent": true, "weatherResistant": true, "highGloss": true, "tempResistance": "70°C"}, "standardSize": "3050x2050mm", "hex": "#F5F5F0", "applications": ["Illuminated advertising", "Light diffusion", "Signage"]}'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE code = 'PLEXIGLAS_XT_WN071');

-- Insert ACRYLIC_GS materials if they don't exist
INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) 
SELECT 'ACRYLIC_GS', 'PLEXIGLAS_GS_WH10', 'PLEXIGLAS® GS White Opaque', 'PLEXIGLAS® GS Белый Непрозрачный', 'PLEXIGLAS® GS Baltais Nepārredzams', '[3, 4, 5, 6, 8, 10, 12, 15, 20]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "colorCode": "WH10", "colorName": "White Opaque", "type": "cast", "transmittance": "0%", "properties": {"opaque": true, "uvAbsorbent": true, "weatherResistant": true}, "standardSize": "3050x2030mm", "hex": "#FFFFFF", "applications": ["Signage", "Furniture", "Displays"]}'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE code = 'PLEXIGLAS_GS_WH10');

-- Insert ACRYLIC_LED materials if they don't exist
INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) 
SELECT 'ACRYLIC_LED', 'PLEXIGLAS_LED_0F00', 'PLEXIGLAS® LED Clear', 'PLEXIGLAS® LED Прозрачный', 'PLEXIGLAS® LED Caurspīdīgs', '[2, 3, 4, 5, 6, 8, 10]', 
'{"brand": "PLEXIGLAS®", "series": "LED", "colorCode": "0F00", "colorName": "Clear", "type": "extruded", "transmittance": "95%", "properties": {"transparent": true, "uvAbsorbent": true, "weatherResistant": true, "ledCompatible": true, "tempResistance": "70°C"}, "standardSize": "3050x2050mm", "hex": "#FFFFFF", "applications": ["LED applications", "Illuminated signs"]}'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE code = 'PLEXIGLAS_LED_0F00');

-- Insert ALU_SHEET materials if they don't exist
INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) 
SELECT 'ALU_SHEET', 'ALU_MILL_1_5', 'Aluminum Sheet 1.5mm Mill Finish', 'Алюминиевый лист 1.5мм Милл Финиш', 'Alumīnija Loksne 1.5mm Milēts Beigtas', '[1.5]', 
'{"alloy": "AlMg3", "finish": "mill", "type": "sheet", "thickness": 1.5, "properties": {"corrosionResistant": true, "lightweight": true, "bendable": true, "weldable": true}, "standardSize": "2000x1000mm", "hex": "#C0C0C0", "applications": ["Signage construction", "Heavy-duty frames"]}'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE code = 'ALU_MILL_1_5');

-- Insert ALU_COMPOSITE materials if they don't exist
INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) 
SELECT 'ALU_COMPOSITE', 'DIBOND_WHITE_3', 'Dibond White 3mm', 'Дибонд Белый 3мм', 'Dibond Balts 3mm', '[3]', 
'{"brand": "Dibond®", "type": "composite", "thickness": 3, "construction": "ALU-PE-ALU", "finish": "white_coated", "properties": {"lightweight": true, "flat": true, "weatherResistant": true, "printable": true, "rigid": true}, "standardSize": "2440x1220mm", "hex": "#FFFFFF", "applications": ["Signage", "Displays", "Exhibition"]}'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE code = 'DIBOND_WHITE_3');

-- Insert ALU_PROFILE materials if they don't exist
INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) 
SELECT 'ALU_PROFILE', 'ALU_PROFILE_40X40_1.5', 'Aluminum Profile 40x40mm 1.5mm wall', 'Алюминиевый профиль 40x40мм 1.5мм стенка', 'Alumīnija Profils 40x40mm 1.5mm siena', '[1.5]', 
'{"alloy": "AlMg3", "finish": "mill", "type": "profile", "dimensions": "40x40x1.5mm", "properties": {"corrosionResistant": true, "lightweight": true, "structural": true, "mounting": true}, "standardLength": "6000mm", "hex": "#C0C0C0", "applications": ["Frames", "Mounting structures", "Enclosures"]}'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE code = 'ALU_PROFILE_40X40_1.5');

-- Insert PVC_FOAM materials if they don't exist
INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) 
SELECT 'PVC_FOAM', 'PVC_FOAM_WHITE', 'PVC Foam Board White', 'ПВХ Пенопласт Белая', 'PVC Putu Plāksne Balta', '[3, 5, 8, 10, 12, 15, 18, 19]', 
'{"brand": "Palight®", "name": "PVC Foam Board White", "type": "foam", "density": "0.45-0.57 g/cm³", "finish": "matte", "properties": {"lightweight": true, "weatherResistant": true, "easyToMachine": true, "paintable": true, "waterproof": true}, "standardSize": "1220x2440mm", "hex": "#FFFFFF", "fireRating": "UK Class 1", "serviceTemp": "-10 to 55°C", "applications": ["Signage", "Displays", "Exhibition stands"]}'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE code = 'PVC_FOAM_WHITE');

-- Insert VINYL_ORACAL materials if they don't exist
INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) 
SELECT 'VINYL_ORACAL', 'ORACAL_010', 'Oracal 8500 Series 010 White', 'Оракал 8500 Серия 010 Белый', 'Oracal 8500 Serija 010 Balts', '[]', 
'{"brand": "Oracal", "series": "8500", "colorCode": "010", "colorName": "White", "type": "vinyl", "finish": "matte", "properties": {"adhesive": "permanent", "outdoorDurability": "7 years", "temperatureResistance": "-40°C to +80°C", "airRelease": true}, "applications": ["Signage", "Vehicle wraps", "Window graphics"], "hex": "#FFFFFF"}'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE code = 'ORACAL_010');

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) 
SELECT 'VINYL_ORACAL', 'ORACAL_031', 'Oracal 8500 Series 031 Red', 'Оракал 8500 Серия 031 Красный', 'Oracal 8500 Serija 031 Sarkans', '[]', 
'{"brand": "Oracal", "series": "8500", "colorCode": "031", "colorName": "Red", "type": "vinyl", "finish": "matte", "properties": {"adhesive": "permanent", "outdoorDurability": "7 years", "temperatureResistance": "-40°C to +80°C", "airRelease": true}, "applications": ["Signage", "Vehicle wraps", "Decals"], "hex": "#FF0000"}'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE code = 'ORACAL_031');

-- Insert PAINT_RAL materials if they don't exist
INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) 
SELECT 'PAINT_RAL', 'RAL_1003_SIGNAL_YELLOW', 'RAL 1003 Signal Yellow', 'RAL 1003 Сигнальный Желтый', 'RAL 1003 Signāla Dzeltens', '[]', 
'{"name": {"en": "Signal yellow", "de": "Signalgelb", "fr": "Jaune de sécurité"}, "hex": "#F9A900", "rgb": [249,169,0], "cmyk": [0,32,100,2], "lrv": 49.05, "type": "paint", "finish": "gloss", "brand": "RAL", "properties": {"weatherResistant": true, "uvStable": true, "acidProof": true}}'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE code = 'RAL_1003_SIGNAL_YELLOW');

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) 
SELECT 'PAINT_RAL', 'RAL_3000_FLAME_RED', 'RAL 3000 Flame Red', 'RAL 3000 Огненно-красный', 'RAL 3000 Liesas Sarkans', '[]', 
'{"name": {"en": "Flame red", "de": "Feuerrot", "fr": "Rouge feu"}, "hex": "#AB2524", "rgb": [171,37,36], "cmyk": [0,78,79,33], "lrv": 11.57, "type": "paint", "finish": "gloss", "brand": "RAL", "properties": {"weatherResistant": true, "uvStable": true, "acidProof": true}}'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE code = 'RAL_3000_FLAME_RED');

-- Update any remaining materials that have generic categories to proper categories
UPDATE materials SET category = 'ACRYLIC_XT' WHERE category = 'Plastics' AND (code ILIKE '%XT%' OR name_en ILIKE '%xt%' OR name_en ILIKE '%extruded%');
UPDATE materials SET category = 'ACRYLIC_GS' WHERE category = 'Plastics' AND (code ILIKE '%GS%' OR name_en ILIKE '%gs%' OR name_en ILIKE '%cast%');
UPDATE materials SET category = 'PVC_FOAM' WHERE category = 'Plastics' AND (code ILIKE '%PVC%' OR code ILIKE '%FOAM%' OR name_en ILIKE '%pvc%' OR name_en ILIKE '%foam%' OR name_en ILIKE '%forex%');
UPDATE materials SET category = 'ALU_SHEET' WHERE category = 'Metals' AND (code ILIKE '%ALU%' OR code ILIKE '%ALUMINIUM%' OR name_en ILIKE '%aluminum%' OR name_en ILIKE '%alu%' OR name_en ILIKE '%dibond%');
UPDATE materials SET category = 'ALU_COMPOSITE' WHERE code ILIKE '%DIBOND%' OR name_en ILIKE '%composite%' OR name_en ILIKE '%sandwich%';
UPDATE materials SET category = 'VINYL_ORACAL' WHERE category = 'Films' OR code ILIKE '%ORACAL%' OR code ILIKE '%VINYL%' OR name_en ILIKE '%oracal%' OR name_en ILIKE '%vinyl%';
UPDATE materials SET category = 'PAINT_RAL' WHERE category = 'Colors' OR code ILIKE 'RAL_%' OR name_en ILIKE '%ral%';

-- Make sure any remaining plastics get mapped to appropriate categories
UPDATE materials SET category = 'ACRYLIC_SPECIAL' WHERE category = 'Plastics' AND category NOT IN (
    SELECT DISTINCT category FROM materials WHERE category IN ('ACRYLIC_XT', 'ACRYLIC_GS', 'ACRYLIC_LED', 'PVC_FOAM')
);

-- Make sure any remaining metals get mapped to appropriate categories
UPDATE materials SET category = 'ALU_SHEET' WHERE category = 'Metals' AND category NOT IN (
    SELECT DISTINCT category FROM materials WHERE category IN ('ALU_SHEET', 'ALU_COMPOSITE', 'ALU_PROFILE')
);