-- src/lib/server/db/seeds/011_ledstrips_lemlux.sql
-- Lemlux LED Strips from Lemona.lv

-- ==========================================
-- LEMLUX COB LED STRIPS
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
-- COB White Series
('LED_STRIP', 'LEMLUX_COB_W_8W', 'Lemlux COB LED Strip White 8W/m', 'Lemlux COB LED лента Белый 8W/м', 'Lemlux COB LED lente Balta 8W/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "COB", "wattage": 8, "voltage": 24, "colorTemp": 4000, "lumens": 800, "ledCount": 480, "ip": "IP20", "lengthM": 5, "hex": "#FFFAF0", "sku": "LMX-COB-W8-24"}'::jsonb),

('LED_STRIP', 'LEMLUX_COB_W_10W', 'Lemlux COB LED Strip White 10W/m', 'Lemlux COB LED лента Белый 10W/м', 'Lemlux COB LED lente Balta 10W/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "COB", "wattage": 10, "voltage": 24, "colorTemp": 4000, "lumens": 1000, "ledCount": 528, "ip": "IP20", "lengthM": 5, "hex": "#FFFAF0", "sku": "LMX-COB-W10-24"}'::jsonb),

('LED_STRIP', 'LEMLUX_COB_W_14W', 'Lemlux COB LED Strip White 14W/m', 'Lemlux COB LED лента Белый 14W/м', 'Lemlux COB LED lente Balta 14W/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "COB", "wattage": 14, "voltage": 24, "colorTemp": 4000, "lumens": 1400, "ledCount": 528, "ip": "IP20", "lengthM": 5, "hex": "#FFFAF0", "sku": "LMX-COB-W14-24"}'::jsonb),

('LED_STRIP', 'LEMLUX_COB_WW_8W', 'Lemlux COB LED Strip Warm White 8W/m', 'Lemlux COB LED лента Тёплый Белый 8W/м', 'Lemlux COB LED lente Silti Balta 8W/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "COB", "wattage": 8, "voltage": 24, "colorTemp": 3000, "lumens": 780, "ledCount": 480, "ip": "IP20", "lengthM": 5, "hex": "#FFE4B5", "sku": "LMX-COB-WW8-24"}'::jsonb),

('LED_STRIP', 'LEMLUX_COB_WW_10W', 'Lemlux COB LED Strip Warm White 10W/m', 'Lemlux COB LED лента Тёплый Белый 10W/м', 'Lemlux COB LED lente Silti Balta 10W/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "COB", "wattage": 10, "voltage": 24, "colorTemp": 3000, "lumens": 980, "ledCount": 528, "ip": "IP20", "lengthM": 5, "hex": "#FFE4B5", "sku": "LMX-COB-WW10-24"}'::jsonb),

('LED_STRIP', 'LEMLUX_COB_CW_8W', 'Lemlux COB LED Strip Cold White 8W/m', 'Lemlux COB LED лента Холодный Белый 8W/м', 'Lemlux COB LED lente Auksti Balta 8W/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "COB", "wattage": 8, "voltage": 24, "colorTemp": 6500, "lumens": 850, "ledCount": 480, "ip": "IP20", "lengthM": 5, "hex": "#F0F8FF", "sku": "LMX-COB-CW8-24"}'::jsonb),

('LED_STRIP', 'LEMLUX_COB_CW_10W', 'Lemlux COB LED Strip Cold White 10W/m', 'Lemlux COB LED лента Холодный Белый 10W/м', 'Lemlux COB LED lente Auksti Balta 10W/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "COB", "wattage": 10, "voltage": 24, "colorTemp": 6500, "lumens": 1050, "ledCount": 528, "ip": "IP20", "lengthM": 5, "hex": "#F0F8FF", "sku": "LMX-COB-CW10-24"}'::jsonb),

-- COB IP65 Waterproof
('LED_STRIP', 'LEMLUX_COB_W_10W_IP65', 'Lemlux COB LED Strip White 10W/m IP65', 'Lemlux COB LED лента Белый 10W/м IP65', 'Lemlux COB LED lente Balta 10W/m IP65',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "COB", "wattage": 10, "voltage": 24, "colorTemp": 4000, "lumens": 1000, "ledCount": 528, "ip": "IP65", "lengthM": 5, "hex": "#FFFAF0", "sku": "LMX-COB-W10-24-IP65"}'::jsonb),

('LED_STRIP', 'LEMLUX_COB_WW_10W_IP65', 'Lemlux COB LED Strip Warm White 10W/m IP65', 'Lemlux COB LED лента Тёплый Белый 10W/м IP65', 'Lemlux COB LED lente Silti Balta 10W/m IP65',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "COB", "wattage": 10, "voltage": 24, "colorTemp": 3000, "lumens": 980, "ledCount": 528, "ip": "IP65", "lengthM": 5, "hex": "#FFE4B5", "sku": "LMX-COB-WW10-24-IP65"}'::jsonb);

-- ==========================================
-- LEMLUX SMD 2835 LED STRIPS
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
('LED_STRIP', 'LEMLUX_2835_60_W', 'Lemlux SMD2835 LED Strip 60LED/m White', 'Lemlux SMD2835 LED лента 60LED/м Белый', 'Lemlux SMD2835 LED lente 60LED/m Balta',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "SMD2835", "wattage": 4.8, "voltage": 12, "colorTemp": 4000, "lumens": 480, "ledCount": 60, "ip": "IP20", "lengthM": 5, "hex": "#FFFAF0", "sku": "LMX-2835-60W-12"}'::jsonb),

('LED_STRIP', 'LEMLUX_2835_120_W', 'Lemlux SMD2835 LED Strip 120LED/m White', 'Lemlux SMD2835 LED лента 120LED/м Белый', 'Lemlux SMD2835 LED lente 120LED/m Balta',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "SMD2835", "wattage": 9.6, "voltage": 12, "colorTemp": 4000, "lumens": 960, "ledCount": 120, "ip": "IP20", "lengthM": 5, "hex": "#FFFAF0", "sku": "LMX-2835-120W-12"}'::jsonb),

('LED_STRIP', 'LEMLUX_2835_240_W', 'Lemlux SMD2835 LED Strip 240LED/m White', 'Lemlux SMD2835 LED лента 240LED/м Белый', 'Lemlux SMD2835 LED lente 240LED/m Balta',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "SMD2835", "wattage": 19.2, "voltage": 24, "colorTemp": 4000, "lumens": 1920, "ledCount": 240, "ip": "IP20", "lengthM": 5, "hex": "#FFFAF0", "sku": "LMX-2835-240W-24"}'::jsonb),

('LED_STRIP', 'LEMLUX_2835_60_WW', 'Lemlux SMD2835 LED Strip 60LED/m Warm White', 'Lemlux SMD2835 LED лента 60LED/м Тёплый Белый', 'Lemlux SMD2835 LED lente 60LED/m Silti Balta',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "SMD2835", "wattage": 4.8, "voltage": 12, "colorTemp": 3000, "lumens": 460, "ledCount": 60, "ip": "IP20", "lengthM": 5, "hex": "#FFE4B5", "sku": "LMX-2835-60WW-12"}'::jsonb),

('LED_STRIP', 'LEMLUX_2835_120_WW', 'Lemlux SMD2835 LED Strip 120LED/m Warm White', 'Lemlux SMD2835 LED лента 120LED/м Тёплый Белый', 'Lemlux SMD2835 LED lente 120LED/m Silti Balta',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "SMD2835", "wattage": 9.6, "voltage": 12, "colorTemp": 3000, "lumens": 920, "ledCount": 120, "ip": "IP20", "lengthM": 5, "hex": "#FFE4B5", "sku": "LMX-2835-120WW-12"}'::jsonb),

('LED_STRIP', 'LEMLUX_2835_60_CW', 'Lemlux SMD2835 LED Strip 60LED/m Cold White', 'Lemlux SMD2835 LED лента 60LED/м Холодный Белый', 'Lemlux SMD2835 LED lente 60LED/m Auksti Balta',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "SMD2835", "wattage": 4.8, "voltage": 12, "colorTemp": 6500, "lumens": 500, "ledCount": 60, "ip": "IP20", "lengthM": 5, "hex": "#F0F8FF", "sku": "LMX-2835-60CW-12"}'::jsonb),

('LED_STRIP', 'LEMLUX_2835_120_CW', 'Lemlux SMD2835 LED Strip 120LED/m Cold White', 'Lemlux SMD2835 LED лента 120LED/м Холодный Белый', 'Lemlux SMD2835 LED lente 120LED/m Auksti Balta',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "SMD2835", "wattage": 9.6, "voltage": 12, "colorTemp": 6500, "lumens": 1000, "ledCount": 120, "ip": "IP20", "lengthM": 5, "hex": "#F0F8FF", "sku": "LMX-2835-120CW-12"}'::jsonb);

-- ==========================================
-- LEMLUX RGB LED STRIPS
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
('LED_STRIP', 'LEMLUX_RGB_5050_30', 'Lemlux RGB LED Strip 5050 30LED/m', 'Lemlux RGB LED лента 5050 30LED/м', 'Lemlux RGB LED lente 5050 30LED/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "SMD5050", "wattage": 7.2, "voltage": 12, "ledCount": 30, "ip": "IP20", "lengthM": 5, "hex": "#FF0000", "rgb": true, "sku": "LMX-RGB-5050-30"}'::jsonb),

('LED_STRIP', 'LEMLUX_RGB_5050_60', 'Lemlux RGB LED Strip 5050 60LED/m', 'Lemlux RGB LED лента 5050 60LED/м', 'Lemlux RGB LED lente 5050 60LED/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "SMD5050", "wattage": 14.4, "voltage": 12, "ledCount": 60, "ip": "IP20", "lengthM": 5, "hex": "#FF0000", "rgb": true, "sku": "LMX-RGB-5050-60"}'::jsonb),

('LED_STRIP', 'LEMLUX_RGBW_5050_60', 'Lemlux RGBW LED Strip 5050 60LED/m', 'Lemlux RGBW LED лента 5050 60LED/м', 'Lemlux RGBW LED lente 5050 60LED/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "SMD5050", "wattage": 18, "voltage": 24, "ledCount": 60, "ip": "IP20", "lengthM": 5, "hex": "#FF0000", "rgb": true, "rgbw": true, "sku": "LMX-RGBW-5050-60"}'::jsonb),

('LED_STRIP', 'LEMLUX_RGB_5050_60_IP65', 'Lemlux RGB LED Strip 5050 60LED/m IP65', 'Lemlux RGB LED лента 5050 60LED/м IP65', 'Lemlux RGB LED lente 5050 60LED/m IP65',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "SMD5050", "wattage": 14.4, "voltage": 12, "ledCount": 60, "ip": "IP65", "lengthM": 5, "hex": "#FF0000", "rgb": true, "sku": "LMX-RGB-5050-60-IP65"}'::jsonb);

-- ==========================================
-- LEMLUX CCT (Tunable White) LED STRIPS
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
('LED_STRIP', 'LEMLUX_CCT_2835_120', 'Lemlux CCT LED Strip 2835 120LED/m', 'Lemlux CCT LED лента 2835 120LED/м', 'Lemlux CCT LED lente 2835 120LED/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "SMD2835", "wattage": 12, "voltage": 24, "colorTempRange": "2700-6500K", "lumens": 1100, "ledCount": 120, "ip": "IP20", "lengthM": 5, "hex": "#FFFAF0", "cct": true, "sku": "LMX-CCT-2835-120"}'::jsonb),

('LED_STRIP', 'LEMLUX_CCT_2835_240', 'Lemlux CCT LED Strip 2835 240LED/m', 'Lemlux CCT LED лента 2835 240LED/м', 'Lemlux CCT LED lente 2835 240LED/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "SMD2835", "wattage": 24, "voltage": 24, "colorTempRange": "2700-6500K", "lumens": 2200, "ledCount": 240, "ip": "IP20", "lengthM": 5, "hex": "#FFFAF0", "cct": true, "sku": "LMX-CCT-2835-240"}'::jsonb),

('LED_STRIP', 'LEMLUX_CCT_COB_10W', 'Lemlux CCT COB LED Strip 10W/m', 'Lemlux CCT COB LED лента 10W/м', 'Lemlux CCT COB LED lente 10W/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "COB", "wattage": 10, "voltage": 24, "colorTempRange": "2700-6500K", "lumens": 950, "ip": "IP20", "lengthM": 5, "hex": "#FFFAF0", "cct": true, "sku": "LMX-CCT-COB-10"}'::jsonb);

-- ==========================================
-- LEMLUX ADDRESSABLE LED STRIPS (WS2812B, WS2815)
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
('LED_STRIP', 'LEMLUX_WS2812B_30', 'Lemlux WS2812B Addressable 30LED/m', 'Lemlux WS2812B Адресная 30LED/м', 'Lemlux WS2812B Adresējama 30LED/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "WS2812B", "wattage": 9, "voltage": 5, "ledCount": 30, "ip": "IP20", "lengthM": 5, "hex": "#FF0000", "addressable": true, "sku": "LMX-WS2812B-30"}'::jsonb),

('LED_STRIP', 'LEMLUX_WS2812B_60', 'Lemlux WS2812B Addressable 60LED/m', 'Lemlux WS2812B Адресная 60LED/м', 'Lemlux WS2812B Adresējama 60LED/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "WS2812B", "wattage": 18, "voltage": 5, "ledCount": 60, "ip": "IP20", "lengthM": 5, "hex": "#FF0000", "addressable": true, "sku": "LMX-WS2812B-60"}'::jsonb),

('LED_STRIP', 'LEMLUX_WS2812B_144', 'Lemlux WS2812B Addressable 144LED/m', 'Lemlux WS2812B Адресная 144LED/м', 'Lemlux WS2812B Adresējama 144LED/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "WS2812B", "wattage": 43.2, "voltage": 5, "ledCount": 144, "ip": "IP20", "lengthM": 1, "hex": "#FF0000", "addressable": true, "sku": "LMX-WS2812B-144"}'::jsonb),

('LED_STRIP', 'LEMLUX_WS2815_30', 'Lemlux WS2815 Addressable 12V 30LED/m', 'Lemlux WS2815 Адресная 12V 30LED/м', 'Lemlux WS2815 Adresējama 12V 30LED/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "WS2815", "wattage": 9, "voltage": 12, "ledCount": 30, "ip": "IP20", "lengthM": 5, "hex": "#FF0000", "addressable": true, "sku": "LMX-WS2815-30"}'::jsonb),

('LED_STRIP', 'LEMLUX_WS2815_60', 'Lemlux WS2815 Addressable 12V 60LED/m', 'Lemlux WS2815 Адресная 12V 60LED/м', 'Lemlux WS2815 Adresējama 12V 60LED/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "WS2815", "wattage": 18, "voltage": 12, "ledCount": 60, "ip": "IP20", "lengthM": 5, "hex": "#FF0000", "addressable": true, "sku": "LMX-WS2815-60"}'::jsonb),

('LED_STRIP', 'LEMLUX_WS2815_144', 'Lemlux WS2815 Addressable 12V 144LED/m', 'Lemlux WS2815 Адресная 12V 144LED/м', 'Lemlux WS2815 Adresējama 12V 144LED/m',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "WS2815", "wattage": 43.2, "voltage": 12, "ledCount": 144, "ip": "IP20", "lengthM": 1, "hex": "#FF0000", "addressable": true, "sku": "LMX-WS2815-144"}'::jsonb),

-- Addressable IP65
('LED_STRIP', 'LEMLUX_WS2812B_60_IP65', 'Lemlux WS2812B Addressable 60LED/m IP65', 'Lemlux WS2812B Адресная 60LED/м IP65', 'Lemlux WS2812B Adresējama 60LED/m IP65',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "WS2812B", "wattage": 18, "voltage": 5, "ledCount": 60, "ip": "IP65", "lengthM": 5, "hex": "#FF0000", "addressable": true, "sku": "LMX-WS2812B-60-IP65"}'::jsonb),

('LED_STRIP', 'LEMLUX_WS2815_60_IP65', 'Lemlux WS2815 Addressable 12V 60LED/m IP65', 'Lemlux WS2815 Адресная 12V 60LED/м IP65', 'Lemlux WS2815 Adresējama 12V 60LED/m IP65',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "WS2815", "wattage": 18, "voltage": 12, "ledCount": 60, "ip": "IP65", "lengthM": 5, "hex": "#FF0000", "addressable": true, "sku": "LMX-WS2815-60-IP65"}'::jsonb);

-- ==========================================
-- LEMLUX NEON FLEX
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
('LED_STRIP', 'LEMLUX_NEON_W', 'Lemlux Neon Flex White', 'Lemlux Неон Флекс Белый', 'Lemlux Neon Flex Balts',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "NeonFlex", "wattage": 10, "voltage": 24, "colorTemp": 4000, "ip": "IP65", "lengthM": 5, "dimensions": "8x16mm", "hex": "#FFFFFF", "sku": "LMX-NEON-W"}'::jsonb),

('LED_STRIP', 'LEMLUX_NEON_WW', 'Lemlux Neon Flex Warm White', 'Lemlux Неон Флекс Тёплый Белый', 'Lemlux Neon Flex Silti Balts',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "NeonFlex", "wattage": 10, "voltage": 24, "colorTemp": 3000, "ip": "IP65", "lengthM": 5, "dimensions": "8x16mm", "hex": "#FFE4B5", "sku": "LMX-NEON-WW"}'::jsonb),

('LED_STRIP', 'LEMLUX_NEON_RED', 'Lemlux Neon Flex Red', 'Lemlux Неон Флекс Красный', 'Lemlux Neon Flex Sarkans',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "NeonFlex", "wattage": 10, "voltage": 24, "ip": "IP65", "lengthM": 5, "dimensions": "8x16mm", "hex": "#FF0000", "sku": "LMX-NEON-R"}'::jsonb),

('LED_STRIP', 'LEMLUX_NEON_GREEN', 'Lemlux Neon Flex Green', 'Lemlux Неон Флекс Зеленый', 'Lemlux Neon Flex Zaļš',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "NeonFlex", "wattage": 10, "voltage": 24, "ip": "IP65", "lengthM": 5, "dimensions": "8x16mm", "hex": "#00FF00", "sku": "LMX-NEON-G"}'::jsonb),

('LED_STRIP', 'LEMLUX_NEON_BLUE', 'Lemlux Neon Flex Blue', 'Lemlux Неон Флекс Синий', 'Lemlux Neon Flex Zils',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "NeonFlex", "wattage": 10, "voltage": 24, "ip": "IP65", "lengthM": 5, "dimensions": "8x16mm", "hex": "#0000FF", "sku": "LMX-NEON-B"}'::jsonb),

('LED_STRIP', 'LEMLUX_NEON_YELLOW', 'Lemlux Neon Flex Yellow', 'Lemlux Неон Флекс Желтый', 'Lemlux Neon Flex Dzeltens',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "NeonFlex", "wattage": 10, "voltage": 24, "ip": "IP65", "lengthM": 5, "dimensions": "8x16mm", "hex": "#FFFF00", "sku": "LMX-NEON-Y"}'::jsonb),

('LED_STRIP', 'LEMLUX_NEON_PINK', 'Lemlux Neon Flex Pink', 'Lemlux Неон Флекс Розовый', 'Lemlux Neon Flex Rozā',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "NeonFlex", "wattage": 10, "voltage": 24, "ip": "IP65", "lengthM": 5, "dimensions": "8x16mm", "hex": "#FF69B4", "sku": "LMX-NEON-P"}'::jsonb),

('LED_STRIP', 'LEMLUX_NEON_RGB', 'Lemlux Neon Flex RGB', 'Lemlux Неон Флекс RGB', 'Lemlux Neon Flex RGB',
 '[]'::jsonb,
 '{"brand": "Lemlux", "type": "NeonFlex", "wattage": 14, "voltage": 24, "ip": "IP65", "lengthM": 5, "dimensions": "8x16mm", "hex": "#FF0000", "rgb": true, "sku": "LMX-NEON-RGB"}'::jsonb);
