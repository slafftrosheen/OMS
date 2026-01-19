-- Update material categories to match expected values in the Profile7stVisual component

-- Update plastics materials to proper categories
UPDATE materials SET category = 'ACRYLIC_XT' WHERE code LIKE '%XT%' AND category = 'Plastics';
UPDATE materials SET category = 'ACRYLIC_GS' WHERE code LIKE '%GS%' AND category = 'Plastics';
UPDATE materials SET category = 'PVC_FOAM' WHERE code LIKE '%PVC_FOAM%' OR code LIKE '%PVC_FOAM%' OR name_en ILIKE '%pvc foam%';
UPDATE materials SET category = 'ALU_SHEET' WHERE code LIKE '%ALU%' OR code LIKE '%ALUMINIUM%' OR name_en ILIKE '%aluminum%';
UPDATE materials SET category = 'ALU_COMPOSITE' WHERE code ILIKE '%DIBOND%' OR name_en ILIKE '%composite%';
UPDATE materials SET category = 'VINYL_ORACAL' WHERE category = 'Films' OR code ILIKE '%ORACAL%';
UPDATE materials SET category = 'PAINT_RAL' WHERE category = 'Colors' OR code ILIKE 'RAL_%';

-- Insert some additional materials that are commonly used in the system
INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata) 
SELECT 'ACRYLIC_LED', 'PLEXIGLAS_LED_0F00', 'PLEXIGLAS® LED Clear', 'PLEXIGLAS® LED Прозрачный', 'PLEXIGLAS® LED Caurspīdīgs', '[2, 3, 4, 5, 6, 8, 10]', 
'{"brand": "PLEXIGLAS®", "series": "LED", "colorCode": "0F00", "colorName": "Clear", "type": "extruded", "transmittance": "95%", "properties": {"transparent": true, "uvAbsorbent": true, "weatherResistant": true, "ledCompatible": true, "tempResistance": "70°C"}, "standardSize": "3050x2050mm", "hex": "#FFFFFF", "applications": ["LED applications", "Illuminated signs"]}'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE code = 'PLEXIGLAS_LED_0F00');

INSERT INTO materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata)
SELECT 'ALU_PROFILE', 'ALU_PROFILE_40X40_1.5', 'Aluminum Profile 40x40mm 1.5mm wall', 'Алюминиевый профиль 40x40мм 1.5мм стенка', 'Alumīnija Profils 40x40mm 1.5mm siena', '[1.5]', 
'{"alloy": "AlMg3", "finish": "mill", "type": "profile", "dimensions": "40x40x1.5mm", "properties": {"corrosionResistant": true, "lightweight": true, "structural": true, "mounting": true}, "standardLength": "6000mm", "hex": "#C0C0C0", "applications": ["Frames", "Mounting structures", "Enclosures"]}'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE code = 'ALU_PROFILE_40X40_1.5');

-- Update any remaining plastics to appropriate categories
UPDATE materials SET category = 'ACRYLIC_SPECIAL' WHERE category = 'Plastics' AND code NOT IN (
    SELECT code FROM materials WHERE category IN ('ACRYLIC_XT', 'ACRYLIC_GS', 'ACRYLIC_LED', 'PVC_FOAM', 'ALU_SHEET', 'ALU_COMPOSITE')
);

-- Update any remaining metals to appropriate categories
UPDATE materials SET category = 'ALU_SHEET' WHERE category = 'Metals' AND code NOT IN (
    SELECT code FROM materials WHERE category IN ('ALU_SHEET', 'ALU_COMPOSITE', 'ALU_PROFILE')
);

-- Update any remaining films to appropriate categories
UPDATE materials SET category = 'VINYL_ORACAL' WHERE category = 'Films' AND code NOT IN (
    SELECT code FROM materials WHERE category = 'VINYL_ORACAL'
);

-- Update any remaining colors to appropriate categories
UPDATE materials SET category = 'PAINT_RAL' WHERE category = 'Colors' AND code NOT LIKE 'RAL_%'
AND code NOT IN (SELECT code FROM materials WHERE category = 'PAINT_RAL');