-- src/lib/server/db/seeds/013_3d_printing_materials.sql
-- 3D Printer Materials - Resins and FDM Filaments

-- ==========================================
-- ANYCUBIC RESINS
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
-- Anycubic Basic Resins
('RESIN_SLA', 'ANYCUBIC_BASIC_GREY', 'Anycubic Basic Resin Grey 1kg', 'Anycubic Базовая Смола Серая 1кг', 'Anycubic Pamata Sveķi Pelēki 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "basic", "volume": 1000, "unit": "ml", "cureTime": "8-15s", "wavelength": 405, "hex": "#808080", "sku": "AC-RES-BASIC-GRY"}'::jsonb),

('RESIN_SLA', 'ANYCUBIC_BASIC_WHITE', 'Anycubic Basic Resin White 1kg', 'Anycubic Базовая Смола Белая 1кг', 'Anycubic Pamata Sveķi Balti 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "basic", "volume": 1000, "unit": "ml", "cureTime": "8-15s", "wavelength": 405, "hex": "#FFFFFF", "sku": "AC-RES-BASIC-WHT"}'::jsonb),

('RESIN_SLA', 'ANYCUBIC_BASIC_BLACK', 'Anycubic Basic Resin Black 1kg', 'Anycubic Базовая Смола Черная 1кг', 'Anycubic Pamata Sveķi Melni 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "basic", "volume": 1000, "unit": "ml", "cureTime": "8-15s", "wavelength": 405, "hex": "#1C1C1C", "sku": "AC-RES-BASIC-BLK"}'::jsonb),

('RESIN_SLA', 'ANYCUBIC_BASIC_CLEAR', 'Anycubic Basic Resin Clear 1kg', 'Anycubic Базовая Смола Прозрачная 1кг', 'Anycubic Pamata Sveķi Caurspīdīgi 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "basic", "volume": 1000, "unit": "ml", "cureTime": "10-20s", "wavelength": 405, "hex": "#E8E8E8", "transparent": true, "sku": "AC-RES-BASIC-CLR"}'::jsonb),

('RESIN_SLA', 'ANYCUBIC_BASIC_GREEN', 'Anycubic Basic Resin Green 1kg', 'Anycubic Базовая Смола Зеленая 1кг', 'Anycubic Pamata Sveķi Zaļi 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "basic", "volume": 1000, "unit": "ml", "cureTime": "8-15s", "wavelength": 405, "hex": "#228B22", "sku": "AC-RES-BASIC-GRN"}'::jsonb),

('RESIN_SLA', 'ANYCUBIC_BASIC_BLUE', 'Anycubic Basic Resin Blue 1kg', 'Anycubic Базовая Смола Синяя 1кг', 'Anycubic Pamata Sveķi Zili 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "basic", "volume": 1000, "unit": "ml", "cureTime": "8-15s", "wavelength": 405, "hex": "#0047AB", "sku": "AC-RES-BASIC-BLU"}'::jsonb),

('RESIN_SLA', 'ANYCUBIC_BASIC_RED', 'Anycubic Basic Resin Red 1kg', 'Anycubic Базовая Смола Красная 1кг', 'Anycubic Pamata Sveķi Sarkani 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "basic", "volume": 1000, "unit": "ml", "cureTime": "8-15s", "wavelength": 405, "hex": "#DC143C", "sku": "AC-RES-BASIC-RED"}'::jsonb),

('RESIN_SLA', 'ANYCUBIC_BASIC_YELLOW', 'Anycubic Basic Resin Yellow 1kg', 'Anycubic Базовая Смола Желтая 1кг', 'Anycubic Pamata Sveķi Dzelteni 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "basic", "volume": 1000, "unit": "ml", "cureTime": "8-15s", "wavelength": 405, "hex": "#FFD700", "sku": "AC-RES-BASIC-YEL"}'::jsonb),

('RESIN_SLA', 'ANYCUBIC_BASIC_ORANGE', 'Anycubic Basic Resin Orange 1kg', 'Anycubic Базовая Смола Оранжевая 1кг', 'Anycubic Pamata Sveķi Oranži 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "basic", "volume": 1000, "unit": "ml", "cureTime": "8-15s", "wavelength": 405, "hex": "#FF8C00", "sku": "AC-RES-BASIC-ORG"}'::jsonb),

-- Anycubic Water-Washable Resins
('RESIN_SLA', 'ANYCUBIC_WW_GREY', 'Anycubic Water-Washable Resin Grey 1kg', 'Anycubic Водосмываемая Смола Серая 1кг', 'Anycubic Ūdens mazgājami Sveķi Pelēki 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "water_washable", "volume": 1000, "unit": "ml", "cureTime": "6-10s", "wavelength": 405, "hex": "#808080", "sku": "AC-RES-WW-GRY"}'::jsonb),

('RESIN_SLA', 'ANYCUBIC_WW_WHITE', 'Anycubic Water-Washable Resin White 1kg', 'Anycubic Водосмываемая Смола Белая 1кг', 'Anycubic Ūdens mazgājami Sveķi Balti 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "water_washable", "volume": 1000, "unit": "ml", "cureTime": "6-10s", "wavelength": 405, "hex": "#FFFFFF", "sku": "AC-RES-WW-WHT"}'::jsonb),

('RESIN_SLA', 'ANYCUBIC_WW_BLACK', 'Anycubic Water-Washable Resin Black 1kg', 'Anycubic Водосмываемая Смола Черная 1кг', 'Anycubic Ūdens mazgājami Sveķi Melni 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "water_washable", "volume": 1000, "unit": "ml", "cureTime": "6-10s", "wavelength": 405, "hex": "#1C1C1C", "sku": "AC-RES-WW-BLK"}'::jsonb),

('RESIN_SLA', 'ANYCUBIC_WW_CLEAR', 'Anycubic Water-Washable Resin Clear 1kg', 'Anycubic Водосмываемая Смола Прозрачная 1кг', 'Anycubic Ūdens mazgājami Sveķi Caurspīdīgi 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "water_washable", "volume": 1000, "unit": "ml", "cureTime": "8-12s", "wavelength": 405, "hex": "#E8E8E8", "transparent": true, "sku": "AC-RES-WW-CLR"}'::jsonb),

('RESIN_SLA', 'ANYCUBIC_WW_SKIN', 'Anycubic Water-Washable Resin Skin 1kg', 'Anycubic Водосмываемая Смола Телесный 1кг', 'Anycubic Ūdens mazgājami Sveķi Ādas 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "water_washable", "volume": 1000, "unit": "ml", "cureTime": "6-10s", "wavelength": 405, "hex": "#FFDAB9", "sku": "AC-RES-WW-SKN"}'::jsonb),

-- Anycubic ABS-Like Resins
('RESIN_SLA', 'ANYCUBIC_ABS_GREY', 'Anycubic ABS-Like Resin Grey 1kg', 'Anycubic ABS-подобная Смола Серая 1кг', 'Anycubic ABS līdzīgi Sveķi Pelēki 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "abs_like", "volume": 1000, "unit": "ml", "cureTime": "10-20s", "wavelength": 405, "hardness": "80D", "hex": "#808080", "sku": "AC-RES-ABS-GRY"}'::jsonb),

('RESIN_SLA', 'ANYCUBIC_ABS_WHITE', 'Anycubic ABS-Like Resin White 1kg', 'Anycubic ABS-подобная Смола Белая 1кг', 'Anycubic ABS līdzīgi Sveķi Balti 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "abs_like", "volume": 1000, "unit": "ml", "cureTime": "10-20s", "wavelength": 405, "hardness": "80D", "hex": "#FFFFFF", "sku": "AC-RES-ABS-WHT"}'::jsonb),

('RESIN_SLA', 'ANYCUBIC_ABS_BLACK', 'Anycubic ABS-Like Resin Black 1kg', 'Anycubic ABS-подобная Смола Черная 1кг', 'Anycubic ABS līdzīgi Sveķi Melni 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "abs_like", "volume": 1000, "unit": "ml", "cureTime": "10-20s", "wavelength": 405, "hardness": "80D", "hex": "#1C1C1C", "sku": "AC-RES-ABS-BLK"}'::jsonb),

-- Anycubic Tough Resins
('RESIN_SLA', 'ANYCUBIC_TOUGH_GREY', 'Anycubic Tough Resin Grey 1kg', 'Anycubic Прочная Смола Серая 1кг', 'Anycubic Izturīgi Sveķi Pelēki 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "tough", "volume": 1000, "unit": "ml", "cureTime": "15-25s", "wavelength": 405, "impactResistance": "high", "hex": "#808080", "sku": "AC-RES-TGH-GRY"}'::jsonb),

('RESIN_SLA', 'ANYCUBIC_TOUGH_BLACK', 'Anycubic Tough Resin Black 1kg', 'Anycubic Прочная Смола Черная 1кг', 'Anycubic Izturīgi Sveķi Melni 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "tough", "volume": 1000, "unit": "ml", "cureTime": "15-25s", "wavelength": 405, "impactResistance": "high", "hex": "#1C1C1C", "sku": "AC-RES-TGH-BLK"}'::jsonb),

-- Anycubic Flex Resins
('RESIN_SLA', 'ANYCUBIC_FLEX_BLACK', 'Anycubic Flexible Resin Black 500g', 'Anycubic Гибкая Смола Черная 500г', 'Anycubic Elastīgi Sveķi Melni 500g',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "flexible", "volume": 500, "unit": "ml", "cureTime": "30-60s", "wavelength": 405, "shoreHardness": "80A", "hex": "#1C1C1C", "sku": "AC-RES-FLX-BLK"}'::jsonb),

('RESIN_SLA', 'ANYCUBIC_FLEX_CLEAR', 'Anycubic Flexible Resin Clear 500g', 'Anycubic Гибкая Смола Прозрачная 500г', 'Anycubic Elastīgi Sveķi Caurspīdīgi 500g',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "flexible", "volume": 500, "unit": "ml", "cureTime": "30-60s", "wavelength": 405, "shoreHardness": "80A", "hex": "#E8E8E8", "transparent": true, "sku": "AC-RES-FLX-CLR"}'::jsonb),

-- Anycubic Plant-Based Resins
('RESIN_SLA', 'ANYCUBIC_PLANT_GREY', 'Anycubic Plant-Based Resin Grey 1kg', 'Anycubic Растительная Смола Серая 1кг', 'Anycubic Augu Sveķi Pelēki 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "plant_based", "volume": 1000, "unit": "ml", "cureTime": "8-15s", "wavelength": 405, "eco": true, "lowOdor": true, "hex": "#808080", "sku": "AC-RES-PLT-GRY"}'::jsonb),

('RESIN_SLA', 'ANYCUBIC_PLANT_WHITE', 'Anycubic Plant-Based Resin White 1kg', 'Anycubic Растительная Смола Белая 1кг', 'Anycubic Augu Sveķi Balti 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "plant_based", "volume": 1000, "unit": "ml", "cureTime": "8-15s", "wavelength": 405, "eco": true, "lowOdor": true, "hex": "#FFFFFF", "sku": "AC-RES-PLT-WHT"}'::jsonb),

-- Anycubic High Clear Resin
('RESIN_SLA', 'ANYCUBIC_HICLEAR', 'Anycubic High Clear Resin 1kg', 'Anycubic Высокопрозрачная Смола 1кг', 'Anycubic Augsti Caurspīdīgi Sveķi 1kg',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "high_clear", "volume": 1000, "unit": "ml", "cureTime": "15-25s", "wavelength": 405, "transmittance": "95%", "hex": "#FAFAFA", "transparent": true, "sku": "AC-RES-HICL"}'::jsonb),

-- Anycubic Castable Resin
('RESIN_SLA', 'ANYCUBIC_CAST_GREEN', 'Anycubic Castable Resin Green 500g', 'Anycubic Литейная Смола Зеленая 500г', 'Anycubic Liešanas Sveķi Zaļi 500g',
 '[]'::jsonb,
 '{"brand": "Anycubic", "type": "castable", "volume": 500, "unit": "ml", "cureTime": "20-30s", "wavelength": 405, "burnoutTemp": 700, "hex": "#228B22", "sku": "AC-RES-CST-GRN"}'::jsonb);

-- ==========================================
-- ELEGOO RESINS
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
('RESIN_SLA', 'ELEGOO_STD_GREY', 'Elegoo Standard Resin Grey 1kg', 'Elegoo Стандартная Смола Серая 1кг', 'Elegoo Standarta Sveķi Pelēki 1kg',
 '[]'::jsonb,
 '{"brand": "Elegoo", "type": "standard", "volume": 1000, "unit": "ml", "cureTime": "8-15s", "wavelength": 405, "hex": "#808080", "sku": "EL-RES-STD-GRY"}'::jsonb),

('RESIN_SLA', 'ELEGOO_STD_WHITE', 'Elegoo Standard Resin White 1kg', 'Elegoo Стандартная Смола Белая 1кг', 'Elegoo Standarta Sveķi Balti 1kg',
 '[]'::jsonb,
 '{"brand": "Elegoo", "type": "standard", "volume": 1000, "unit": "ml", "cureTime": "8-15s", "wavelength": 405, "hex": "#FFFFFF", "sku": "EL-RES-STD-WHT"}'::jsonb),

('RESIN_SLA', 'ELEGOO_STD_BLACK', 'Elegoo Standard Resin Black 1kg', 'Elegoo Стандартная Смола Черная 1кг', 'Elegoo Standarta Sveķi Melni 1kg',
 '[]'::jsonb,
 '{"brand": "Elegoo", "type": "standard", "volume": 1000, "unit": "ml", "cureTime": "8-15s", "wavelength": 405, "hex": "#1C1C1C", "sku": "EL-RES-STD-BLK"}'::jsonb),

('RESIN_SLA', 'ELEGOO_WW_GREY', 'Elegoo Water-Washable Resin Grey 1kg', 'Elegoo Водосмываемая Смола Серая 1кг', 'Elegoo Ūdens mazgājami Sveķi Pelēki 1kg',
 '[]'::jsonb,
 '{"brand": "Elegoo", "type": "water_washable", "volume": 1000, "unit": "ml", "cureTime": "6-10s", "wavelength": 405, "hex": "#808080", "sku": "EL-RES-WW-GRY"}'::jsonb),

('RESIN_SLA', 'ELEGOO_ABS_GREY', 'Elegoo ABS-Like Resin Grey 1kg', 'Elegoo ABS-подобная Смола Серая 1кг', 'Elegoo ABS līdzīgi Sveķi Pelēki 1kg',
 '[]'::jsonb,
 '{"brand": "Elegoo", "type": "abs_like", "volume": 1000, "unit": "ml", "cureTime": "10-20s", "wavelength": 405, "hex": "#808080", "sku": "EL-RES-ABS-GRY"}'::jsonb);

-- ==========================================
-- SPECTRUM FDM FILAMENTS
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
-- Spectrum PLA
('FILAMENT_FDM', 'SPECTRUM_PLA_WHITE', 'Spectrum PLA Polar White 1kg', 'Spectrum PLA Полярный Белый 1кг', 'Spectrum PLA Polāri Balts 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "185-215", "bedTemp": "50-60", "hex": "#FFFFFF", "sku": "SP-PLA-WHT"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_PLA_BLACK', 'Spectrum PLA Deep Black 1kg', 'Spectrum PLA Глубокий Черный 1кг', 'Spectrum PLA Dziļi Melns 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "185-215", "bedTemp": "50-60", "hex": "#1C1C1C", "sku": "SP-PLA-BLK"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_PLA_GREY', 'Spectrum PLA Dark Grey 1kg', 'Spectrum PLA Темно-Серый 1кг', 'Spectrum PLA Tumši Pelēks 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "185-215", "bedTemp": "50-60", "hex": "#505050", "sku": "SP-PLA-GRY"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_PLA_RED', 'Spectrum PLA Bloody Red 1kg', 'Spectrum PLA Кровавый Красный 1кг', 'Spectrum PLA Asiņains Sarkans 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "185-215", "bedTemp": "50-60", "hex": "#8B0000", "sku": "SP-PLA-RED"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_PLA_BLUE', 'Spectrum PLA Pacific Blue 1kg', 'Spectrum PLA Тихоокеанский Синий 1кг', 'Spectrum PLA Klusā okeāna Zils 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "185-215", "bedTemp": "50-60", "hex": "#1E90FF", "sku": "SP-PLA-BLU"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_PLA_GREEN', 'Spectrum PLA Lime Green 1kg', 'Spectrum PLA Лаймовый Зеленый 1кг', 'Spectrum PLA Laima Zaļš 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "185-215", "bedTemp": "50-60", "hex": "#32CD32", "sku": "SP-PLA-GRN"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_PLA_YELLOW', 'Spectrum PLA Bahama Yellow 1kg', 'Spectrum PLA Багамский Желтый 1кг', 'Spectrum PLA Bahamu Dzeltens 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "185-215", "bedTemp": "50-60", "hex": "#FFD700", "sku": "SP-PLA-YEL"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_PLA_ORANGE', 'Spectrum PLA Lion Orange 1kg', 'Spectrum PLA Львиный Оранжевый 1кг', 'Spectrum PLA Lauvas Oranžs 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "185-215", "bedTemp": "50-60", "hex": "#FF8C00", "sku": "SP-PLA-ORG"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_PLA_PINK', 'Spectrum PLA Pink Panther 1kg', 'Spectrum PLA Розовая Пантера 1кг', 'Spectrum PLA Rozā Pantera 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "185-215", "bedTemp": "50-60", "hex": "#FF69B4", "sku": "SP-PLA-PNK"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_PLA_SILVER', 'Spectrum PLA Silver Metallic 1kg', 'Spectrum PLA Серебряный Металлик 1кг', 'Spectrum PLA Sudraba Metālisks 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "185-215", "bedTemp": "50-60", "hex": "#C0C0C0", "metallic": true, "sku": "SP-PLA-SLV"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_PLA_GOLD', 'Spectrum PLA Gold Metallic 1kg', 'Spectrum PLA Золотой Металлик 1кг', 'Spectrum PLA Zelta Metālisks 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "185-215", "bedTemp": "50-60", "hex": "#FFD700", "metallic": true, "sku": "SP-PLA-GLD"}'::jsonb),

-- Spectrum PETG
('FILAMENT_FDM', 'SPECTRUM_PETG_WHITE', 'Spectrum PETG Arctic White 1kg', 'Spectrum PETG Арктический Белый 1кг', 'Spectrum PETG Arktiskais Balts 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PETG", "diameter": 1.75, "weight": 1000, "printTemp": "220-250", "bedTemp": "70-90", "hex": "#FFFFFF", "sku": "SP-PETG-WHT"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_PETG_BLACK', 'Spectrum PETG Deep Black 1kg', 'Spectrum PETG Глубокий Черный 1кг', 'Spectrum PETG Dziļi Melns 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PETG", "diameter": 1.75, "weight": 1000, "printTemp": "220-250", "bedTemp": "70-90", "hex": "#1C1C1C", "sku": "SP-PETG-BLK"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_PETG_GREY', 'Spectrum PETG Iron Grey 1kg', 'Spectrum PETG Железный Серый 1кг', 'Spectrum PETG Dzelzs Pelēks 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PETG", "diameter": 1.75, "weight": 1000, "printTemp": "220-250", "bedTemp": "70-90", "hex": "#505050", "sku": "SP-PETG-GRY"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_PETG_CLEAR', 'Spectrum PETG Glassy Clear 1kg', 'Spectrum PETG Стеклянный Прозрачный 1кг', 'Spectrum PETG Stikla Caurspīdīgs 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PETG", "diameter": 1.75, "weight": 1000, "printTemp": "220-250", "bedTemp": "70-90", "hex": "#E8E8E8", "transparent": true, "sku": "SP-PETG-CLR"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_PETG_RED', 'Spectrum PETG Transparent Red 1kg', 'Spectrum PETG Прозрачный Красный 1кг', 'Spectrum PETG Caurspīdīgs Sarkans 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PETG", "diameter": 1.75, "weight": 1000, "printTemp": "220-250", "bedTemp": "70-90", "hex": "#DC143C", "transparent": true, "sku": "SP-PETG-RED"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_PETG_BLUE', 'Spectrum PETG Transparent Blue 1kg', 'Spectrum PETG Прозрачный Синий 1кг', 'Spectrum PETG Caurspīdīgs Zils 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PETG", "diameter": 1.75, "weight": 1000, "printTemp": "220-250", "bedTemp": "70-90", "hex": "#0047AB", "transparent": true, "sku": "SP-PETG-BLU"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_PETG_GREEN', 'Spectrum PETG Transparent Green 1kg', 'Spectrum PETG Прозрачный Зеленый 1кг', 'Spectrum PETG Caurspīdīgs Zaļš 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "PETG", "diameter": 1.75, "weight": 1000, "printTemp": "220-250", "bedTemp": "70-90", "hex": "#228B22", "transparent": true, "sku": "SP-PETG-GRN"}'::jsonb),

-- Spectrum ASA
('FILAMENT_FDM', 'SPECTRUM_ASA_WHITE', 'Spectrum ASA Polar White 1kg', 'Spectrum ASA Полярный Белый 1кг', 'Spectrum ASA Polāri Balts 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "ASA", "diameter": 1.75, "weight": 1000, "printTemp": "235-255", "bedTemp": "90-110", "uvResistant": true, "hex": "#FFFFFF", "sku": "SP-ASA-WHT"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_ASA_BLACK', 'Spectrum ASA Deep Black 1kg', 'Spectrum ASA Глубокий Черный 1кг', 'Spectrum ASA Dziļi Melns 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "ASA", "diameter": 1.75, "weight": 1000, "printTemp": "235-255", "bedTemp": "90-110", "uvResistant": true, "hex": "#1C1C1C", "sku": "SP-ASA-BLK"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_ASA_GREY', 'Spectrum ASA Silver Star 1kg', 'Spectrum ASA Серебряная Звезда 1кг', 'Spectrum ASA Sudraba Zvaigzne 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "ASA", "diameter": 1.75, "weight": 1000, "printTemp": "235-255", "bedTemp": "90-110", "uvResistant": true, "hex": "#808080", "sku": "SP-ASA-GRY"}'::jsonb),

-- Spectrum ABS
('FILAMENT_FDM', 'SPECTRUM_ABS_WHITE', 'Spectrum ABS Polar White 1kg', 'Spectrum ABS Полярный Белый 1кг', 'Spectrum ABS Polāri Balts 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "ABS", "diameter": 1.75, "weight": 1000, "printTemp": "230-250", "bedTemp": "90-110", "hex": "#FFFFFF", "sku": "SP-ABS-WHT"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_ABS_BLACK', 'Spectrum ABS Deep Black 1kg', 'Spectrum ABS Глубокий Черный 1кг', 'Spectrum ABS Dziļi Melns 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "ABS", "diameter": 1.75, "weight": 1000, "printTemp": "230-250", "bedTemp": "90-110", "hex": "#1C1C1C", "sku": "SP-ABS-BLK"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_ABS_GREY', 'Spectrum ABS Dark Grey 1kg', 'Spectrum ABS Темно-Серый 1кг', 'Spectrum ABS Tumši Pelēks 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "ABS", "diameter": 1.75, "weight": 1000, "printTemp": "230-250", "bedTemp": "90-110", "hex": "#505050", "sku": "SP-ABS-GRY"}'::jsonb),

('FILAMENT_FDM', 'SPECTRUM_ABS_RED', 'Spectrum ABS Dragon Red 1kg', 'Spectrum ABS Драконий Красный 1кг', 'Spectrum ABS Pūķa Sarkans 1kg',
 '[]'::jsonb,
 '{"brand": "Spectrum", "material": "ABS", "diameter": 1.75, "weight": 1000, "printTemp": "230-250", "bedTemp": "90-110", "hex": "#DC143C", "sku": "SP-ABS-RED"}'::jsonb);

-- ==========================================
-- CREALITY FDM FILAMENTS
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
-- Creality Ender PLA
('FILAMENT_FDM', 'CREALITY_PLA_WHITE', 'Creality Ender PLA White 1kg', 'Creality Ender PLA Белый 1кг', 'Creality Ender PLA Balts 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "series": "Ender", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "190-220", "bedTemp": "45-60", "hex": "#FFFFFF", "sku": "CR-PLA-WHT"}'::jsonb),

('FILAMENT_FDM', 'CREALITY_PLA_BLACK', 'Creality Ender PLA Black 1kg', 'Creality Ender PLA Черный 1кг', 'Creality Ender PLA Melns 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "series": "Ender", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "190-220", "bedTemp": "45-60", "hex": "#1C1C1C", "sku": "CR-PLA-BLK"}'::jsonb),

('FILAMENT_FDM', 'CREALITY_PLA_GREY', 'Creality Ender PLA Grey 1kg', 'Creality Ender PLA Серый 1кг', 'Creality Ender PLA Pelēks 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "series": "Ender", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "190-220", "bedTemp": "45-60", "hex": "#808080", "sku": "CR-PLA-GRY"}'::jsonb),

('FILAMENT_FDM', 'CREALITY_PLA_RED', 'Creality Ender PLA Red 1kg', 'Creality Ender PLA Красный 1кг', 'Creality Ender PLA Sarkans 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "series": "Ender", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "190-220", "bedTemp": "45-60", "hex": "#DC143C", "sku": "CR-PLA-RED"}'::jsonb),

('FILAMENT_FDM', 'CREALITY_PLA_BLUE', 'Creality Ender PLA Blue 1kg', 'Creality Ender PLA Синий 1кг', 'Creality Ender PLA Zils 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "series": "Ender", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "190-220", "bedTemp": "45-60", "hex": "#0047AB", "sku": "CR-PLA-BLU"}'::jsonb),

('FILAMENT_FDM', 'CREALITY_PLA_GREEN', 'Creality Ender PLA Green 1kg', 'Creality Ender PLA Зеленый 1кг', 'Creality Ender PLA Zaļš 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "series": "Ender", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "190-220", "bedTemp": "45-60", "hex": "#228B22", "sku": "CR-PLA-GRN"}'::jsonb),

('FILAMENT_FDM', 'CREALITY_PLA_YELLOW', 'Creality Ender PLA Yellow 1kg', 'Creality Ender PLA Желтый 1кг', 'Creality Ender PLA Dzeltens 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "series": "Ender", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "190-220", "bedTemp": "45-60", "hex": "#FFD700", "sku": "CR-PLA-YEL"}'::jsonb),

('FILAMENT_FDM', 'CREALITY_PLA_ORANGE', 'Creality Ender PLA Orange 1kg', 'Creality Ender PLA Оранжевый 1кг', 'Creality Ender PLA Oranžs 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "series": "Ender", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "190-220", "bedTemp": "45-60", "hex": "#FF8C00", "sku": "CR-PLA-ORG"}'::jsonb),

-- Creality Hyper PLA (High Speed)
('FILAMENT_FDM', 'CREALITY_HYPER_WHITE', 'Creality Hyper PLA White 1kg', 'Creality Hyper PLA Белый 1кг', 'Creality Hyper PLA Balts 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "series": "Hyper", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "190-230", "bedTemp": "45-60", "highSpeed": true, "hex": "#FFFFFF", "sku": "CR-HYPER-WHT"}'::jsonb),

('FILAMENT_FDM', 'CREALITY_HYPER_BLACK', 'Creality Hyper PLA Black 1kg', 'Creality Hyper PLA Черный 1кг', 'Creality Hyper PLA Melns 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "series": "Hyper", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "190-230", "bedTemp": "45-60", "highSpeed": true, "hex": "#1C1C1C", "sku": "CR-HYPER-BLK"}'::jsonb),

('FILAMENT_FDM', 'CREALITY_HYPER_GREY', 'Creality Hyper PLA Grey 1kg', 'Creality Hyper PLA Серый 1кг', 'Creality Hyper PLA Pelēks 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "series": "Hyper", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "190-230", "bedTemp": "45-60", "highSpeed": true, "hex": "#808080", "sku": "CR-HYPER-GRY"}'::jsonb),

-- Creality PETG
('FILAMENT_FDM', 'CREALITY_PETG_WHITE', 'Creality PETG White 1kg', 'Creality PETG Белый 1кг', 'Creality PETG Balts 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "material": "PETG", "diameter": 1.75, "weight": 1000, "printTemp": "220-250", "bedTemp": "70-80", "hex": "#FFFFFF", "sku": "CR-PETG-WHT"}'::jsonb),

('FILAMENT_FDM', 'CREALITY_PETG_BLACK', 'Creality PETG Black 1kg', 'Creality PETG Черный 1кг', 'Creality PETG Melns 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "material": "PETG", "diameter": 1.75, "weight": 1000, "printTemp": "220-250", "bedTemp": "70-80", "hex": "#1C1C1C", "sku": "CR-PETG-BLK"}'::jsonb),

('FILAMENT_FDM', 'CREALITY_PETG_CLEAR', 'Creality PETG Transparent 1kg', 'Creality PETG Прозрачный 1кг', 'Creality PETG Caurspīdīgs 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "material": "PETG", "diameter": 1.75, "weight": 1000, "printTemp": "220-250", "bedTemp": "70-80", "hex": "#E8E8E8", "transparent": true, "sku": "CR-PETG-CLR"}'::jsonb),

-- Creality ABS
('FILAMENT_FDM', 'CREALITY_ABS_WHITE', 'Creality ABS White 1kg', 'Creality ABS Белый 1кг', 'Creality ABS Balts 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "material": "ABS", "diameter": 1.75, "weight": 1000, "printTemp": "230-250", "bedTemp": "90-110", "hex": "#FFFFFF", "sku": "CR-ABS-WHT"}'::jsonb),

('FILAMENT_FDM', 'CREALITY_ABS_BLACK', 'Creality ABS Black 1kg', 'Creality ABS Черный 1кг', 'Creality ABS Melns 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "material": "ABS", "diameter": 1.75, "weight": 1000, "printTemp": "230-250", "bedTemp": "90-110", "hex": "#1C1C1C", "sku": "CR-ABS-BLK"}'::jsonb),

-- Creality TPU
('FILAMENT_FDM', 'CREALITY_TPU_WHITE', 'Creality TPU Flexible White 1kg', 'Creality TPU Гибкий Белый 1кг', 'Creality TPU Elastīgs Balts 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "material": "TPU", "diameter": 1.75, "weight": 1000, "printTemp": "210-230", "bedTemp": "30-60", "shoreHardness": "95A", "flexible": true, "hex": "#FFFFFF", "sku": "CR-TPU-WHT"}'::jsonb),

('FILAMENT_FDM', 'CREALITY_TPU_BLACK', 'Creality TPU Flexible Black 1kg', 'Creality TPU Гибкий Черный 1кг', 'Creality TPU Elastīgs Melns 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "material": "TPU", "diameter": 1.75, "weight": 1000, "printTemp": "210-230", "bedTemp": "30-60", "shoreHardness": "95A", "flexible": true, "hex": "#1C1C1C", "sku": "CR-TPU-BLK"}'::jsonb),

-- Creality Silk PLA
('FILAMENT_FDM', 'CREALITY_SILK_GOLD', 'Creality Silk PLA Gold 1kg', 'Creality Silk PLA Золотой 1кг', 'Creality Silk PLA Zelta 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "series": "Silk", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "190-220", "bedTemp": "45-60", "silky": true, "hex": "#FFD700", "sku": "CR-SILK-GLD"}'::jsonb),

('FILAMENT_FDM', 'CREALITY_SILK_SILVER', 'Creality Silk PLA Silver 1kg', 'Creality Silk PLA Серебряный 1кг', 'Creality Silk PLA Sudraba 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "series": "Silk", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "190-220", "bedTemp": "45-60", "silky": true, "hex": "#C0C0C0", "sku": "CR-SILK-SLV"}'::jsonb),

('FILAMENT_FDM', 'CREALITY_SILK_COPPER', 'Creality Silk PLA Copper 1kg', 'Creality Silk PLA Медный 1кг', 'Creality Silk PLA Vara 1kg',
 '[]'::jsonb,
 '{"brand": "Creality", "series": "Silk", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "190-220", "bedTemp": "45-60", "silky": true, "hex": "#B87333", "sku": "CR-SILK-CPR"}'::jsonb);

-- ==========================================
-- PRUSAMENT FDM FILAMENTS
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
('FILAMENT_FDM', 'PRUSAMENT_PLA_GALAXY_BLACK', 'Prusament PLA Galaxy Black 1kg', 'Prusament PLA Галактика Черная 1кг', 'Prusament PLA Galaktika Melna 1kg',
 '[]'::jsonb,
 '{"brand": "Prusament", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "215", "bedTemp": "55", "premium": true, "hex": "#1C1C1C", "sku": "PRM-PLA-GBLK"}'::jsonb),

('FILAMENT_FDM', 'PRUSAMENT_PLA_PRUSA_ORANGE', 'Prusament PLA Prusa Orange 1kg', 'Prusament PLA Prusa Оранжевый 1кг', 'Prusament PLA Prusa Oranžs 1kg',
 '[]'::jsonb,
 '{"brand": "Prusament", "material": "PLA", "diameter": 1.75, "weight": 1000, "printTemp": "215", "bedTemp": "55", "premium": true, "hex": "#FF5722", "sku": "PRM-PLA-ORG"}'::jsonb),

('FILAMENT_FDM', 'PRUSAMENT_PETG_PRUSA_ORANGE', 'Prusament PETG Prusa Orange 1kg', 'Prusament PETG Prusa Оранжевый 1кг', 'Prusament PETG Prusa Oranžs 1kg',
 '[]'::jsonb,
 '{"brand": "Prusament", "material": "PETG", "diameter": 1.75, "weight": 1000, "printTemp": "250", "bedTemp": "85", "premium": true, "hex": "#FF5722", "sku": "PRM-PETG-ORG"}'::jsonb),

('FILAMENT_FDM', 'PRUSAMENT_PETG_JET_BLACK', 'Prusament PETG Jet Black 1kg', 'Prusament PETG Реактивный Черный 1кг', 'Prusament PETG Reaktīvais Melns 1kg',
 '[]'::jsonb,
 '{"brand": "Prusament", "material": "PETG", "diameter": 1.75, "weight": 1000, "printTemp": "250", "bedTemp": "85", "premium": true, "hex": "#1C1C1C", "sku": "PRM-PETG-BLK"}'::jsonb);
