-- Seed Metals (Aluminum, Dibond)

INSERT INTO public.materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata)
VALUES
-- Aluminum materials
('Metals', 'ALU_MILL_1_5', 'Aluminum Sheet 1.5mm Mill Finish', 'Алюминиевый лист 1.5мм Милл Финиш', 'Alumīnija Loksne 1.5mm Milēts Beigtas', '[1.5]', '{"alloy": "AlMg3", "finish": "mill", "type": "sheet", "thickness": 1.5, "properties": {"corrosionResistant": true, "lightweight": true, "bendable": true, "weldable": true}, "standardSize": "2000x1000mm", "hex": "#C0C0C0", "applications": ["Signage construction", "Heavy-duty frames"]}'),
('Metals', 'ALU_BRUSHED_1_5', 'Aluminum Sheet 1.5mm Brushed Horizontal', 'Алюминиевый лист 1.5мм Щетковая горизонтальная', 'Alumīnija Loksne 1.5mm Horizontāli Matēts', '[1.5]', '{"alloy": "AlMg3", "finish": "brushed_horizontal", "type": "sheet", "thickness": 1.5, "properties": {"corrosionResistant": true, "decorative": true, "scratchResistant": true, "bendable": true}, "standardSize": "2000x1000mm", "hex": "#B8B8B8", "applications": ["Decorative signage", "Premium finishes"]}'),
('Metals', 'DIBOND_WHITE_3', 'Dibond White 3mm', 'Дибонд Белый 3мм', 'Dibond Balts 3mm', '[3]', '{"brand": "Dibond®", "type": "composite", "thickness": 3, "construction": "ALU-PE-ALU", "finish": "white_coated", "properties": {"lightweight": true, "flat": true, "weatherResistant": true, "printable": true, "rigid": true}, "standardSize": "2440x1220mm", "hex": "#FFFFFF", "applications": ["Signage", "Displays", "Exhibition"]}');
