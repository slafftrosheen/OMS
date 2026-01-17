-- Expanded Plexiglas GS & XT Color Catalogue
-- Source: Comprehensive brand color charts (Transparent, Translucent, Opaque, Fluorescent)

INSERT INTO public.materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata)
VALUES 

-- ==========================================
-- 1. TRANSPARENT COLORS (Light-Permitting)
-- ==========================================

('Plastics', 'PMMA_GS_TRANS_RED_2423', 'PLEXIGLAS® GS Red 2423 (Transparent)', 'PLEXIGLAS® GS Красный 2423 (Прозрачный)', 'PLEXIGLAS® GS Sarkans 2423 (Caurspīdīgs)', '[3, 5]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "2423", "type": "transparent", "hex": "#FF0000", "applications": ["Design", "Displays"]}'),

('Plastics', 'PMMA_GS_TRANS_BLUE_2424', 'PLEXIGLAS® GS Blue 2424 (Transparent)', 'PLEXIGLAS® GS Синий 2424 (Прозрачный)', 'PLEXIGLAS® GS Zils 2424 (Caurspīdīgs)', '[3, 5]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "2424", "type": "transparent", "hex": "#0000FF"}'),

('Plastics', 'PMMA_GS_TRANS_BRONZE_2404', 'PLEXIGLAS® GS Bronze 2404 (Transparent)', 'PLEXIGLAS® GS Бронза 2404 (Прозрачный)', 'PLEXIGLAS® GS Bronza 2404 (Caurspīdīgs)', '[3, 5, 8, 10]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "2404", "type": "transparent", "hex": "#8B4513"}'),

('Plastics', 'PMMA_GS_TRANS_GREY_2064', 'PLEXIGLAS® GS Grey 2064 (Transparent)', 'PLEXIGLAS® GS Серый 2064 (Прозрачный)', 'PLEXIGLAS® GS Pelēks 2064 (Caurspīdīgs)', '[3, 5, 8, 10]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "2064", "type": "transparent", "hex": "#808080"}'),


-- ==========================================
-- 2. TRANSLUCENT COLORS (Diffusing / Signage)
-- ==========================================

-- White / Opal Range
('Plastics', 'PMMA_GS_OPAL_WH17', 'PLEXIGLAS® GS White WH17 (90%)', 'PLEXIGLAS® GS Белый WH17 (90%)', 'PLEXIGLAS® GS Balts WH17 (90%)', '[3, 4, 5]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "WH17", "transmittance": "90%", "type": "translucent", "hex": "#FAFAFA"}'),

('Plastics', 'PMMA_GS_OPAL_WH73', 'PLEXIGLAS® GS White WH73 (20%)', 'PLEXIGLAS® GS Белый WH73 (20%)', 'PLEXIGLAS® GS Balts WH73 (20%)', '[3, 5]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "WH73", "transmittance": "20%", "type": "translucent", "hex": "#EBEBEB"}'),

-- Yellows
('Plastics', 'PMMA_GS_YELLOW_1C33', 'PLEXIGLAS® GS Yellow 1C33', 'PLEXIGLAS® GS Желтый 1C33', 'PLEXIGLAS® GS Dzeltens 1C33', '[3]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "1C33", "type": "translucent", "hex": "#FFEA00"}'),

('Plastics', 'PMMA_GS_YELLOW_1H01', 'PLEXIGLAS® GS Yellow 1H01', 'PLEXIGLAS® GS Желтый 1H01', 'PLEXIGLAS® GS Dzeltens 1H01', '[3]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "1H01", "type": "translucent", "hex": "#FFD700"}'),

-- Reds & Oranges
('Plastics', 'PMMA_GS_ORANGE_2C04', 'PLEXIGLAS® GS Orange 2C04', 'PLEXIGLAS® GS Оранжевый 2C04', 'PLEXIGLAS® GS Oranžs 2C04', '[3]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "2C04", "type": "translucent", "hex": "#FF8C00"}'),

('Plastics', 'PMMA_GS_RED_3H01', 'PLEXIGLAS® GS Red 3H01', 'PLEXIGLAS® GS Красный 3H01', 'PLEXIGLAS® GS Sarkans 3H01', '[3, 5]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "3H01", "type": "translucent", "hex": "#ED1C24"}'),

('Plastics', 'PMMA_GS_RED_3H67', 'PLEXIGLAS® GS Ruby Red 3H67', 'PLEXIGLAS® GS Рубиновый 3H67', 'PLEXIGLAS® GS Rubīnsarkans 3H67', '[3, 5]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "3H67", "type": "translucent", "hex": "#9B111E"}'),

-- Blues & Greens
('Plastics', 'PMMA_GS_BLUE_5H01', 'PLEXIGLAS® GS Blue 5H01', 'PLEXIGLAS® GS Синий 5H01', 'PLEXIGLAS® GS Zils 5H01', '[3, 5]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "5H01", "type": "translucent", "hex": "#0054A6"}'),

('Plastics', 'PMMA_GS_GREEN_6H01', 'PLEXIGLAS® GS Green 6H01', 'PLEXIGLAS® GS Зеленый 6H01', 'PLEXIGLAS® GS Zaļš 6H01', '[3]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "6H01", "type": "translucent", "hex": "#00A651"}'),


-- ==========================================
-- 3. OPAQUE COLORS (Privacy / Solid)
-- ==========================================

('Plastics', 'PMMA_XT_IVORY_WN970', 'PLEXIGLAS® XT Ivory WN970 (Opaque)', 'PLEXIGLAS® XT Слоновая кость WN970', 'PLEXIGLAS® XT Ziloņkauls WN970', '[3]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "WN970", "type": "opaque", "hex": "#FFFFF0"}'),

('Plastics', 'PMMA_XT_BLACK_9N871', 'PLEXIGLAS® XT Black 9N871 GT', 'PLEXIGLAS® XT Черный 9N871 GT', 'PLEXIGLAS® XT Melns 9N871 GT', '[3, 5]', 
'{"brand": "PLEXIGLAS®", "series": "XT", "code": "9N871 GT", "type": "opaque", "hex": "#000000", "finish": "high gloss"}'),


-- ==========================================
-- 4. FLUORESCENT COLORS (Edge-Glow)
-- ==========================================

('Plastics', 'PMMA_GS_FLUOR_GREEN_6C02', 'PLEXIGLAS® GS Fluorescent Green 6C02', 'PLEXIGLAS® GS Флуоресцентный Зеленый 6C02', 'PLEXIGLAS® GS Fluorescējošs Zaļš 6C02', '[3]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "6C02", "type": "fluorescent", "hex": "#ADFF2F", "properties": {"edgeGlow": true}}'),

('Plastics', 'PMMA_GS_FLUOR_YELLOW_1C02', 'PLEXIGLAS® GS Fluorescent Yellow 1C02', 'PLEXIGLAS® GS Флуоресцентный Желтый 1C02', 'PLEXIGLAS® GS Fluorescējošs Dzeltens 1C02', '[3]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "1C02", "type": "fluorescent", "hex": "#FFFF00", "properties": {"edgeGlow": true}}'),

('Plastics', 'PMMA_GS_FLUOR_RED_3C02', 'PLEXIGLAS® GS Fluorescent Red 3C02', 'PLEXIGLAS® GS Флуоресцентный Красный 3C02', 'PLEXIGLAS® GS Fluorescējošs Sarkans 3C02', '[3]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "3C02", "type": "fluorescent", "hex": "#FF0000", "properties": {"edgeGlow": true}}'),

('Plastics', 'PMMA_GS_FLUOR_BLUE_5C02', 'PLEXIGLAS® GS Fluorescent Blue 5C02', 'PLEXIGLAS® GS Флуоресцентный Синий 5C02', 'PLEXIGLAS® GS Fluorescējošs Zils 5C02', '[3]', 
'{"brand": "PLEXIGLAS®", "series": "GS", "code": "5C02", "type": "fluorescent", "hex": "#0000FF", "properties": {"edgeGlow": true}}');
