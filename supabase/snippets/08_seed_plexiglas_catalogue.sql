-- Plexiglas XT and GS Material Catalogue Import
-- Generated based on manufacturer specifications (Röhm/Thyssenkrupp)
-- Categories: PMMA (Acrylic) - Extruded (XT) and Cast (GS)

INSERT INTO public.materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata)
VALUES 

-- ==========================================
-- 1. PLEXIGLAS® XT (Extruded)
-- ==========================================

-- XT Clear
('Plastics', 'PMMA_XT_CLEAR_0A000', 'PLEXIGLAS® XT Clear 0A000', 'PLEXIGLAS® XT Прозрачный 0A000', 'PLEXIGLAS® XT Caurspīdīgs 0A000', '[1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "0A000", "finish": "gloss", "transmittance": "92%", "standardSize": "3050x2050mm", "hex": "#FFFFFF", "properties": {"uvResistant": true, "outdoor": true, "thermoformable": true, "highTransparency": true}, "applications": ["Glazing", "Displays", "POS", "Industrial components"]}'),

-- XT Opal (White) - Various Transmissions
('Plastics', 'PMMA_XT_OPAL_WN297', 'PLEXIGLAS® XT Opal White WN297 (30%)', 'PLEXIGLAS® XT Опал WN297 (30%)', 'PLEXIGLAS® XT Opāls WN297 (30%)', '[2, 3, 4, 5, 6, 8, 10]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "WN297", "finish": "gloss", "transmittance": "30%", "standardSize": "3050x2050mm", "hex": "#F0F0F0", "properties": {"lightDiffusing": true, "uvResistant": true, "ledOptimized": true}, "applications": ["Lightboxes", "Illuminated Signs", "Lighting covers"]}'),

('Plastics', 'PMMA_XT_OPAL_WN071', 'PLEXIGLAS® XT Opal White WN071 (70%)', 'PLEXIGLAS® XT Опал WN071 (70%)', 'PLEXIGLAS® XT Opāls WN071 (70%)', '[2, 3, 4, 5, 6, 8]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "WN071", "finish": "gloss", "transmittance": "70%", "standardSize": "3050x2050mm", "hex": "#F5F5F5", "properties": {"lightDiffusing": true, "uvResistant": true, "highTransmission": true}, "applications": ["Lighting", "Displays"]}'),

('Plastics', 'PMMA_XT_OPAL_WN370', 'PLEXIGLAS® XT White WN370 (3%)', 'PLEXIGLAS® XT Белый WN370 (3%)', 'PLEXIGLAS® XT Balts WN370 (3%)', '[2, 3, 4, 5]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "WN370", "finish": "gloss", "transmittance": "3%", "standardSize": "3050x2050mm", "hex": "#FFFFFF", "properties": {"almostOpaque": true, "uvResistant": true}, "applications": ["Projection screens", "Diffusers"]}'),

('Plastics', 'PMMA_XT_OPAL_WN670', 'PLEXIGLAS® XT White WN670 (44%)', 'PLEXIGLAS® XT Белый WN670 (44%)', 'PLEXIGLAS® XT Balts WN670 (44%)', '[2, 3, 4, 5]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "WN670", "finish": "gloss", "transmittance": "44%", "standardSize": "3050x2050mm", "hex": "#F2F2F2", "properties": {"lightDiffusing": true, "uvResistant": true}, "applications": ["Illuminated Signs"]}'),

('Plastics', 'PMMA_XT_OPAL_WN770', 'PLEXIGLAS® XT White WN770 (78%)', 'PLEXIGLAS® XT Белый WN770 (78%)', 'PLEXIGLAS® XT Balts WN770 (78%)', '[2, 3, 4, 5]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "WN770", "finish": "gloss", "transmittance": "78%", "standardSize": "3050x2050mm", "hex": "#FAFAFA", "properties": {"highTransmission": true, "uvResistant": true}, "applications": ["Lighting fixtures"]}'),

-- XT Black
('Plastics', 'PMMA_XT_BLACK_9N870', 'PLEXIGLAS® XT Black 9N870', 'PLEXIGLAS® XT Черный 9N870', 'PLEXIGLAS® XT Melns 9N870', '[2, 3, 4, 5, 6, 8, 10]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "9N870", "finish": "gloss", "transmittance": "0%", "standardSize": "3050x2050mm", "hex": "#000000", "properties": {"opaque": true, "uvResistant": true, "highGloss": true}, "applications": ["Design elements", "Signage", "Furniture"]}'),

-- XT Colored (Translucent/Transparent)
('Plastics', 'PMMA_XT_YELLOW_1N870', 'PLEXIGLAS® XT Yellow 1N870', 'PLEXIGLAS® XT Желтый 1N870', 'PLEXIGLAS® XT Dzeltens 1N870', '[3]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "1N870", "finish": "gloss", "transmittance": "20%", "standardSize": "3050x2050mm", "hex": "#FFD700", "properties": {"translucent": true, "uvResistant": true}, "applications": ["Signage", "Decoration"]}'),

('Plastics', 'PMMA_XT_ORANGE_2N170', 'PLEXIGLAS® XT Orange 2N170', 'PLEXIGLAS® XT Оранжевый 2N170', 'PLEXIGLAS® XT Oranžs 2N170', '[3]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "2N170", "finish": "gloss", "transmittance": "18%", "standardSize": "3050x2050mm", "hex": "#FFA500", "properties": {"translucent": true, "uvResistant": true}, "applications": ["Signage", "Decoration"]}'),

('Plastics', 'PMMA_XT_RED_3N570', 'PLEXIGLAS® XT Red 3N570', 'PLEXIGLAS® XT Красный 3N570', 'PLEXIGLAS® XT Sarkans 3N570', '[3, 5]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "3N570", "finish": "gloss", "transmittance": "15%", "standardSize": "3050x2050mm", "hex": "#FF0000", "properties": {"translucent": true, "uvResistant": true}, "applications": ["Signage", "Decoration"]}'),

('Plastics', 'PMMA_XT_BLUE_5N870', 'PLEXIGLAS® XT Blue 5N870', 'PLEXIGLAS® XT Синий 5N870', 'PLEXIGLAS® XT Zils 5N870', '[3, 5]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "5N870", "finish": "gloss", "transmittance": "15%", "standardSize": "3050x2050mm", "hex": "#0000FF", "properties": {"translucent": true, "uvResistant": true}, "applications": ["Signage", "Decoration"]}'),

('Plastics', 'PMMA_XT_GREEN_6N570', 'PLEXIGLAS® XT Green 6N570', 'PLEXIGLAS® XT Зеленый 6N570', 'PLEXIGLAS® XT Zaļš 6N570', '[3]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "6N570", "finish": "gloss", "transmittance": "15%", "standardSize": "3050x2050mm", "hex": "#008000", "properties": {"translucent": true, "uvResistant": true}, "applications": ["Signage", "Decoration"]}'),

('Plastics', 'PMMA_XT_GREY_7A670', 'PLEXIGLAS® XT Grey 7A670', 'PLEXIGLAS® XT Серый 7A670', 'PLEXIGLAS® XT Pelēks 7A670', '[3]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "7A670", "finish": "gloss", "transmittance": "20%", "standardSize": "3050x2050mm", "hex": "#808080", "properties": {"translucent": true, "uvResistant": true}, "applications": ["Signage", "Glazing"]}'),

('Plastics', 'PMMA_XT_BROWN_8A570', 'PLEXIGLAS® XT Brown 8A570', 'PLEXIGLAS® XT Коричневый 8A570', 'PLEXIGLAS® XT Brūns 8A570', '[3]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "8A570", "finish": "gloss", "transmittance": "25%", "standardSize": "3050x2050mm", "hex": "#8B4513", "properties": {"translucent": true, "uvResistant": true}, "applications": ["Signage", "Glazing"]}'),


-- ==========================================
-- 2. PLEXIGLAS® GS (Cast)
-- ==========================================

-- GS Clear
('Plastics', 'PMMA_GS_CLEAR_0F00', 'PLEXIGLAS® GS Clear 0F00', 'PLEXIGLAS® GS Прозрачный 0F00', 'PLEXIGLAS® GS Caurspīdīgs 0F00', '[2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40, 50, 60]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "0F00", "finish": "gloss", "transmittance": "92%", "standardSize": "3050x2030mm", "hex": "#FFFFFF", "properties": {"highQuality": true, "easyMachining": true, "chemicalResistant": true, "opticalQuality": true}, "applications": ["Aquariums", "Furniture", "Awards", "Heavy glazing"]}'),

-- GS White / Opal
('Plastics', 'PMMA_GS_WHITE_WH10', 'PLEXIGLAS® GS White WH10 (Opaque)', 'PLEXIGLAS® GS Белый WH10 (Непрозрачный)', 'PLEXIGLAS® GS Balts WH10 (Nepārredzams)', '[3, 4, 5, 6, 8, 10, 12, 15, 20]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "WH10", "finish": "gloss", "transmittance": "7%", "standardSize": "3050x2030mm", "hex": "#FFFFFF", "properties": {"opaque": true, "uvResistant": true}, "applications": ["Furniture", "Displays", "Signage"]}'),

('Plastics', 'PMMA_GS_OPAL_WH02', 'PLEXIGLAS® GS Opal WH02 (44%)', 'PLEXIGLAS® GS Опал WH02', 'PLEXIGLAS® GS Opāls WH02', '[3, 4, 5, 6, 8, 10]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "WH02", "finish": "gloss", "transmittance": "44%", "standardSize": "3050x2030mm", "hex": "#F5F5F5", "properties": {"lightDiffusing": true, "uvResistant": true}, "applications": ["Lighting", "Design"]}'),

-- GS Colored
('Plastics', 'PMMA_GS_RED_3C01', 'PLEXIGLAS® GS Red 3C01', 'PLEXIGLAS® GS Красный 3C01', 'PLEXIGLAS® GS Sarkans 3C01', '[3, 5]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "3C01", "finish": "gloss", "transmittance": "4%", "standardSize": "3050x2030mm", "hex": "#CC0000", "properties": {"translucent": true, "vibrantColor": true}, "applications": ["Design", "Signage"]}'),

('Plastics', 'PMMA_GS_YELLOW_1C50', 'PLEXIGLAS® GS Yellow 1C50', 'PLEXIGLAS® GS Желтый 1C50', 'PLEXIGLAS® GS Dzeltens 1C50', '[3]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "1C50", "finish": "gloss", "transmittance": "88%", "standardSize": "3050x2030mm", "hex": "#FFFF00", "properties": {"transparentColored": true, "uvResistant": true}, "applications": ["Design", "Displays"]}'),

('Plastics', 'PMMA_GS_BLUE_5C01', 'PLEXIGLAS® GS Blue 5C01', 'PLEXIGLAS® GS Синий 5C01', 'PLEXIGLAS® GS Zils 5C01', '[3, 5]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "5C01", "finish": "gloss", "transmittance": "16%", "standardSize": "3050x2030mm", "hex": "#0000CD", "properties": {"translucent": true, "uvResistant": true}, "applications": ["Design", "Signage"]}'),

('Plastics', 'PMMA_GS_GREEN_6C01', 'PLEXIGLAS® GS Green 6C01', 'PLEXIGLAS® GS Зеленый 6C01', 'PLEXIGLAS® GS Zaļš 6C01', '[3, 5]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "6C01", "finish": "gloss", "transmittance": "18%", "standardSize": "3050x2030mm", "hex": "#008000", "properties": {"translucent": true, "uvResistant": true}, "applications": ["Design", "Signage"]}'),

('Plastics', 'PMMA_GS_BLACK_9C01', 'PLEXIGLAS® GS Black 9C01', 'PLEXIGLAS® GS Черный 9C01', 'PLEXIGLAS® GS Melns 9C01', '[3, 4, 5, 6, 8, 10]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "9C01", "finish": "gloss", "transmittance": "0%", "standardSize": "3050x2030mm", "hex": "#000000", "properties": {"opaque": true, "uvResistant": true, "deepBlack": true}, "applications": ["Furniture", "Design", "Displays"]}'),

-- GS Special
('Plastics', 'PMMA_GS_SATIN_CLEAR', 'PLEXIGLAS® Satinice Clear (Cast)', 'PLEXIGLAS® Satinice Матовый', 'PLEXIGLAS® Satinice Matēts', '[3, 4, 5, 6, 8, 10]', 
'{"brand": "PLEXIGLAS®", "series": "Satinice", "code": "0F00 DC", "finish": "matte/frosted", "transmittance": "90%", "standardSize": "3050x2030mm", "hex": "#E0E0E0", "properties": {"fingerprintResistant": true, "lightDiffusing": true}, "applications": ["Lighting", "Furniture"]}'),

('Plastics', 'PMMA_GS_FLUORESCENT_ORANGE', 'PLEXIGLAS® GS Fluorescent Orange 2C01', 'PLEXIGLAS® GS Флуоресцентный Оранжевый', 'PLEXIGLAS® GS Fluorescējošs Oranžs', '[3]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "2C01", "finish": "gloss", "transmittance": "90%", "standardSize": "3050x2030mm", "hex": "#FF4500", "properties": {"fluorescent": true, "edgeGlow": true}, "applications": ["Displays", "Art"]}');
