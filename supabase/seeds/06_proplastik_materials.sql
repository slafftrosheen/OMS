-- Proplastik Material Catalogue Import
-- Generated based on standard stock for Proplastik.lv
-- Categories: PMMA (Acrylic), PVC (Foam/Hard), Polycarbonate, PET-G, HIPS, ACP

INSERT INTO public.materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata)
VALUES

-- ==========================================
-- 1. PLEXIGLAS® / PMMA (Acrylic) - EXTRUDED (XT)
-- ==========================================

-- XT Clear
('Plastics', 'PMMA_XT_CLEAR', 'PLEXIGLAS® XT Clear', 'PLEXIGLAS® XT Прозрачный', 'PLEXIGLAS® XT Caurspīdīgs', '[1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25]',
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "0F00", "finish": "gloss", "transmittance": "92%", "standardSize": "3050x2050mm", "hex": "#FFFFFF", "properties": {"uvResistant": true, "outdoor": true, "thermoformable": true}, "applications": ["Glazing", "Displays", "POS"]}'),

-- XT Opal (Lightbox)
('Plastics', 'PMMA_XT_OPAL', 'PLEXIGLAS® XT Opal White', 'PLEXIGLAS® XT Опал (Молочный)', 'PLEXIGLAS® XT Opāls (Piena)', '[2, 3, 4, 5, 6, 8, 10]',
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "WN297", "finish": "gloss", "transmittance": "30%", "standardSize": "3050x2050mm", "hex": "#F0F0F0", "properties": {"lightDiffusing": true, "uvResistant": true}, "applications": ["Lightboxes", "Illuminated Signs"]}'),

-- XT Black
('Plastics', 'PMMA_XT_BLACK', 'PLEXIGLAS® XT Black Gloss', 'PLEXIGLAS® XT Черный Глянцевый', 'PLEXIGLAS® XT Melns Glancēts', '[2, 3, 4, 5, 6, 8, 10]',
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "9N870", "finish": "gloss", "transmittance": "0%", "standardSize": "3050x2050mm", "hex": "#000000", "properties": {"opaque": true, "uvResistant": true}, "applications": ["Design elements", "Signage"]}'),

-- XT Colors (Basic Selection)
('Plastics', 'PMMA_XT_RED', 'PLEXIGLAS® XT Red', 'PLEXIGLAS® XT Красный', 'PLEXIGLAS® XT Sarkans', '[3, 5]',
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "3N570", "finish": "gloss", "transmittance": "15%", "standardSize": "3050x2050mm", "hex": "#FF0000", "properties": {"translucent": true}, "applications": ["Signage", "Decoration"]}'),

('Plastics', 'PMMA_XT_BLUE', 'PLEXIGLAS® XT Blue', 'PLEXIGLAS® XT Синий', 'PLEXIGLAS® XT Zils', '[3, 5]',
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "5N870", "finish": "gloss", "transmittance": "15%", "standardSize": "3050x2050mm", "hex": "#0000FF", "properties": {"translucent": true}, "applications": ["Signage", "Decoration"]}'),

('Plastics', 'PMMA_XT_GREEN', 'PLEXIGLAS® XT Green', 'PLEXIGLAS® XT Зеленый', 'PLEXIGLAS® XT Zaļš', '[3, 5]',
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "6N870", "finish": "gloss", "transmittance": "15%", "standardSize": "3050x2050mm", "hex": "#008000", "properties": {"translucent": true}, "applications": ["Signage", "Decoration"]}'),

-- XT Mirror
('Plastics', 'PMMA_XT_MIRROR', 'Acrylic Mirror Silver', 'Акриловое Зеркало Серебро', 'Akrila Spogulis Sudrabs', '[2, 3]',
'{"brand": "Generic", "series": "Mirror", "finish": "mirror", "standardSize": "3050x2050mm", "hex": "#C0C0C0", "properties": {"reflective": true, "breakResistant": true, "indoor": true}, "applications": ["Interior design", "Mirrors", "Gyms"]}'),

('Plastics', 'PMMA_XT_MIRROR_GOLD', 'Acrylic Mirror Gold', 'Акриловое Зеркало Золото', 'Akrila Spogulis Zelts', '[3]',
'{"brand": "Generic", "series": "Mirror", "finish": "mirror", "standardSize": "3050x2050mm", "hex": "#FFD700", "properties": {"reflective": true, "breakResistant": true, "indoor": true}, "applications": ["Decoration", "Design"]}'),

-- ==========================================
-- 2. PLEXIGLAS® / PMMA (Acrylic) - CAST (GS)
-- ==========================================

-- GS Clear
('Plastics', 'PMMA_GS_CLEAR', 'PLEXIGLAS® GS Clear (Cast)', 'PLEXIGLAS® GS Прозрачный (Литой)', 'PLEXIGLAS® GS Caurspīdīgs (Liets)', '[3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]',
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "0F00", "finish": "gloss", "transmittance": "92%", "standardSize": "3050x2030mm", "hex": "#FFFFFF", "properties": {"highQuality": true, "easyMachining": true, "chemicalResistant": true}, "applications": ["Aquariums", "Furniture", "Awards"]}'),

-- GS Satinice (Frosted)
('Plastics', 'PMMA_GS_SATIN', 'PLEXIGLAS® Satinice Clear', 'PLEXIGLAS® Satinice Матовый', 'PLEXIGLAS® Satinice Matēts', '[3, 4, 5, 6, 8, 10]',
'{"brand": "PLEXIGLAS®", "series": "Satinice", "code": "0F00 DC", "finish": "matte/frosted", "transmittance": "90%", "standardSize": "3050x2030mm", "hex": "#E0E0E0", "properties": {"fingerprintResistant": true, "lightDiffusing": true, "elegant": true}, "applications": ["Lighting", "Furniture", "Partitions"]}'),


-- ==========================================
-- 3. PVC FOAM (Putu PVC)
-- ==========================================

-- White Foam
('Plastics', 'PVC_FOAM_WHITE', 'PVC Foam White', 'ПВХ Вспененный Белый', 'PVC Putu Balts', '[1, 2, 3, 4, 5, 6, 8, 10, 19]',
'{"brand": "Ongrofoam", "series": "Free Foam", "finish": "matte", "density": "0.55 g/cm3", "standardSize": "3050x2030mm", "hex": "#FFFFFF", "properties": {"lightweight": true, "printable": true, "outdoor": true}, "applications": ["Advertising boards", "Exhibition stands"]}'),

-- Black Foam
('Plastics', 'PVC_FOAM_BLACK', 'PVC Foam Black', 'ПВХ Вспененный Черный', 'PVC Putu Melns', '[3, 5, 6, 10]',
'{"brand": "Ongrofoam", "series": "Color", "finish": "matte", "density": "0.55 g/cm3", "standardSize": "3050x2030mm", "hex": "#1A1A1A", "properties": {"lightweight": true, "colorFast": true}, "applications": ["Design", "Displays"]}'),

-- Colored Foam
('Plastics', 'PVC_FOAM_GREY', 'PVC Foam Grey', 'ПВХ Вспененный Серый', 'PVC Putu Pelēks', '[3, 5]',
'{"brand": "Ongrofoam", "series": "Color", "finish": "matte", "standardSize": "3050x2030mm", "hex": "#808080", "properties": {"lightweight": true}, "applications": ["Signage"]}'),

('Plastics', 'PVC_FOAM_RED', 'PVC Foam Red', 'ПВХ Вспененный Красный', 'PVC Putu Sarkans', '[3, 5]',
'{"brand": "Ongrofoam", "series": "Color", "finish": "matte", "standardSize": "3050x2030mm", "hex": "#CC0000", "properties": {"lightweight": true}, "applications": ["Signage"]}'),

('Plastics', 'PVC_FOAM_YELLOW', 'PVC Foam Yellow', 'ПВХ Вспененный Желтый', 'PVC Putu Dzeltens', '[3, 5]',
'{"brand": "Ongrofoam", "series": "Color", "finish": "matte", "standardSize": "3050x2030mm", "hex": "#FFD700", "properties": {"lightweight": true}, "applications": ["Signage"]}'),


-- ==========================================
-- 4. PVC HARD / RIGID (Cieto PVC)
-- ==========================================

-- Hard Grey
('Plastics', 'PVC_HARD_GREY', 'Rigid PVC Grey', 'ПВХ Жесткий Серый', 'PVC Cietais Pelēks', '[1, 2, 3, 4, 5, 6, 8, 10, 15, 20]',
'{"brand": "Generic", "series": "Industrial", "finish": "smooth", "standardSize": "2000x1000mm", "hex": "#707070", "properties": {"chemicalResistant": true, "flameRetardant": true, "impactResistant": true}, "applications": ["Chemical tanks", "Machine guards", "Industrial"]}'),

-- Hard White
('Plastics', 'PVC_HARD_WHITE', 'Rigid PVC White', 'ПВХ Жесткий Белый', 'PVC Cietais Balts', '[1, 1.5, 2, 3]',
'{"brand": "Generic", "series": "Print", "finish": "gloss/matte", "standardSize": "3050x2050mm", "hex": "#FFFFFF", "properties": {"printable": true, "tough": true}, "applications": ["Cards", "Tags", "Displays"]}'),

-- Hard Transparent
('Plastics', 'PVC_HARD_CLEAR', 'Rigid PVC Clear', 'ПВХ Жесткий Прозрачный', 'PVC Cietais Caurspīdīgs', '[0.5, 0.7, 1, 1.5, 2, 3]',
'{"brand": "Generic", "series": "Clear", "finish": "gloss", "transmittance": "88%", "standardSize": "2000x1000mm", "hex": "#FFFFFF", "properties": {"transparent": true, "impactResistant": true}, "applications": ["Protective covers", "Glazing"]}'),


-- ==========================================
-- 5. POLYCARBONATE - MONOLITHIC (Solid)
-- ==========================================

-- Mono Clear
('Plastics', 'PC_MONO_CLEAR', 'Polycarbonate Solid Clear', 'Поликарбонат Монолитный Прозрачный', 'Polikarbonāts Monolītais Caurspīdīgs', '[2, 3, 4, 5, 6, 8, 10, 12]',
'{"brand": "Marlon/Makrolon", "series": "FSX", "finish": "gloss", "transmittance": "89%", "standardSize": "3050x2050mm", "hex": "#FFFFFF", "properties": {"unbreakable": true, "uvProtected": true, "fireRated": true}, "applications": ["Security glazing", "Machine guards", "Visors"]}'),

-- Mono Bronze
('Plastics', 'PC_MONO_BRONZE', 'Polycarbonate Solid Bronze', 'Поликарбонат Монолитный Бронза', 'Polikarbonāts Monolītais Bronza', '[3, 4, 5, 6, 8]',
'{"brand": "Marlon/Makrolon", "series": "FSX", "finish": "gloss", "transmittance": "50%", "standardSize": "3050x2050mm", "hex": "#CD7F32", "properties": {"unbreakable": true, "uvProtected": true, "solarControl": true}, "applications": ["Roofing", "Shelters"]}'),

-- Mono Opal
('Plastics', 'PC_MONO_OPAL', 'Polycarbonate Solid Opal', 'Поликарбонат Монолитный Опал', 'Polikarbonāts Monolītais Opāls', '[3, 4, 5]',
'{"brand": "Marlon", "series": "FSX", "finish": "gloss", "transmittance": "30%", "standardSize": "3050x2050mm", "hex": "#F5F5F0", "properties": {"unbreakable": true, "lightDiffusing": true}, "applications": ["Lightboxes", "Vandal proof signage"]}'),


-- ==========================================
-- 6. POLYCARBONATE - MULTI-WALL (Cellular/Šūnu)
-- ==========================================

-- Multi Clear
('Plastics', 'PC_MULTI_CLEAR', 'Polycarbonate Multi-wall Clear', 'Поликарбонат Сотовый Прозрачный', 'Polikarbonāts Šūnu Caurspīdīgs', '[4, 6, 10, 16, 20, 25, 32]',
'{"brand": "Marlon", "series": "ST", "finish": "cellular", "structure": "Twin/Multi-wall", "standardSize": "2100x6000mm", "hex": "#FFFFFF", "properties": {"insulating": true, "lightweight": true, "uvProtected": true}, "applications": ["Greenhouses", "Carports", "Roofing"]}'),

-- Multi Bronze
('Plastics', 'PC_MULTI_BRONZE', 'Polycarbonate Multi-wall Bronze', 'Поликарбонат Сотовый Бронза', 'Polikarbonāts Šūnu Bronza', '[4, 6, 10, 16]',
'{"brand": "Marlon", "series": "ST", "finish": "cellular", "structure": "Twin/Multi-wall", "standardSize": "2100x6000mm", "hex": "#CD7F32", "properties": {"insulating": true, "solarControl": true}, "applications": ["Canopies", "Terrace roofs"]}'),

-- Multi Opal
('Plastics', 'PC_MULTI_OPAL', 'Polycarbonate Multi-wall Opal', 'Поликарбонат Сотовый Опал', 'Polikarbonāts Šūnu Opāls', '[10, 16, 25]',
'{"brand": "Marlon", "series": "ST", "finish": "cellular", "structure": "Multi-wall", "standardSize": "2100x6000mm", "hex": "#F5F5F0", "properties": {"insulating": true, "lightDiffusing": true}, "applications": ["Industrial roofing", "Light walls"]}'),


-- ==========================================
-- 7. PET-G & A-PET (Polyester)
-- ==========================================

-- PET-G Clear
('Plastics', 'PETG_CLEAR', 'PET-G Clear', 'PET-G Прозрачный', 'PET-G Caurspīdīgs', '[0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8]',
'{"brand": "VIVAK", "series": "Standard", "finish": "gloss", "transmittance": "90%", "standardSize": "2050x1250mm", "hex": "#FFFFFF", "properties": {"foodSafe": true, "easyThermoforming": true, "impactResistant": true}, "applications": ["Displays", "Medical packaging", "Visors"]}'),

-- A-PET Antireflex
('Plastics', 'APET_ANTIREFLEX', 'A-PET Antireflex', 'A-PET Антибликовый', 'A-PET Antirefleksais', '[0.5, 0.7, 1]',
'{"brand": "AXPET", "series": "AR", "finish": "matte/gloss", "standardSize": "2050x1250mm", "hex": "#FFFFFF", "properties": {"antiGlare": true, "tough": true}, "applications": ["Poster protection", "Frame covers"]}'),


-- ==========================================
-- 8. POLYSTYRENE (HIPS)
-- ==========================================

-- HIPS White
('Plastics', 'HIPS_WHITE', 'HIPS White (Matte/Gloss)', 'Полистирол Белый', 'Polistirols Balts (HIPS)', '[1, 1.5, 2, 3, 4, 5]',
'{"brand": "Generic", "series": "Impact", "finish": "matte/gloss", "standardSize": "2000x1000mm", "hex": "#FFFFFF", "properties": {"easyVacuumForming": true, "lowCost": true, "printable": true}, "applications": ["POS Displays", "Vacuum forming", "Tags"]}'),

-- HIPS Black
('Plastics', 'HIPS_BLACK', 'HIPS Black', 'Полистирол Черный', 'Polistirols Melns (HIPS)', '[1, 2, 3]',
'{"brand": "Generic", "series": "Impact", "finish": "matte/gloss", "standardSize": "2000x1000mm", "hex": "#000000", "properties": {"opaque": true, "easyVacuumForming": true}, "applications": ["Displays", "Backing"]}'),

-- HIPS Mirror
('Plastics', 'HIPS_MIRROR', 'HIPS Mirror Silver', 'Полистирол Зеркальный', 'Polistirols Spogulis', '[1, 2]',
'{"brand": "Generic", "series": "Mirror", "finish": "mirror", "standardSize": "2000x1000mm", "hex": "#C0C0C0", "properties": {"reflective": true, "decorative": true, "notOutdoor": true}, "applications": ["Indoor decoration", "Toppers"]}'),


-- ==========================================
-- 9. ALUMINIUM COMPOSITE (ACP/Dibond)
-- ==========================================

-- ACP White
('Plastics', 'ACP_WHITE', 'ACP White/White', 'Алюминиевый Композит Белый', 'Alumīnija Kompozīts Balts', '[2, 3, 4]',
'{"brand": "DIBOND/DILITE", "series": "Decor", "finish": "matte/gloss", "aluminumThickness": "0.3mm", "standardSize": "3050x1500mm", "hex": "#FFFFFF", "properties": {"rigid": true, "outdoor": true, "printable": true}, "applications": ["Signage", "Facades", "Hoarding"]}'),

-- ACP Brushed
('Plastics', 'ACP_BRUSHED', 'ACP Butler Finish (Brushed)', 'Алюминиевый Композит Царапанный', 'Alumīnija Kompozīts Matēts (Slīpēts)', '[3]',
'{"brand": "DIBOND", "series": "Butler", "finish": "brushed", "standardSize": "3050x1500mm", "hex": "#A0A0A0", "properties": {"decorative": true, "premiumLook": true, "outdoor": true}, "applications": ["Interior design", "High-end signage"]}'),

-- ACP Colors
('Plastics', 'ACP_BLACK', 'ACP Black/Black', 'Алюминиевый Композит Черный', 'Alumīnija Kompozīts Melns', '[3]',
'{"brand": "DIBOND", "series": "Color", "finish": "matte/gloss", "standardSize": "3050x1500mm", "hex": "#000000", "properties": {"rigid": true, "outdoor": true}, "applications": ["Signage", "Facades"]}');
