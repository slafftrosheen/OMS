-- Comprehensive categorization fix for materials and inventory_items
-- This aligns both tables with the granular categories expected by Profile7stVisual and improved Catalog UI

-- 1. Update MATERIALS table
UPDATE public.materials SET category = 'ACRYLIC_XT' WHERE (code ILIKE '%XT%' OR name_en ILIKE '%XT%') AND (category IN ('Plastics', 'Acrylic', 'ACRYLIC'));
UPDATE public.materials SET category = 'ACRYLIC_GS' WHERE (code ILIKE '%GS%' OR name_en ILIKE '%GS%') AND (category IN ('Plastics', 'Acrylic', 'ACRYLIC'));
UPDATE public.materials SET category = 'ACRYLIC_LED' WHERE (code ILIKE '%LED%' OR name_en ILIKE '%LED%') AND (category IN ('Plastics', 'Acrylic', 'ACRYLIC'));
UPDATE public.materials SET category = 'PVC_FOAM' WHERE (code ILIKE '%PVC%' OR code ILIKE '%FOAM%' OR name_en ILIKE '%PVC%' OR name_en ILIKE '%FOAM%') AND (category IN ('Plastics', 'PVC'));
UPDATE public.materials SET category = 'ALU_COMPOSITE' WHERE (code ILIKE '%DIBOND%' OR code ILIKE '%ACP%' OR name_en ILIKE '%COMPOSITE%' OR name_en ILIKE '%SANDWICH%') AND (category IN ('Metals', 'Aluminium', 'ALUMINIUM', 'ACP'));
UPDATE public.materials SET category = 'ALU_PROFILE' WHERE (code ILIKE '%PROFILE%' OR name_en ILIKE '%PROFILE%') AND (code ILIKE '%ALU%' OR name_en ILIKE '%ALU%');
UPDATE public.materials SET category = 'ALU_SHEET' WHERE category IN ('Metals', 'Aluminium', 'ALUMINIUM') AND category NOT IN ('ALU_COMPOSITE', 'ALU_PROFILE');
UPDATE public.materials SET category = 'VINYL_ORACAL' WHERE (code ILIKE '%ORACAL%' OR code ILIKE '%8500%' OR code ILIKE '%641%' OR name_en ILIKE '%ORACAL%') AND (category IN ('Films', 'Vinyl', 'VINYL'));
UPDATE public.materials SET category = 'PAINT_RAL' WHERE (code ILIKE 'RAL%' OR name_en ILIKE 'RAL%') AND (category IN ('Colors', 'Paint', 'PAINT'));
UPDATE public.materials SET category = 'PAINT_PANTONE' WHERE (code ILIKE 'PANTONE%' OR name_en ILIKE 'PANTONE%') AND (category IN ('Colors', 'Paint', 'PAINT'));
UPDATE public.materials SET category = 'LED_MODULE' WHERE (code ILIKE '%MODULE%' OR name_en ILIKE '%MODULE%') AND (category IN ('Electronics', 'LED', 'LED_MODULE'));
UPDATE public.materials SET category = 'LED_STRIP' WHERE (code ILIKE '%STRIP%' OR name_en ILIKE '%STRIP%') AND (category IN ('Electronics', 'LED', 'LED_STRIP'));
UPDATE public.materials SET category = 'PSU_MEANWELL' WHERE (code ILIKE '%PSU%' OR code ILIKE '%MEANWELL%' OR name_en ILIKE '%PSU%' OR name_en ILIKE '%MEAN WELL%');
UPDATE public.materials SET category = 'WIRE' WHERE (code ILIKE '%WIRE%' OR code ILIKE '%CABLE%' OR name_en ILIKE '%WIRE%' OR name_en ILIKE '%CABLE%');

-- 2. Update INVENTORY_ITEMS table (using same logic)
UPDATE public.inventory_items SET category = 'ACRYLIC_XT' WHERE (sku ILIKE '%XT%' OR name ILIKE '%XT%') AND (category IN ('Plastics', 'Acrylic', 'ACRYLIC'));
UPDATE public.inventory_items SET category = 'ACRYLIC_GS' WHERE (sku ILIKE '%GS%' OR name ILIKE '%GS%') AND (category IN ('Plastics', 'Acrylic', 'ACRYLIC'));
UPDATE public.inventory_items SET category = 'ACRYLIC_LED' WHERE (sku ILIKE '%LED%' OR name ILIKE '%LED%') AND (category IN ('Plastics', 'Acrylic', 'ACRYLIC'));
UPDATE public.inventory_items SET category = 'PVC_FOAM' WHERE (sku ILIKE '%PVC%' OR sku ILIKE '%FOAM%' OR name ILIKE '%PVC%' OR name ILIKE '%FOAM%') AND (category IN ('Plastics', 'PVC'));
UPDATE public.inventory_items SET category = 'ALU_COMPOSITE' WHERE (sku ILIKE '%DIBOND%' OR sku ILIKE '%ACP%' OR name ILIKE '%COMPOSITE%' OR name ILIKE '%SANDWICH%') AND (category IN ('Metals', 'Aluminium', 'ALUMINIUM', 'ACP'));
UPDATE public.inventory_items SET category = 'ALU_PROFILE' WHERE (sku ILIKE '%PROFILE%' OR name ILIKE '%PROFILE%') AND (sku ILIKE '%ALU%' OR name ILIKE '%ALU%');
UPDATE public.inventory_items SET category = 'ALU_SHEET' WHERE category IN ('Metals', 'Aluminium', 'ALUMINIUM') AND category NOT IN ('ALU_COMPOSITE', 'ALU_PROFILE');
UPDATE public.inventory_items SET category = 'VINYL_ORACAL' WHERE (sku ILIKE '%ORACAL%' OR sku ILIKE '%8500%' OR sku ILIKE '%641%' OR name ILIKE '%ORACAL%') AND (category IN ('Films', 'Vinyl', 'VINYL'));
UPDATE public.inventory_items SET category = 'PAINT_RAL' WHERE (sku ILIKE 'RAL%' OR name ILIKE 'RAL%') AND (category IN ('Colors', 'Paint', 'PAINT'));
UPDATE public.inventory_items SET category = 'PAINT_PANTONE' WHERE (sku ILIKE 'PANTONE%' OR name ILIKE 'PANTONE%') AND (category IN ('Colors', 'Paint', 'PAINT'));
UPDATE public.inventory_items SET category = 'LED_MODULE' WHERE (sku ILIKE '%MODULE%' OR name ILIKE '%MODULE%') AND (category IN ('Electronics', 'LED', 'LED_MODULE'));
UPDATE public.inventory_items SET category = 'LED_STRIP' WHERE (sku ILIKE '%STRIP%' OR name ILIKE '%STRIP%') AND (category IN ('Electronics', 'LED', 'LED_STRIP'));
UPDATE public.inventory_items SET category = 'PSU_MEANWELL' WHERE (sku ILIKE '%PSU%' OR sku ILIKE '%MEANWELL%' OR name ILIKE '%PSU%' OR name ILIKE '%MEAN WELL%');
UPDATE public.inventory_items SET category = 'WIRE' WHERE (sku ILIKE '%WIRE%' OR sku ILIKE '%CABLE%' OR name ILIKE '%WIRE%' OR name ILIKE '%CABLE%');

-- 3. Ensure any remaining generic categories are also mapped if possible
UPDATE public.materials SET category = 'ACRYLIC_XT' WHERE category = 'Plastics' AND code ILIKE '%PLEX%';
UPDATE public.inventory_items SET category = 'ACRYLIC_XT' WHERE category = 'Plastics' AND name ILIKE '%PLEX%';

-- Final cleanup
UPDATE public.materials SET category = 'ACRYLIC_SPECIAL' WHERE category = 'Plastics' AND category NOT IN ('ACRYLIC_XT', 'ACRYLIC_GS', 'ACRYLIC_LED', 'PVC_FOAM');
UPDATE public.inventory_items SET category = 'ACRYLIC_SPECIAL' WHERE category = 'Plastics' AND category NOT IN ('ACRYLIC_XT', 'ACRYLIC_GS', 'ACRYLIC_LED', 'PVC_FOAM');
