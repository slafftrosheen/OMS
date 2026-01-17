-- Adhesives, Tapes, and Mounting Hardware Catalogue
-- Standard industry supplies for Signage Manufacturing

INSERT INTO public.materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata)
VALUES 

-- ==========================================
-- 1. ADHESIVES (Līmes / Клеи)
-- ==========================================

-- Cosmofen (PMMA/PVC)
('Consumables', 'GLUE_COSMOFEN_CA12', 'Cosmofen CA 12 (20g)', 'Клей Cosmofen CA 12 (20г)', 'Līme Cosmofen CA 12 (20g)', '[]', 
'{"brand": "Weiss", "type": "Cyanoacrylate", "dryingTime": "Fast", "volume": "20g", "application": ["PMMA", "PVC", "Rubber"], "properties": {"instant": true, "transparent": true}}'),

('Consumables', 'GLUE_COSMOFEN_PLUS', 'Cosmofen Plus HV (200g)', 'Клей Cosmofen Plus HV (200г)', 'Līme Cosmofen Plus HV (200g)', '[]', 
'{"brand": "Weiss", "type": "Solvent Weld", "dryingTime": "Medium", "volume": "200g", "color": "White/Clear", "application": ["PVC"], "properties": {"gapFilling": true, "highStrength": true}}'),

-- Structural Adhesives
('Consumables', 'GLUE_PMMA_ACRIFIX', 'Acrifix 192 (100g)', 'Клей Acrifix 192 (100г)', 'Līme Acrifix 192 (100g)', '[]', 
'{"brand": "Evonik", "type": "Polymerization", "dryingTime": "UV/Light", "volume": "100g", "application": ["PMMA", "Plexiglas"], "properties": {"transparent": true, "highStrength": true}}'),

-- Silicones
('Consumables', 'SILICONE_NEUTRAL_CLEAR', 'Neutral Silicone Clear', 'Силикон Нейтральный Прозрачный', 'Silikons Neitrāls Caurspīdīgs', '[]', 
'{"brand": "Soudal/Penosil", "type": "Sealant", "volume": "310ml", "color": "Clear", "application": ["Sealing", "Waterproofing"], "properties": {"uvResistant": true, "flexible": true}}'),


-- ==========================================
-- 2. TAPES (Lentes / Ленты)
-- ==========================================

-- VHB / High Bond
('Consumables', 'TAPE_VHB_TRANSPARENT', 'VHB Tape Transparent 19mm', 'Лента VHB Прозрачная 19мм', 'VHB Lente Caurspīdīga 19mm', '[]', 
'{"brand": "3M/Generic", "series": "VHB", "width": "19mm", "thickness": "1mm", "length": "33m", "color": "Clear", "application": ["Heavy duty mounting", "Glass", "Metal"]}'),

('Consumables', 'TAPE_VHB_GREY', 'VHB Tape Grey 19mm', 'Лента VHB Серая 19мм', 'VHB Lente Pelēka 19mm', '[]', 
'{"brand": "3M/Generic", "series": "VHB", "width": "19mm", "thickness": "1.1mm", "length": "33m", "color": "Grey", "application": ["ACP", "Metal", "Plastic"]}'),

-- Foam Tapes
('Consumables', 'TAPE_FOAM_WHITE', 'Double-sided Foam Tape White', 'Двусторонний Скотч Вспененный', 'Abpusēja Putu Lente Balta', '[]', 
'{"brand": "Tesa/Generic", "width": "19mm", "thickness": "1mm", "length": "50m", "application": ["Indoor mounting", "Lightweight signs"]}'),

-- Banner Tape
('Consumables', 'TAPE_BANNER', 'Banner Hemming Tape 25mm', 'Лента для Баннеров 25мм', 'Baneru Lente 25mm', '[]', 
'{"brand": "Generic", "width": "25mm", "thickness": "0.2mm", "application": ["PVC Banners", "Hemming"], "properties": {"highTack": true}}'),


-- ==========================================
-- 3. MOUNTING HARDWARE (Stiprinājumi / Крепеж)
-- ==========================================

-- Standoffs
('Hardware', 'STANDOFF_13X19_SS', 'Standoff Stainless Steel 13x19mm', 'Дистанционный Держатель 13х19мм', 'Distance 13x19mm Nerūsējošais Tērauds', '[]', 
'{"material": "Stainless Steel", "diameter": "13mm", "distance": "19mm", "finish": "Satin", "application": ["Plexiglas signs", "Door plates"]}'),

('Hardware', 'STANDOFF_19X25_SS', 'Standoff Stainless Steel 19x25mm', 'Дистанционный Держатель 19х25мм', 'Distance 19x25mm Nerūsējošais Tērauds', '[]', 
'{"material": "Stainless Steel", "diameter": "19mm", "distance": "25mm", "finish": "Satin", "application": ["Large panels", "Facades"]}'),

('Hardware', 'STANDOFF_LED_19X25', 'LED Standoff White 19x25mm', 'LED Держатель Белый 19х25мм', 'LED Distance Balta 19x25mm', '[]', 
'{"material": "Aluminium/Plastic", "diameter": "19mm", "distance": "25mm", "lightColor": "White", "voltage": "12V", "application": ["Illuminated signs"]}'),

-- Wall Plugs & Screws
('Hardware', 'ANCHOR_FISCHER_DUO_6', 'Fischer DuoPower 6x30', 'Дюбель Fischer DuoPower 6x30', 'Dībelis Fischer DuoPower 6x30', '[]', 
'{"brand": "Fischer", "size": "6x30mm", "boxQty": 100, "application": ["Concrete", "Brick", "Plasterboard"], "load": "Medium"}'),

('Hardware', 'ANCHOR_FISCHER_DUO_8', 'Fischer DuoPower 8x40', 'Дюбель Fischer DuoPower 8x40', 'Dībelis Fischer DuoPower 8x40', '[]', 
'{"brand": "Fischer", "size": "8x40mm", "boxQty": 100, "application": ["Heavy loads", "Facades"]}'),

-- Cable Ties
('Hardware', 'CABLE_TIE_200_BLACK', 'Cable Ties 200x3.6mm Black', 'Стяжки 200мм Черные', 'Savivēji 200mm Melni', '[]', 
'{"brand": "Generic", "length": "200mm", "width": "3.6mm", "color": "Black", "uvResistant": true, "packQty": 100}'),


-- ==========================================
-- 4. CLEANING & CHEMICALS (Ķīmija / Химия)
-- ==========================================

('Consumables', 'CHEM_IPA_1L', 'Isopropyl Alcohol 99.9% (1L)', 'Изопропиловый Спирт (1Л)', 'Izopropilspirts (1L)', '[]', 
'{"type": "Cleaner", "volume": "1L", "application": ["Surface prep", "Degreasing"], "properties": {"fastEvaporating": true}}'),

('Consumables', 'CHEM_ANTISTATIC', 'Antistatic Cleaner (500ml)', 'Антистатик Очиститель', 'Antistatisks Tīrītājs', '[]', 
'{"type": "Cleaner", "volume": "500ml", "application": ["PMMA", "Plastics"], "properties": {"dustRepellent": true}}'),

('Consumables', 'CHEM_PVC_CLEANER_10', 'Cosmofen 10 (Lightly Softening)', 'Очиститель Cosmofen 10', 'Tīrītājs Cosmofen 10', '[]', 
'{"brand": "Weiss", "type": "Solvent Cleaner", "volume": "1L", "application": ["PVC Profiles"], "properties": {"polishing": true, "scratchRemoval": true}}');
