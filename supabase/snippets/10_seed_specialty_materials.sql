-- Specialty Materials Catalogue Import
-- Categories: Plexiglas LED, Dibond Special, Colored PVC, Polycarbonate

INSERT INTO public.materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata)
VALUES 

-- ==========================================
-- 1. PLEXIGLAS® LED (Specialty Lighting)
-- ==========================================

-- LED for Backlighting (Opal/Diffusing)
('Plastics', 'PMMA_LED_BACKLIT_WN670', 'PLEXIGLAS® LED White WN670 (Backlit)', 'PLEXIGLAS® LED Белый WN670 (Контражур)', 'PLEXIGLAS® LED Balts WN670 (Izgaismošanai)', '[3, 4, 5, 6, 8, 10]', 
'{"brand": "PLEXIGLAS®", "series": "LED", "code": "WN670", "finish": "gloss", "transmittance": "44%", "standardSize": "3050x2030mm", "hex": "#F5F5F5", "properties": {"lightDiffusing": true, "noHotspots": true, "uvResistant": true}, "applications": ["Lightboxes", "Illuminated signs"]}'),

('Plastics', 'PMMA_LED_BACKLIT_WN770', 'PLEXIGLAS® LED White WN770 (High Trans.)', 'PLEXIGLAS® LED Белый WN770 (Выс. пропуск.)', 'PLEXIGLAS® LED Balts WN770 (Augsta gaismas caurlaidība)', '[3, 4, 5]', 
'{"brand": "PLEXIGLAS®", "series": "LED", "code": "WN770", "finish": "gloss", "transmittance": "78%", "standardSize": "3050x2030mm", "hex": "#FAFAFA", "properties": {"highTransmission": true, "uvResistant": true}, "applications": ["Deep lightboxes", "Channel letters"]}'),

-- LED for Edge Lighting (LGP)
('Plastics', 'PMMA_LED_EDGELIT_0E011', 'PLEXIGLAS® LED Clear 0E011 (Edge Lit)', 'PLEXIGLAS® LED Прозрачный 0E011 (Торцевой)', 'PLEXIGLAS® LED Caurspīdīgs 0E011 (Kantes gaisma)', '[4, 6, 8, 10]', 
'{"brand": "PLEXIGLAS®", "series": "LED", "code": "0E011 L", "finish": "gloss", "transmittance": "92%", "standardSize": "3050x2030mm", "hex": "#FFFFFF", "properties": {"edgeLighting": true, "lightGuiding": true, "transparent": true}, "applications": ["Slim lightboxes", "Edge-lit displays", "Poster panels"]}'),

('Plastics', 'PMMA_LED_EDGELIT_0E012', 'PLEXIGLAS® LED Clear 0E012 (Edge Lit XL)', 'PLEXIGLAS® LED Прозрачный 0E012 (Торцевой XL)', 'PLEXIGLAS® LED Caurspīdīgs 0E012 (Kantes gaisma XL)', '[8, 10]', 
'{"brand": "PLEXIGLAS®", "series": "LED", "code": "0E012 XL", "finish": "gloss", "transmittance": "92%", "standardSize": "3050x2030mm", "hex": "#FFFFFF", "properties": {"edgeLighting": true, "longDistanceGuiding": true}, "applications": ["Large slim lightboxes", "City lights"]}'),

-- Black/White (Day/Night)
('Plastics', 'PMMA_LED_BLACK_WHITE', 'PLEXIGLAS® LED Black/White 9H001', 'PLEXIGLAS® LED Черный/Белый (День/Ночь)', 'PLEXIGLAS® LED Melns/Balts (Diena/Nakts)', '[3, 4, 5]', 
'{"brand": "PLEXIGLAS®", "series": "LED", "code": "9H001", "finish": "matte/gloss", "transmittance": "15%", "standardSize": "3050x2030mm", "hex": "#333333", "properties": {"colorChange": true, "blackDay": true, "whiteNight": true}, "applications": ["Day/Night signage", "Channel letters"]}'),


-- ==========================================
-- 2. DIBOND® SPECIAL FINISHES (ACP)
-- ==========================================

-- Butler Finish (Brushed)
('Metals', 'ACP_BUTLER_SILVER', 'DIBOND® Butler Finish Silver', 'DIBOND® Butler Серебро (Царапанный)', 'DIBOND® Butler Sudrabs (Slīpēts)', '[3]', 
'{"brand": "DIBOND®", "series": "Butler Finish", "finish": "brushed", "aluminumThickness": "0.3mm", "standardSize": "3050x1500mm", "hex": "#C0C0C0", "properties": {"decorative": true, "premiumLook": true, "outdoor": true}, "applications": ["Interior design", "High-end signage", "POS"]}'),

('Metals', 'ACP_BUTLER_GOLD', 'DIBOND® Butler Finish Gold', 'DIBOND® Butler Золото (Царапанный)', 'DIBOND® Butler Zelts (Slīpēts)', '[3]', 
'{"brand": "DIBOND®", "series": "Butler Finish", "finish": "brushed", "aluminumThickness": "0.3mm", "standardSize": "3050x1500mm", "hex": "#D4AF37", "properties": {"decorative": true, "premiumLook": true}, "applications": ["Luxury displays", "Interior"]}'),

('Metals', 'ACP_BUTLER_COPPER', 'DIBOND® Butler Finish Copper', 'DIBOND® Butler Медь (Царапанный)', 'DIBOND® Butler Varš (Slīpēts)', '[3]', 
'{"brand": "DIBOND®", "series": "Butler Finish", "finish": "brushed", "aluminumThickness": "0.3mm", "standardSize": "3050x1500mm", "hex": "#B87333", "properties": {"decorative": true, "premiumLook": true}, "applications": ["Design", "Cladding"]}'),

-- Mirror Finish
('Metals', 'ACP_MIRROR_SILVER', 'DIBOND® Mirror Silver', 'DIBOND® Зеркало Серебро', 'DIBOND® Spogulis Sudrabs', '[3]', 
'{"brand": "DIBOND®", "series": "Mirror", "finish": "mirror", "aluminumThickness": "0.3mm", "standardSize": "3050x1250mm", "hex": "#E0E0E0", "properties": {"reflective": true, "shatterproof": true, "indoor": true}, "applications": ["Mirrors", "Ceilings", "Exhibition"]}'),

('Metals', 'ACP_MIRROR_GOLD', 'DIBOND® Mirror Gold', 'DIBOND® Зеркало Золото', 'DIBOND® Spogulis Zelts', '[3]', 
'{"brand": "DIBOND®", "series": "Mirror", "finish": "mirror", "aluminumThickness": "0.3mm", "standardSize": "3050x1250mm", "hex": "#FFD700", "properties": {"reflective": true, "decorative": true, "indoor": true}, "applications": ["Decoration", "Displays"]}'),

('Metals', 'ACP_MIRROR_ANTHRACITE', 'DIBOND® Mirror Anthracite', 'DIBOND® Зеркало Антрацит', 'DIBOND® Spogulis Antracīts', '[3]', 
'{"brand": "DIBOND®", "series": "Mirror", "finish": "mirror", "aluminumThickness": "0.3mm", "standardSize": "3050x1250mm", "hex": "#383E42", "properties": {"reflective": true, "decorative": true, "indoor": true}, "applications": ["Shop design", "Interiors"]}'),

-- Decor (Wood/Stone)
('Metals', 'ACP_DECOR_WALNUT', 'DIBOND® Decor Walnut', 'DIBOND® Декор Орех', 'DIBOND® Dekors Riekstkoks', '[3]', 
'{"brand": "DIBOND®", "series": "Decor", "finish": "wood_grain", "aluminumThickness": "0.3mm", "standardSize": "3050x1500mm", "hex": "#5D4037", "properties": {"textured": true, "outdoor": true, "uvResistant": true}, "applications": ["Facades", "Shopfitting"]}'),

('Metals', 'ACP_DECOR_OAK', 'DIBOND® Decor Oak', 'DIBOND® Декор Дуб', 'DIBOND® Dekors Ozols', '[3]', 
'{"brand": "DIBOND®", "series": "Decor", "finish": "wood_grain", "aluminumThickness": "0.3mm", "standardSize": "3050x1500mm", "hex": "#C19A6B", "properties": {"textured": true, "outdoor": true}, "applications": ["Facades", "Furniture"]}'),


-- ==========================================
-- 3. COLORED PVC FOAM (Palight / Ongrofoam)
-- ==========================================

('Plastics', 'PVC_FOAM_BLUE', 'PVC Foam Blue', 'ПВХ Вспененный Синий', 'PVC Putu Zils', '[3, 5]', 
'{"brand": "Palight/Ongrofoam", "series": "Color", "finish": "matte", "density": "0.55 g/cm3", "standardSize": "3050x2030mm", "hex": "#0000FF", "properties": {"lightweight": true, "vibrant": true}, "applications": ["Signage", "Displays"]}'),

('Plastics', 'PVC_FOAM_GREEN', 'PVC Foam Green', 'ПВХ Вспененный Зеленый', 'PVC Putu Zaļš', '[3, 5]', 
'{"brand": "Palight/Ongrofoam", "series": "Color", "finish": "matte", "density": "0.55 g/cm3", "standardSize": "3050x2030mm", "hex": "#008000", "properties": {"lightweight": true, "vibrant": true}, "applications": ["Signage", "Displays"]}'),

('Plastics', 'PVC_FOAM_DARK_GREY', 'PVC Foam Dark Grey', 'ПВХ Вспененный Темно-серый', 'PVC Putu Tumši Pelēks', '[3, 5]', 
'{"brand": "Palight/Ongrofoam", "series": "Color", "finish": "matte", "density": "0.55 g/cm3", "standardSize": "3050x2030mm", "hex": "#404040", "properties": {"lightweight": true}, "applications": ["Signage", "Industrial aesthetics"]}'),


-- ==========================================
-- 4. SPECIALTY POLYCARBONATE (Makrolon/Marlon)
-- ==========================================

-- Abrasion Resistant (AR)
('Plastics', 'PC_MONO_AR', 'Polycarbonate AR (Hard Coated)', 'Поликарбонат AR (Устойчивый к царапинам)', 'Polikarbonāts AR (Pretskrāpējumu)', '[3, 4, 5, 6, 8]', 
'{"brand": "Makrolon", "series": "AR", "finish": "gloss", "transmittance": "88%", "standardSize": "3000x2000mm", "hex": "#FFFFFF", "properties": {"scratchResistant": true, "chemicalResistant": true, "unbreakable": true}, "applications": ["Machine guards", "Public glazing", "Visors"]}'),

-- Textured / Embossed
('Plastics', 'PC_MONO_TEXTURED', 'Polycarbonate Textured (Prismatic)', 'Поликарбонат Текстурированный (Призма)', 'Polikarbonāts Strukturēts (Prizma)', '[3, 4]', 
'{"brand": "Marlon", "series": "FSX", "finish": "textured", "pattern": "Prismatic/Stippled", "standardSize": "3050x2050mm", "hex": "#FFFFFF", "properties": {"lightDiffusing": true, "privacy": true, "tough": true}, "applications": ["Privacy glazing", "Lighting covers"]}');
