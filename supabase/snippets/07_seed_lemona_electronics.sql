-- Lemona.lv & Extended Proplastik Catalogue Import
-- Categories: LED Modules, LED Strips, PSU, Cables, Aluminum Profiles

INSERT INTO public.materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata)
VALUES 

-- ==========================================
-- 1. LED MODULES (Lemona / Proplastik)
-- ==========================================

-- Standard White Module
('Electronics', 'LED_MOD_WHITE_3SMD', 'LED Module 3-SMD White 1.2W', 'Светодиодный Модуль Белый 3-SMD', 'LED Modulis Balts 3-SMD', '[]', 
'{"brand": "BaltLED", "series": "Crown", "voltage": "12V", "power": "1.2W", "colorTemp": "6500K", "ipRating": "IP67", "beamAngle": "160", "lumens": "120lm", "applications": ["Lightboxes", "Channel Letters"]}'),

-- Mini Module
('Electronics', 'LED_MOD_MINI_WHITE', 'LED Module Mini 1-SMD White 0.4W', 'Мини-модуль LED Белый', 'LED Mini Modulis Balts', '[]', 
'{"brand": "Rishang", "series": "Mini", "voltage": "12V", "power": "0.4W", "colorTemp": "6500K", "ipRating": "IP65", "applications": ["Small letters", "Thin strokes"]}'),

-- RGB Module
('Electronics', 'LED_MOD_RGB_3SMD', 'LED Module RGB 3-SMD 0.72W', 'RGB Модуль 3-SMD', 'LED RGB Modulis', '[]', 
'{"brand": "BaltLED", "series": "Crown RGB", "voltage": "12V", "power": "0.72W", "type": "RGB", "control": "PWM", "ipRating": "IP67", "applications": ["Dynamic signage", "Color changing"]}'),


-- ==========================================
-- 2. LED STRIPS (Lemona)
-- ==========================================

-- Standard Strip
('Electronics', 'LED_STRIP_2835_60', 'LED Strip 2835 60LED/m 4.8W', 'LED Лента 60д/м 4.8Вт', 'LED Lente 60led/m 4.8W', '[]', 
'{"brand": "Lemlux", "voltage": "12V", "power": "4.8W/m", "colorTemp": "4000K/6000K", "ipRating": "IP20", "width": "8mm", "rollLength": "5m", "applications": ["Interior", "Cove lighting"]}'),

-- High Power Strip
('Electronics', 'LED_STRIP_2835_120', 'LED Strip 2835 120LED/m 9.6W', 'LED Лента 120д/м 9.6Вт', 'LED Lente 120led/m 9.6W', '[]', 
'{"brand": "Lemlux", "voltage": "12V", "power": "9.6W/m", "colorTemp": "6000K", "ipRating": "IP20", "width": "8mm", "rollLength": "5m", "applications": ["Bright illumination", "Slim lightboxes"]}'),

-- Waterproof Strip
('Electronics', 'LED_STRIP_IP65', 'LED Strip IP65 Waterproof 9.6W', 'Влагостойкая LED Лента', 'Mitrumizturīga LED Lente', '[]', 
'{"brand": "Lemlux", "voltage": "12V", "power": "9.6W/m", "ipRating": "IP65", "coating": "Silicone", "applications": ["Outdoor", "Bathroom", "Kitchen"]}'),

-- Neon Flex
('Electronics', 'LED_NEON_FLEX_WHITE', 'LED Neon Flex 6x12mm White', 'LED Неон Флекс Белый', 'LED Neon Flex Balts', '[]', 
'{"brand": "Generic", "voltage": "12V", "power": "8W/m", "dimensions": "6x12mm", "cutStep": "25mm", "ipRating": "IP67", "applications": ["Neon signs", "Contour lighting"]}'),


-- ==========================================
-- 3. POWER SUPPLY UNITS (PSU) - Mean Well
-- ==========================================

-- LPV Series (Waterproof Plastic)
('Electronics', 'PSU_MW_LPV_35', 'Mean Well LPV-35-12 (35W)', 'Блок Питания 35Вт IP67', 'Barošanas Bloks 35W IP67', '[]', 
'{"brand": "Mean Well", "series": "LPV", "voltage": "12V", "power": "35W", "ipRating": "IP67", "dimmable": false, "applications": ["Outdoor signage", "LED modules"]}'),

('Electronics', 'PSU_MW_LPV_60', 'Mean Well LPV-60-12 (60W)', 'Блок Питания 60Вт IP67', 'Barošanas Bloks 60W IP67', '[]', 
'{"brand": "Mean Well", "series": "LPV", "voltage": "12V", "power": "60W", "ipRating": "IP67", "dimmable": false, "applications": ["Outdoor signage"]}'),

('Electronics', 'PSU_MW_LPV_100', 'Mean Well LPV-100-12 (100W)', 'Блок Питания 100Вт IP67', 'Barošanas Bloks 100W IP67', '[]', 
'{"brand": "Mean Well", "series": "LPV", "voltage": "12V", "power": "100W", "ipRating": "IP67", "dimmable": false, "applications": ["Large signage"]}'),

-- XLG Series (Metal Metal)
('Electronics', 'PSU_MW_XLG_150', 'Mean Well XLG-150-12 (150W)', 'Блок Питания 150Вт Металл', 'Barošanas Bloks 150W Metāla', '[]', 
'{"brand": "Mean Well", "series": "XLG", "voltage": "12V", "power": "150W", "ipRating": "IP67", "casing": "Metal", "warranty": "5 years", "applications": ["Industrial", "Heavy duty"]}'),

-- Slim/Indoor
('Electronics', 'PSU_SLIM_60', 'Slim PSU 60W Indoor', 'Тонкий Блок Питания 60Вт', 'Plānais Barošanas Bloks 60W', '[]', 
'{"brand": "Generic", "series": "Slim", "voltage": "12V", "power": "60W", "ipRating": "IP20", "cooling": "Passive", "applications": ["Interior boxes", "Furniture"]}'),


-- ==========================================
-- 4. CABLES & WIRING
-- ==========================================

-- 2-Core Cable
('Electronics', 'CABLE_2X0_5', 'Cable 2x0.5mm² Round Black', 'Кабель 2х0.5мм Круглый', 'Kabelis 2x0.5mm² Apaļš', '[]', 
'{"brand": "Generic", "type": "Power", "cores": 2, "crossSection": "0.5mm2", "color": "Black", "voltageRating": "300V", "applications": ["LED wiring", "Low voltage"]}'),

('Electronics', 'CABLE_2X0_75', 'Cable 2x0.75mm² Round White', 'Кабель 2х0.75мм Белый', 'Kabelis 2x0.75mm² Balts', '[]', 
'{"brand": "Generic", "type": "Power", "cores": 2, "crossSection": "0.75mm2", "color": "White", "voltageRating": "300V", "applications": ["LED wiring"]}'),

-- RGB Cable
('Electronics', 'CABLE_RGB_4X0_35', 'RGB Cable 4x0.35mm² Flat', 'Кабель RGB 4-жильный', 'RGB Kabelis 4 dzīslu', '[]', 
'{"brand": "Generic", "type": "RGB Control", "cores": 4, "crossSection": "0.35mm2", "colors": ["Red", "Green", "Blue", "Black"], "applications": ["RGB Strips"]}'),

-- Mains Cable
('Electronics', 'CABLE_3X1_5', 'Mains Cable 3x1.5mm² White', 'Сетевой Кабель 3х1.5мм', 'Strāvas Kabelis 3x1.5mm', '[]', 
'{"brand": "Generic", "type": "Mains", "cores": 3, "crossSection": "1.5mm2", "rating": "230V", "applications": ["Power input", "Installation"]}'),


-- ==========================================
-- 5. ALUMINUM TUBING & PROFILES
-- ==========================================

-- Box Section (Square Tube)
('Metals', 'ALU_TUBE_20X20', 'Alu Square Tube 20x20x1.5mm', 'Алюминиевая Труба 20х20', 'Alumīnija Kvadrātcaurule 20x20', '[]', 
'{"alloy": "6060", "finish": "mill", "type": "square_tube", "dimensions": "20x20mm", "wall": "1.5mm", "length": "6000mm", "applications": ["Frames", "Sub-structures"]}'),

('Metals', 'ALU_TUBE_30X30', 'Alu Square Tube 30x30x2mm', 'Алюминиевая Труба 30х30', 'Alumīnija Kvadrātcaurule 30x30', '[]', 
'{"alloy": "6060", "finish": "mill", "type": "square_tube", "dimensions": "30x30mm", "wall": "2mm", "length": "6000mm", "applications": ["Heavy frames", "Pylons"]}'),

('Metals', 'ALU_TUBE_40X40', 'Alu Square Tube 40x40x2mm', 'Алюминиевая Труба 40х40', 'Alumīnija Kvadrātcaurule 40x40', '[]', 
'{"alloy": "6060", "finish": "mill", "type": "square_tube", "dimensions": "40x40mm", "wall": "2mm", "length": "6000mm", "applications": ["Main structures"]}'),

-- Angle Profile
('Metals', 'ALU_ANGLE_20X20', 'Alu Angle 20x20x2mm', 'Алюминиевый Уголок 20х20', 'Alumīnija Leņķis 20x20', '[]', 
'{"alloy": "6060", "finish": "mill", "type": "angle", "dimensions": "20x20mm", "wall": "2mm", "length": "6000mm", "applications": ["Reinforcement", "Edging"]}'),

('Metals', 'ALU_ANGLE_40X40', 'Alu Angle 40x40x3mm', 'Алюминиевый Уголок 40х40', 'Alumīnija Leņķis 40x40', '[]', 
'{"alloy": "6060", "finish": "mill", "type": "angle", "dimensions": "40x40mm", "wall": "3mm", "length": "6000mm", "applications": ["Brackets", "Mounting"]}'),

-- Flat Bar
('Metals', 'ALU_FLAT_20X3', 'Alu Flat Bar 20x3mm', 'Алюминиевая Полоса 20х3', 'Alumīnija Josla 20x3', '[]', 
'{"alloy": "6060", "finish": "mill", "type": "flat", "dimensions": "20mm", "wall": "3mm", "length": "6000mm", "applications": ["Strapping", "Detailing"]}');
