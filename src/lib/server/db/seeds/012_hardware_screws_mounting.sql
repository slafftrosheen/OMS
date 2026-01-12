-- src/lib/server/db/seeds/012_hardware_screws_mounting.sql
-- Screws, fasteners, and mounting hardware

-- ==========================================
-- SCREWS - SELF-TAPPING
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
-- Self-tapping screws for sheet metal
('HARDWARE', 'SCREW_ST_3_5x9_5', 'Self-Tapping Screw 3.5x9.5mm', 'Саморез 3.5x9.5мм', 'Pašvītņojošā skrūve 3.5x9.5mm',
 '[]'::jsonb,
 '{"type": "self_tapping", "diameter": 3.5, "length": 9.5, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-ST-35-95", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_ST_3_5x13', 'Self-Tapping Screw 3.5x13mm', 'Саморез 3.5x13мм', 'Pašvītņojošā skrūve 3.5x13mm',
 '[]'::jsonb,
 '{"type": "self_tapping", "diameter": 3.5, "length": 13, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-ST-35-13", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_ST_3_5x16', 'Self-Tapping Screw 3.5x16mm', 'Саморез 3.5x16мм', 'Pašvītņojošā skrūve 3.5x16mm',
 '[]'::jsonb,
 '{"type": "self_tapping", "diameter": 3.5, "length": 16, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-ST-35-16", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_ST_3_5x19', 'Self-Tapping Screw 3.5x19mm', 'Саморез 3.5x19мм', 'Pašvītņojošā skrūve 3.5x19mm',
 '[]'::jsonb,
 '{"type": "self_tapping", "diameter": 3.5, "length": 19, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-ST-35-19", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_ST_4_2x13', 'Self-Tapping Screw 4.2x13mm', 'Саморез 4.2x13мм', 'Pašvītņojošā skrūve 4.2x13mm',
 '[]'::jsonb,
 '{"type": "self_tapping", "diameter": 4.2, "length": 13, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-ST-42-13", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_ST_4_2x16', 'Self-Tapping Screw 4.2x16mm', 'Саморез 4.2x16мм', 'Pašvītņojošā skrūve 4.2x16mm',
 '[]'::jsonb,
 '{"type": "self_tapping", "diameter": 4.2, "length": 16, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-ST-42-16", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_ST_4_2x19', 'Self-Tapping Screw 4.2x19mm', 'Саморез 4.2x19мм', 'Pašvītņojošā skrūve 4.2x19mm',
 '[]'::jsonb,
 '{"type": "self_tapping", "diameter": 4.2, "length": 19, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-ST-42-19", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_ST_4_2x25', 'Self-Tapping Screw 4.2x25mm', 'Саморез 4.2x25мм', 'Pašvītņojošā skrūve 4.2x25mm',
 '[]'::jsonb,
 '{"type": "self_tapping", "diameter": 4.2, "length": 25, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-ST-42-25", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_ST_4_8x19', 'Self-Tapping Screw 4.8x19mm', 'Саморез 4.8x19мм', 'Pašvītņojošā skrūve 4.8x19mm',
 '[]'::jsonb,
 '{"type": "self_tapping", "diameter": 4.8, "length": 19, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-ST-48-19", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_ST_4_8x25', 'Self-Tapping Screw 4.8x25mm', 'Саморез 4.8x25мм', 'Pašvītņojošā skrūve 4.8x25mm',
 '[]'::jsonb,
 '{"type": "self_tapping", "diameter": 4.8, "length": 25, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-ST-48-25", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_ST_4_8x32', 'Self-Tapping Screw 4.8x32mm', 'Саморез 4.8x32мм', 'Pašvītņojošā skrūve 4.8x32mm',
 '[]'::jsonb,
 '{"type": "self_tapping", "diameter": 4.8, "length": 32, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-ST-48-32", "packSize": 100}'::jsonb),

-- Black self-tapping
('HARDWARE', 'SCREW_ST_3_5x13_BLK', 'Self-Tapping Screw 3.5x13mm Black', 'Саморез 3.5x13мм Черный', 'Pašvītņojošā skrūve 3.5x13mm Melna',
 '[]'::jsonb,
 '{"type": "self_tapping", "diameter": 3.5, "length": 13, "head": "pan", "drive": "phillips", "material": "steel_black", "hex": "#1C1C1C", "sku": "SCR-ST-35-13-B", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_ST_4_2x16_BLK', 'Self-Tapping Screw 4.2x16mm Black', 'Саморез 4.2x16мм Черный', 'Pašvītņojošā skrūve 4.2x16mm Melna',
 '[]'::jsonb,
 '{"type": "self_tapping", "diameter": 4.2, "length": 16, "head": "pan", "drive": "phillips", "material": "steel_black", "hex": "#1C1C1C", "sku": "SCR-ST-42-16-B", "packSize": 100}'::jsonb);

-- ==========================================
-- SCREWS - MACHINE SCREWS
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
('HARDWARE', 'SCREW_M3x6', 'Machine Screw M3x6mm', 'Винт M3x6мм', 'Mašīnskrūve M3x6mm',
 '[]'::jsonb,
 '{"type": "machine", "thread": "M3", "length": 6, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-M3-6", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_M3x8', 'Machine Screw M3x8mm', 'Винт M3x8мм', 'Mašīnskrūve M3x8mm',
 '[]'::jsonb,
 '{"type": "machine", "thread": "M3", "length": 8, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-M3-8", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_M3x10', 'Machine Screw M3x10mm', 'Винт M3x10мм', 'Mašīnskrūve M3x10mm',
 '[]'::jsonb,
 '{"type": "machine", "thread": "M3", "length": 10, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-M3-10", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_M4x8', 'Machine Screw M4x8mm', 'Винт M4x8мм', 'Mašīnskrūve M4x8mm',
 '[]'::jsonb,
 '{"type": "machine", "thread": "M4", "length": 8, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-M4-8", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_M4x10', 'Machine Screw M4x10mm', 'Винт M4x10мм', 'Mašīnskrūve M4x10mm',
 '[]'::jsonb,
 '{"type": "machine", "thread": "M4", "length": 10, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-M4-10", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_M4x12', 'Machine Screw M4x12mm', 'Винт M4x12мм', 'Mašīnskrūve M4x12mm',
 '[]'::jsonb,
 '{"type": "machine", "thread": "M4", "length": 12, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-M4-12", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_M4x16', 'Machine Screw M4x16mm', 'Винт M4x16мм', 'Mašīnskrūve M4x16mm',
 '[]'::jsonb,
 '{"type": "machine", "thread": "M4", "length": 16, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-M4-16", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_M5x10', 'Machine Screw M5x10mm', 'Винт M5x10мм', 'Mašīnskrūve M5x10mm',
 '[]'::jsonb,
 '{"type": "machine", "thread": "M5", "length": 10, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-M5-10", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_M5x16', 'Machine Screw M5x16mm', 'Винт M5x16мм', 'Mašīnskrūve M5x16mm',
 '[]'::jsonb,
 '{"type": "machine", "thread": "M5", "length": 16, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-M5-16", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_M5x20', 'Machine Screw M5x20mm', 'Винт M5x20мм', 'Mašīnskrūve M5x20mm',
 '[]'::jsonb,
 '{"type": "machine", "thread": "M5", "length": 20, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-M5-20", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_M6x12', 'Machine Screw M6x12mm', 'Винт M6x12мм', 'Mašīnskrūve M6x12mm',
 '[]'::jsonb,
 '{"type": "machine", "thread": "M6", "length": 12, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-M6-12", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_M6x16', 'Machine Screw M6x16mm', 'Винт M6x16мм', 'Mašīnskrūve M6x16mm',
 '[]'::jsonb,
 '{"type": "machine", "thread": "M6", "length": 16, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-M6-16", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_M6x20', 'Machine Screw M6x20mm', 'Винт M6x20мм', 'Mašīnskrūve M6x20mm',
 '[]'::jsonb,
 '{"type": "machine", "thread": "M6", "length": 20, "head": "pan", "drive": "phillips", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-M6-20", "packSize": 100}'::jsonb),

('HARDWARE', 'SCREW_M8x20', 'Machine Screw M8x20mm', 'Винт M8x20мм', 'Mašīnskrūve M8x20mm',
 '[]'::jsonb,
 '{"type": "machine", "thread": "M8", "length": 20, "head": "hex", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-M8-20", "packSize": 50}'::jsonb),

('HARDWARE', 'SCREW_M8x25', 'Machine Screw M8x25mm', 'Винт M8x25мм', 'Mašīnskrūve M8x25mm',
 '[]'::jsonb,
 '{"type": "machine", "thread": "M8", "length": 25, "head": "hex", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "SCR-M8-25", "packSize": 50}'::jsonb);

-- ==========================================
-- NUTS
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
('HARDWARE', 'NUT_M3', 'Hex Nut M3', 'Гайка M3', 'Uzgrieznis M3',
 '[]'::jsonb,
 '{"type": "hex_nut", "thread": "M3", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "NUT-M3", "packSize": 100}'::jsonb),

('HARDWARE', 'NUT_M4', 'Hex Nut M4', 'Гайка M4', 'Uzgrieznis M4',
 '[]'::jsonb,
 '{"type": "hex_nut", "thread": "M4", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "NUT-M4", "packSize": 100}'::jsonb),

('HARDWARE', 'NUT_M5', 'Hex Nut M5', 'Гайка M5', 'Uzgrieznis M5',
 '[]'::jsonb,
 '{"type": "hex_nut", "thread": "M5", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "NUT-M5", "packSize": 100}'::jsonb),

('HARDWARE', 'NUT_M6', 'Hex Nut M6', 'Гайка M6', 'Uzgrieznis M6',
 '[]'::jsonb,
 '{"type": "hex_nut", "thread": "M6", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "NUT-M6", "packSize": 100}'::jsonb),

('HARDWARE', 'NUT_M8', 'Hex Nut M8', 'Гайка M8', 'Uzgrieznis M8',
 '[]'::jsonb,
 '{"type": "hex_nut", "thread": "M8", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "NUT-M8", "packSize": 50}'::jsonb),

('HARDWARE', 'NUT_M3_NYLOCK', 'Nylock Nut M3', 'Гайка M3 с нейлоном', 'Uzgrieznis M3 ar neilonu',
 '[]'::jsonb,
 '{"type": "nylock_nut", "thread": "M3", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "NUT-M3-NY", "packSize": 100}'::jsonb),

('HARDWARE', 'NUT_M4_NYLOCK', 'Nylock Nut M4', 'Гайка M4 с нейлоном', 'Uzgrieznis M4 ar neilonu',
 '[]'::jsonb,
 '{"type": "nylock_nut", "thread": "M4", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "NUT-M4-NY", "packSize": 100}'::jsonb),

('HARDWARE', 'NUT_M5_NYLOCK', 'Nylock Nut M5', 'Гайка M5 с нейлоном', 'Uzgrieznis M5 ar neilonu',
 '[]'::jsonb,
 '{"type": "nylock_nut", "thread": "M5", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "NUT-M5-NY", "packSize": 100}'::jsonb),

('HARDWARE', 'NUT_M6_NYLOCK', 'Nylock Nut M6', 'Гайка M6 с нейлоном', 'Uzgrieznis M6 ar neilonu',
 '[]'::jsonb,
 '{"type": "nylock_nut", "thread": "M6", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "NUT-M6-NY", "packSize": 100}'::jsonb);

-- ==========================================
-- WASHERS
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
('HARDWARE', 'WASHER_M3', 'Flat Washer M3', 'Шайба M3', 'Paplāksne M3',
 '[]'::jsonb,
 '{"type": "flat_washer", "size": "M3", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "WSH-M3", "packSize": 100}'::jsonb),

('HARDWARE', 'WASHER_M4', 'Flat Washer M4', 'Шайба M4', 'Paplāksne M4',
 '[]'::jsonb,
 '{"type": "flat_washer", "size": "M4", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "WSH-M4", "packSize": 100}'::jsonb),

('HARDWARE', 'WASHER_M5', 'Flat Washer M5', 'Шайба M5', 'Paplāksne M5',
 '[]'::jsonb,
 '{"type": "flat_washer", "size": "M5", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "WSH-M5", "packSize": 100}'::jsonb),

('HARDWARE', 'WASHER_M6', 'Flat Washer M6', 'Шайба M6', 'Paplāksne M6',
 '[]'::jsonb,
 '{"type": "flat_washer", "size": "M6", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "WSH-M6", "packSize": 100}'::jsonb),

('HARDWARE', 'WASHER_M8', 'Flat Washer M8', 'Шайба M8', 'Paplāksne M8',
 '[]'::jsonb,
 '{"type": "flat_washer", "size": "M8", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "WSH-M8", "packSize": 50}'::jsonb),

('HARDWARE', 'WASHER_M4_SPRING', 'Spring Washer M4', 'Гровер M4', 'Atsperpaplāksne M4',
 '[]'::jsonb,
 '{"type": "spring_washer", "size": "M4", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "WSH-M4-SP", "packSize": 100}'::jsonb),

('HARDWARE', 'WASHER_M5_SPRING', 'Spring Washer M5', 'Гровер M5', 'Atsperpaplāksne M5',
 '[]'::jsonb,
 '{"type": "spring_washer", "size": "M5", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "WSH-M5-SP", "packSize": 100}'::jsonb),

('HARDWARE', 'WASHER_M6_SPRING', 'Spring Washer M6', 'Гровер M6', 'Atsperpaplāksne M6',
 '[]'::jsonb,
 '{"type": "spring_washer", "size": "M6", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "WSH-M6-SP", "packSize": 100}'::jsonb);

-- ==========================================
-- RIVETS
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
('HARDWARE', 'RIVET_3_2x6', 'Blind Rivet 3.2x6mm', 'Заклепка 3.2x6мм', 'Kniedēšanas kniede 3.2x6mm',
 '[]'::jsonb,
 '{"type": "blind_rivet", "diameter": 3.2, "length": 6, "material": "aluminum", "hex": "#C0C0C0", "sku": "RIV-32-6", "packSize": 500}'::jsonb),

('HARDWARE', 'RIVET_3_2x8', 'Blind Rivet 3.2x8mm', 'Заклепка 3.2x8мм', 'Kniedēšanas kniede 3.2x8mm',
 '[]'::jsonb,
 '{"type": "blind_rivet", "diameter": 3.2, "length": 8, "material": "aluminum", "hex": "#C0C0C0", "sku": "RIV-32-8", "packSize": 500}'::jsonb),

('HARDWARE', 'RIVET_3_2x10', 'Blind Rivet 3.2x10mm', 'Заклепка 3.2x10мм', 'Kniedēšanas kniede 3.2x10mm',
 '[]'::jsonb,
 '{"type": "blind_rivet", "diameter": 3.2, "length": 10, "material": "aluminum", "hex": "#C0C0C0", "sku": "RIV-32-10", "packSize": 500}'::jsonb),

('HARDWARE', 'RIVET_4_0x8', 'Blind Rivet 4.0x8mm', 'Заклепка 4.0x8мм', 'Kniedēšanas kniede 4.0x8mm',
 '[]'::jsonb,
 '{"type": "blind_rivet", "diameter": 4.0, "length": 8, "material": "aluminum", "hex": "#C0C0C0", "sku": "RIV-40-8", "packSize": 500}'::jsonb),

('HARDWARE', 'RIVET_4_0x10', 'Blind Rivet 4.0x10mm', 'Заклепка 4.0x10мм', 'Kniedēšanas kniede 4.0x10mm',
 '[]'::jsonb,
 '{"type": "blind_rivet", "diameter": 4.0, "length": 10, "material": "aluminum", "hex": "#C0C0C0", "sku": "RIV-40-10", "packSize": 500}'::jsonb),

('HARDWARE', 'RIVET_4_0x12', 'Blind Rivet 4.0x12mm', 'Заклепка 4.0x12мм', 'Kniedēšanas kniede 4.0x12mm',
 '[]'::jsonb,
 '{"type": "blind_rivet", "diameter": 4.0, "length": 12, "material": "aluminum", "hex": "#C0C0C0", "sku": "RIV-40-12", "packSize": 500}'::jsonb),

('HARDWARE', 'RIVET_4_8x10', 'Blind Rivet 4.8x10mm', 'Заклепка 4.8x10мм', 'Kniedēšanas kniede 4.8x10mm',
 '[]'::jsonb,
 '{"type": "blind_rivet", "diameter": 4.8, "length": 10, "material": "aluminum", "hex": "#C0C0C0", "sku": "RIV-48-10", "packSize": 500}'::jsonb),

('HARDWARE', 'RIVET_4_8x12', 'Blind Rivet 4.8x12mm', 'Заклепка 4.8x12мм', 'Kniedēšanas kniede 4.8x12mm',
 '[]'::jsonb,
 '{"type": "blind_rivet", "diameter": 4.8, "length": 12, "material": "aluminum", "hex": "#C0C0C0", "sku": "RIV-48-12", "packSize": 500}'::jsonb),

('HARDWARE', 'RIVET_4_8x16', 'Blind Rivet 4.8x16mm', 'Заклепка 4.8x16мм', 'Kniedēšanas kniede 4.8x16mm',
 '[]'::jsonb,
 '{"type": "blind_rivet", "diameter": 4.8, "length": 16, "material": "aluminum", "hex": "#C0C0C0", "sku": "RIV-48-16", "packSize": 500}'::jsonb);

-- ==========================================
-- MOUNTING BRACKETS & CLIPS
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
('HARDWARE', 'BRACKET_L_30x30', 'L Bracket 30x30mm', 'Уголок 30x30мм', 'L kronšteins 30x30mm',
 '[]'::jsonb,
 '{"type": "bracket", "shape": "L", "dimensions": "30x30mm", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "BRK-L-30", "packSize": 10}'::jsonb),

('HARDWARE', 'BRACKET_L_40x40', 'L Bracket 40x40mm', 'Уголок 40x40мм', 'L kronšteins 40x40mm',
 '[]'::jsonb,
 '{"type": "bracket", "shape": "L", "dimensions": "40x40mm", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "BRK-L-40", "packSize": 10}'::jsonb),

('HARDWARE', 'BRACKET_L_50x50', 'L Bracket 50x50mm', 'Уголок 50x50мм', 'L kronšteins 50x50mm',
 '[]'::jsonb,
 '{"type": "bracket", "shape": "L", "dimensions": "50x50mm", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "BRK-L-50", "packSize": 10}'::jsonb),

('HARDWARE', 'BRACKET_FLAT_50', 'Flat Bracket 50mm', 'Пластина соединительная 50мм', 'Plakans kronšteins 50mm',
 '[]'::jsonb,
 '{"type": "bracket", "shape": "flat", "length": 50, "material": "steel_zinc", "hex": "#C0C0C0", "sku": "BRK-F-50", "packSize": 10}'::jsonb),

('HARDWARE', 'BRACKET_FLAT_80', 'Flat Bracket 80mm', 'Пластина соединительная 80мм', 'Plakans kronšteins 80mm',
 '[]'::jsonb,
 '{"type": "bracket", "shape": "flat", "length": 80, "material": "steel_zinc", "hex": "#C0C0C0", "sku": "BRK-F-80", "packSize": 10}'::jsonb),

('HARDWARE', 'BRACKET_FLAT_100', 'Flat Bracket 100mm', 'Пластина соединительная 100мм', 'Plakans kronšteins 100mm',
 '[]'::jsonb,
 '{"type": "bracket", "shape": "flat", "length": 100, "material": "steel_zinc", "hex": "#C0C0C0", "sku": "BRK-F-100", "packSize": 10}'::jsonb),

('HARDWARE', 'CLIP_CABLE_6MM', 'Cable Clip 6mm', 'Скоба для кабеля 6мм', 'Kabeļu skava 6mm',
 '[]'::jsonb,
 '{"type": "cable_clip", "size": 6, "material": "plastic_white", "hex": "#FFFFFF", "sku": "CLP-CBL-6", "packSize": 100}'::jsonb),

('HARDWARE', 'CLIP_CABLE_8MM', 'Cable Clip 8mm', 'Скоба для кабеля 8мм', 'Kabeļu skava 8mm',
 '[]'::jsonb,
 '{"type": "cable_clip", "size": 8, "material": "plastic_white", "hex": "#FFFFFF", "sku": "CLP-CBL-8", "packSize": 100}'::jsonb),

('HARDWARE', 'CLIP_CABLE_10MM', 'Cable Clip 10mm', 'Скоба для кабеля 10мм', 'Kabeļu skava 10mm',
 '[]'::jsonb,
 '{"type": "cable_clip", "size": 10, "material": "plastic_white", "hex": "#FFFFFF", "sku": "CLP-CBL-10", "packSize": 100}'::jsonb);

-- ==========================================
-- WALL PLUGS & ANCHORS
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
('HARDWARE', 'PLUG_5x25', 'Wall Plug 5x25mm', 'Дюбель 5x25мм', 'Sienas tapas 5x25mm',
 '[]'::jsonb,
 '{"type": "wall_plug", "diameter": 5, "length": 25, "material": "nylon", "hex": "#D3D3D3", "sku": "PLG-5-25", "packSize": 100}'::jsonb),

('HARDWARE', 'PLUG_6x30', 'Wall Plug 6x30mm', 'Дюбель 6x30мм', 'Sienas tapas 6x30mm',
 '[]'::jsonb,
 '{"type": "wall_plug", "diameter": 6, "length": 30, "material": "nylon", "hex": "#D3D3D3", "sku": "PLG-6-30", "packSize": 100}'::jsonb),

('HARDWARE', 'PLUG_8x40', 'Wall Plug 8x40mm', 'Дюбель 8x40мм', 'Sienas tapas 8x40mm',
 '[]'::jsonb,
 '{"type": "wall_plug", "diameter": 8, "length": 40, "material": "nylon", "hex": "#D3D3D3", "sku": "PLG-8-40", "packSize": 100}'::jsonb),

('HARDWARE', 'PLUG_10x50', 'Wall Plug 10x50mm', 'Дюбель 10x50мм', 'Sienas tapas 10x50mm',
 '[]'::jsonb,
 '{"type": "wall_plug", "diameter": 10, "length": 50, "material": "nylon", "hex": "#D3D3D3", "sku": "PLG-10-50", "packSize": 50}'::jsonb),

('HARDWARE', 'ANCHOR_TOGGLE_M4', 'Toggle Anchor M4', 'Анкер складной M4', 'Paceļamais enkurs M4',
 '[]'::jsonb,
 '{"type": "toggle_anchor", "thread": "M4", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "ANC-TOG-M4", "packSize": 25}'::jsonb),

('HARDWARE', 'ANCHOR_TOGGLE_M5', 'Toggle Anchor M5', 'Анкер складной M5', 'Paceļamais enkurs M5',
 '[]'::jsonb,
 '{"type": "toggle_anchor", "thread": "M5", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "ANC-TOG-M5", "packSize": 25}'::jsonb),

('HARDWARE', 'ANCHOR_TOGGLE_M6', 'Toggle Anchor M6', 'Анкер складной M6', 'Paceļamais enkurs M6',
 '[]'::jsonb,
 '{"type": "toggle_anchor", "thread": "M6", "material": "steel_zinc", "hex": "#C0C0C0", "sku": "ANC-TOG-M6", "packSize": 25}'::jsonb),

('HARDWARE', 'ANCHOR_SLEEVE_M6', 'Sleeve Anchor M6x40', 'Анкер распорный M6x40', 'Ietveres enkurs M6x40',
 '[]'::jsonb,
 '{"type": "sleeve_anchor", "thread": "M6", "length": 40, "material": "steel_zinc", "hex": "#C0C0C0", "sku": "ANC-SLV-M6-40", "packSize": 25}'::jsonb),

('HARDWARE', 'ANCHOR_SLEEVE_M8', 'Sleeve Anchor M8x50', 'Анкер распорный M8x50', 'Ietveres enkurs M8x50',
 '[]'::jsonb,
 '{"type": "sleeve_anchor", "thread": "M8", "length": 50, "material": "steel_zinc", "hex": "#C0C0C0", "sku": "ANC-SLV-M8-50", "packSize": 25}'::jsonb),

('HARDWARE', 'ANCHOR_SLEEVE_M10', 'Sleeve Anchor M10x60', 'Анкер распорный M10x60', 'Ietveres enkurs M10x60',
 '[]'::jsonb,
 '{"type": "sleeve_anchor", "thread": "M10", "length": 60, "material": "steel_zinc", "hex": "#C0C0C0", "sku": "ANC-SLV-M10-60", "packSize": 25}'::jsonb);

-- ==========================================
-- STANDOFFS & SPACERS
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
('HARDWARE', 'STANDOFF_M3x10', 'Standoff M3x10mm', 'Стойка M3x10мм', 'Starplikas M3x10mm',
 '[]'::jsonb,
 '{"type": "standoff", "thread": "M3", "length": 10, "material": "brass_nickel", "hex": "#C0C0C0", "sku": "STF-M3-10", "packSize": 50}'::jsonb),

('HARDWARE', 'STANDOFF_M3x15', 'Standoff M3x15mm', 'Стойка M3x15мм', 'Starplikas M3x15mm',
 '[]'::jsonb,
 '{"type": "standoff", "thread": "M3", "length": 15, "material": "brass_nickel", "hex": "#C0C0C0", "sku": "STF-M3-15", "packSize": 50}'::jsonb),

('HARDWARE', 'STANDOFF_M3x20', 'Standoff M3x20mm', 'Стойка M3x20мм', 'Starplikas M3x20mm',
 '[]'::jsonb,
 '{"type": "standoff", "thread": "M3", "length": 20, "material": "brass_nickel", "hex": "#C0C0C0", "sku": "STF-M3-20", "packSize": 50}'::jsonb),

('HARDWARE', 'STANDOFF_M4x15', 'Standoff M4x15mm', 'Стойка M4x15мм', 'Starplikas M4x15mm',
 '[]'::jsonb,
 '{"type": "standoff", "thread": "M4", "length": 15, "material": "brass_nickel", "hex": "#C0C0C0", "sku": "STF-M4-15", "packSize": 50}'::jsonb),

('HARDWARE', 'STANDOFF_M4x20', 'Standoff M4x20mm', 'Стойка M4x20мм', 'Starplikas M4x20mm',
 '[]'::jsonb,
 '{"type": "standoff", "thread": "M4", "length": 20, "material": "brass_nickel", "hex": "#C0C0C0", "sku": "STF-M4-20", "packSize": 50}'::jsonb),

('HARDWARE', 'STANDOFF_M4x25', 'Standoff M4x25mm', 'Стойка M4x25мм', 'Starplikas M4x25mm',
 '[]'::jsonb,
 '{"type": "standoff", "thread": "M4", "length": 25, "material": "brass_nickel", "hex": "#C0C0C0", "sku": "STF-M4-25", "packSize": 50}'::jsonb),

('HARDWARE', 'SPACER_NYLON_M3x5', 'Nylon Spacer M3x5mm', 'Втулка нейлоновая M3x5мм', 'Neilona starplika M3x5mm',
 '[]'::jsonb,
 '{"type": "spacer", "size": "M3", "length": 5, "material": "nylon", "hex": "#FFFFFF", "sku": "SPC-M3-5", "packSize": 100}'::jsonb),

('HARDWARE', 'SPACER_NYLON_M3x10', 'Nylon Spacer M3x10mm', 'Втулка нейлоновая M3x10мм', 'Neilona starplika M3x10mm',
 '[]'::jsonb,
 '{"type": "spacer", "size": "M3", "length": 10, "material": "nylon", "hex": "#FFFFFF", "sku": "SPC-M3-10", "packSize": 100}'::jsonb),

('HARDWARE', 'SPACER_NYLON_M4x5', 'Nylon Spacer M4x5mm', 'Втулка нейлоновая M4x5мм', 'Neilona starplika M4x5mm',
 '[]'::jsonb,
 '{"type": "spacer", "size": "M4", "length": 5, "material": "nylon", "hex": "#FFFFFF", "sku": "SPC-M4-5", "packSize": 100}'::jsonb),

('HARDWARE', 'SPACER_NYLON_M4x10', 'Nylon Spacer M4x10mm', 'Втулка нейлоновая M4x10мм', 'Neilona starplika M4x10mm',
 '[]'::jsonb,
 '{"type": "spacer", "size": "M4", "length": 10, "material": "nylon", "hex": "#FFFFFF", "sku": "SPC-M4-10", "packSize": 100}'::jsonb);

-- ==========================================
-- CABLE TIES & WIRE MANAGEMENT
-- ==========================================

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) VALUES
('HARDWARE', 'TIE_100x2_5_W', 'Cable Tie 100x2.5mm White', 'Стяжка 100x2.5мм Белая', 'Kabeļu saite 100x2.5mm Balta',
 '[]'::jsonb,
 '{"type": "cable_tie", "length": 100, "width": 2.5, "material": "nylon", "hex": "#FFFFFF", "sku": "TIE-100-W", "packSize": 100}'::jsonb),

('HARDWARE', 'TIE_150x3_6_W', 'Cable Tie 150x3.6mm White', 'Стяжка 150x3.6мм Белая', 'Kabeļu saite 150x3.6mm Balta',
 '[]'::jsonb,
 '{"type": "cable_tie", "length": 150, "width": 3.6, "material": "nylon", "hex": "#FFFFFF", "sku": "TIE-150-W", "packSize": 100}'::jsonb),

('HARDWARE', 'TIE_200x3_6_W', 'Cable Tie 200x3.6mm White', 'Стяжка 200x3.6мм Белая', 'Kabeļu saite 200x3.6mm Balta',
 '[]'::jsonb,
 '{"type": "cable_tie", "length": 200, "width": 3.6, "material": "nylon", "hex": "#FFFFFF", "sku": "TIE-200-W", "packSize": 100}'::jsonb),

('HARDWARE', 'TIE_300x4_8_W', 'Cable Tie 300x4.8mm White', 'Стяжка 300x4.8мм Белая', 'Kabeļu saite 300x4.8mm Balta',
 '[]'::jsonb,
 '{"type": "cable_tie", "length": 300, "width": 4.8, "material": "nylon", "hex": "#FFFFFF", "sku": "TIE-300-W", "packSize": 100}'::jsonb),

('HARDWARE', 'TIE_100x2_5_B', 'Cable Tie 100x2.5mm Black', 'Стяжка 100x2.5мм Черная', 'Kabeļu saite 100x2.5mm Melna',
 '[]'::jsonb,
 '{"type": "cable_tie", "length": 100, "width": 2.5, "material": "nylon_uv", "hex": "#1C1C1C", "sku": "TIE-100-B", "packSize": 100}'::jsonb),

('HARDWARE', 'TIE_200x3_6_B', 'Cable Tie 200x3.6mm Black', 'Стяжка 200x3.6мм Черная', 'Kabeļu saite 200x3.6mm Melna',
 '[]'::jsonb,
 '{"type": "cable_tie", "length": 200, "width": 3.6, "material": "nylon_uv", "hex": "#1C1C1C", "sku": "TIE-200-B", "packSize": 100}'::jsonb),

('HARDWARE', 'TIE_300x4_8_B', 'Cable Tie 300x4.8mm Black', 'Стяжка 300x4.8мм Черная', 'Kabeļu saite 300x4.8mm Melna',
 '[]'::jsonb,
 '{"type": "cable_tie", "length": 300, "width": 4.8, "material": "nylon_uv", "hex": "#1C1C1C", "sku": "TIE-300-B", "packSize": 100}'::jsonb);
