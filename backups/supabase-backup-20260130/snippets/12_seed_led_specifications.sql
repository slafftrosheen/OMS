-- Detailed LED & Power Specifications Catalogue
-- Categories: LED Modules (BaltLED), Power Supplies (Mean Well), Neon Flex

INSERT INTO public.materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata)
VALUES 

-- ==========================================
-- 1. BALTLED MODULES (Signage Illumination)
-- ==========================================

-- Crown Mini (Small Depth)
('Electronics', 'LED_MOD_CROWN_MINI', 'BaltLED Crown Mini White 6500K', 'Модуль BaltLED Crown Mini 6500K', 'Modulis BaltLED Crown Mini 6500K', '[]', 
'{"brand": "BaltLED", "series": "Crown Mini", "voltage": "12V", "power": "0.3W", "colorTemp": "6500K", "lumens": "28lm", "efficiency": "93lm/W", "beamAngle": "160", "ipRating": "IP66", "dimensions": "25x14x7mm", "depth": "20-60mm", "warranty": "5 years"}'),

-- Crown Mini HE (High Efficiency)
('Electronics', 'LED_MOD_CROWN_MINI_HE', 'BaltLED Crown Mini HE White 6500K', 'Модуль BaltLED Crown Mini HE 6500K', 'Modulis BaltLED Crown Mini HE 6500K', '[]', 
'{"brand": "BaltLED", "series": "Crown Mini HE", "voltage": "12V", "power": "0.2W", "colorTemp": "6500K", "lumens": "32lm", "efficiency": "160lm/W", "beamAngle": "160", "ipRating": "IP65", "dimensions": "25x14x7mm", "depth": "20-60mm", "warranty": "5 years"}'),

-- Crown OPTO S1+ (Standard Depth)
('Electronics', 'LED_MOD_CROWN_OPTO_S1', 'BaltLED Crown OPTO S1+ White 6500K', 'Модуль BaltLED Crown OPTO S1+ 6500K', 'Modulis BaltLED Crown OPTO S1+ 6500K', '[]', 
'{"brand": "BaltLED", "series": "Crown OPTO", "voltage": "12V", "power": "1.2W", "colorTemp": "6500K", "lumens": "120lm", "efficiency": "100lm/W", "beamAngle": "160", "ipRating": "IP67", "dimensions": "70x16x9mm", "depth": "80-140mm", "warranty": "5 years"}'),

-- Crown Stellar S1 (Medium Depth)
('Electronics', 'LED_MOD_CROWN_STELLAR_S1', 'BaltLED Crown Stellar S1 White 6500K', 'Модуль BaltLED Crown Stellar S1 6500K', 'Modulis BaltLED Crown Stellar S1 6500K', '[]', 
'{"brand": "BaltLED", "series": "Crown Stellar", "voltage": "12V", "power": "0.72W", "colorTemp": "6500K", "lumens": "75lm", "efficiency": "104lm/W", "beamAngle": "160", "ipRating": "IP67", "dimensions": "45x16x8mm", "depth": "50-120mm", "warranty": "5 years"}'),


-- ==========================================
-- 2. MEAN WELL LED DRIVERS (PSU)
-- ==========================================

-- HLG Series (High Performance, Metal)
('Electronics', 'PSU_MW_HLG_320H_12', 'Mean Well HLG-320H-12 (320W)', 'Блок Питания HLG-320H-12', 'Barošanas Bloks HLG-320H-12', '[]', 
'{"brand": "Mean Well", "series": "HLG", "voltage": "12V", "power": "320W", "current": "22A", "ipRating": "IP67", "dimming": "3-in-1 (1-10V, PWM, Res)", "efficiency": "94%", "casing": "Metal", "warranty": "7 years", "applications": ["Street lighting", "High-bay", "Large signage"]}'),

('Electronics', 'PSU_MW_HLG_600H_12', 'Mean Well HLG-600H-12 (600W)', 'Блок Питания HLG-600H-12', 'Barošanas Bloks HLG-600H-12', '[]', 
'{"brand": "Mean Well", "series": "HLG", "voltage": "12V", "power": "600W", "current": "40A", "ipRating": "IP67", "dimming": "3-in-1 (0-10V, PWM, Res)", "efficiency": "95%", "casing": "Metal", "warranty": "7 years", "applications": ["Stadium lighting", "Massive signage"]}'),

-- ELG Series (Economy, DALI options)
('Electronics', 'PSU_MW_ELG_150_12', 'Mean Well ELG-150-12 (150W)', 'Блок Питания ELG-150-12', 'Barošanas Bloks ELG-150-12', '[]', 
'{"brand": "Mean Well", "series": "ELG", "voltage": "12V", "power": "150W", "current": "10A", "ipRating": "IP67", "dimming": "Optional (DALI available)", "efficiency": "90%", "casing": "Metal", "warranty": "5 years", "applications": ["Architectural lighting", "Signage"]}'),

('Electronics', 'PSU_MW_ELG_200_12_DA', 'Mean Well ELG-200-12DA (200W DALI)', 'Блок Питания ELG-200-12 DALI', 'Barošanas Bloks ELG-200-12 DALI', '[]', 
'{"brand": "Mean Well", "series": "ELG", "voltage": "12V", "power": "200W", "current": "16A", "ipRating": "IP67", "dimming": "DALI 2.0", "efficiency": "92%", "casing": "Metal", "warranty": "5 years", "applications": ["Smart lighting", "Controlled signage"]}'),


-- ==========================================
-- 3. SILICONE NEON FLEX
-- ==========================================

-- Standard Signage Neon (6x12mm)
('Electronics', 'NEON_FLEX_6X12_WHITE', 'Silicone Neon Flex 6x12mm Cool White', 'Силиконовый Неон 6x12мм Белый', 'Silikona Neons 6x12mm Balts', '[]', 
'{"type": "Silicone Neon", "voltage": "12V", "power": "9.6W/m", "dimensions": "6x12mm", "cutStep": "10mm", "colorTemp": "6500K", "ipRating": "IP67", "bendRadius": "50mm", "applications": ["Signage", "Letters"]}'),

('Electronics', 'NEON_FLEX_6X12_WARM', 'Silicone Neon Flex 6x12mm Warm White', 'Силиконовый Неон 6x12мм Теплый', 'Silikona Neons 6x12mm Silts', '[]', 
'{"type": "Silicone Neon", "voltage": "12V", "power": "9.6W/m", "dimensions": "6x12mm", "cutStep": "10mm", "colorTemp": "3000K", "ipRating": "IP67", "bendRadius": "50mm", "applications": ["Decor", "Letters"]}'),

('Electronics', 'NEON_FLEX_6X12_RGB', 'Silicone Neon Flex 6x12mm RGB', 'Силиконовый Неон 6x12мм RGB', 'Silikona Neons 6x12mm RGB', '[]', 
'{"type": "Silicone Neon", "voltage": "12V", "power": "12W/m", "dimensions": "6x12mm", "cutStep": "25mm", "color": "RGB", "ipRating": "IP67", "bendRadius": "50mm", "control": "External Controller", "applications": ["Dynamic Signage"]}'),

-- Mini Neon (4x8mm) for fine detail
('Electronics', 'NEON_FLEX_4X8_WHITE', 'Silicone Neon Flex 4x8mm Cool White', 'Силиконовый Неон 4x8мм Белый', 'Silikona Neons 4x8mm Balts', '[]', 
'{"type": "Silicone Neon", "voltage": "12V", "power": "8W/m", "dimensions": "4x8mm", "cutStep": "10mm", "colorTemp": "6500K", "ipRating": "IP65", "bendRadius": "30mm", "applications": ["Small letters", "Detailed logos"]}');
