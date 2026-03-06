-- =================================================================
-- UNIFY MATERIALS AND INVENTORY_ITEMS TABLES
-- =================================================================
-- Migration to consolidate duplicate material management into single table
-- =================================================================

-- Step 1: Add inventory-related columns to materials table
-- =================================================================

ALTER TABLE public.materials 
ADD COLUMN IF NOT EXISTS sku TEXT,
ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_stock INTEGER,
ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'PCS',
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS vendor TEXT,
ADD COLUMN IF NOT EXISTS supplier TEXT,
ADD COLUMN IF NOT EXISTS color_code TEXT,
ADD COLUMN IF NOT EXISTS hex_color TEXT,
ADD COLUMN IF NOT EXISTS barcode TEXT,
ADD COLUMN IF NOT EXISTS price NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS section TEXT,
ADD COLUMN IF NOT EXISTS item_group TEXT,
ADD COLUMN IF NOT EXISTS subgroup TEXT,
ADD COLUMN IF NOT EXISTS note TEXT,
ADD COLUMN IF NOT EXISTS leftover_data JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS thickness_mm NUMERIC,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Step 2: Create indexes for new columns
-- =================================================================

CREATE INDEX IF NOT EXISTS idx_materials_sku ON public.materials(sku);
CREATE INDEX IF NOT EXISTS idx_materials_stock ON public.materials(stock);
CREATE INDEX IF NOT EXISTS idx_materials_section ON public.materials(section);
CREATE INDEX IF NOT EXISTS idx_materials_vendor ON public.materials(vendor);
CREATE INDEX IF NOT EXISTS idx_materials_category ON public.materials(category);

-- Step 3: Add unique constraint to sku if not exists
-- =================================================================

-- First remove any duplicate SKUs from inventory_items
DELETE FROM public.inventory_items a USING public.inventory_items b
WHERE a.ctid < b.ctid AND a.sku = b.sku;

-- Now add unique constraint to materials.sku
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'materials_sku_key'
    ) THEN
        ALTER TABLE public.materials ADD CONSTRAINT materials_sku_key UNIQUE (sku);
    END IF;
END $$;

-- Step 4: Migrate data from inventory_items to materials
-- =================================================================

-- Insert inventory_items into materials where SKU doesn't already exist
INSERT INTO public.materials (
    id,
    sku,
    code,
    category,
    name_en,
    stock,
    min_stock,
    max_stock,
    unit,
    location,
    vendor,
    supplier,
    color_code,
    hex_color,
    barcode,
    section,
    item_group,
    subgroup,
    note,
    leftover_data,
    thickness_mm,
    created_at,
    updated_at
)
SELECT 
    COALESCE(
        (SELECT id FROM public.materials m WHERE m.sku = i.sku),
        i.id
    ) as id,
    i.sku,
    COALESCE(
        (SELECT code FROM public.materials m WHERE m.sku = i.sku),
        'INV-' || i.id::text
    ) as code,
    COALESCE(
        (SELECT category FROM public.materials m WHERE m.sku = i.sku),
        i.category
    ) as category,
    COALESCE(
        (SELECT name_en FROM public.materials m WHERE m.sku = i.sku),
        i.name
    ) as name_en,
    i.stock,
    i.min_stock,
    i.max_stock,
    i.unit,
    i.location,
    i.vendor,
    i.vendor as supplier,
    i.color_code,
    NULL as hex_color,
    i.barcode,
    i.section,
    i.item_group,
    i.subgroup,
    i.note,
    COALESCE(i.leftover_data, '{}'::jsonb) as leftover_data,
    i.thickness_mm,
    LEAST(i.created_at, (SELECT COALESCE(created_at, now()) FROM public.materials m WHERE m.sku = i.sku)) as created_at,
    GREATEST(i.updated_at, (SELECT COALESCE(updated_at, now()) FROM public.materials m WHERE m.sku = i.sku)) as updated_at
FROM public.inventory_items i
WHERE NOT EXISTS (
    SELECT 1 FROM public.materials m WHERE m.sku = i.sku AND m.stock IS NOT NULL
)
ON CONFLICT (id) DO UPDATE SET
    stock = EXCLUDED.stock,
    min_stock = EXCLUDED.min_stock,
    max_stock = EXCLUDED.max_stock,
    unit = EXCLUDED.unit,
    location = EXCLUDED.location,
    vendor = EXCLUDED.vendor,
    color_code = EXCLUDED.color_code,
    barcode = EXCLUDED.barcode,
    section = EXCLUDED.section,
    item_group = EXCLUDED.item_group,
    subgroup = EXCLUDED.subgroup,
    note = EXCLUDED.note,
    leftover_data = EXCLUDED.leftover_data,
    thickness_mm = EXCLUDED.thickness_mm,
    updated_at = now();

-- Step 5: Update inventory_stock to reference materials only
-- =================================================================

-- Add material_id column to inventory_items temporarily for migration
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS material_id UUID REFERENCES public.materials(id);

-- Update inventory_items to link to corresponding materials
UPDATE public.inventory_items i
SET material_id = m.id
FROM public.materials m
WHERE m.sku = i.sku;

-- Update inventory_movements to use material_id instead of item_id where possible
UPDATE public.inventory_movements im
SET material_id = i.material_id
FROM public.inventory_items i
WHERE im.item_id = i.id AND im.material_id IS NULL;

-- Update inventory_stock to use material_id
UPDATE public.inventory_stock ist
SET material_id = i.material_id
FROM public.inventory_items i
WHERE ist.item_id = i.id AND ist.material_id IS NULL;

-- Step 6: Update foreign key constraints
-- =================================================================

-- Drop old foreign key constraints if they exist
ALTER TABLE public.inventory_movements 
DROP CONSTRAINT IF EXISTS fk_inventory_movements_item;

ALTER TABLE public.inventory_stock 
DROP CONSTRAINT IF EXISTS fk_inventory_stock_item;

-- Add new foreign key with ON DELETE SET NULL for safety
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_inventory_movements_material'
    ) THEN
        ALTER TABLE public.inventory_movements
        ADD CONSTRAINT fk_inventory_movements_material
        FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_inventory_stock_material'
    ) THEN
        ALTER TABLE public.inventory_stock
        ADD CONSTRAINT fk_inventory_stock_material
        FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Step 7: Update RLS policies for materials table
-- =================================================================

-- Ensure materials has proper RLS policies
DROP POLICY IF EXISTS "Materials viewable by all" ON public.materials;
DROP POLICY IF EXISTS "Authenticated users can manage materials" ON public.materials;

CREATE POLICY "Materials viewable by all" ON public.materials 
FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage materials" ON public.materials 
FOR ALL USING (auth.role() = 'authenticated');

-- Step 8: Create view for backwards compatibility (optional)
-- =================================================================

-- Create a view that mimics the old inventory_items structure for backwards compatibility
CREATE OR REPLACE VIEW public.inventory_items_view AS
SELECT 
    id,
    sku,
    name_en as name,
    category,
    section,
    item_group,
    subgroup,
    unit,
    stock,
    min_stock,
    max_stock,
    thickness_mm,
    location,
    vendor,
    color_code,
    barcode,
    note,
    leftover_data,
    created_at,
    updated_at
FROM public.materials
WHERE sku IS NOT NULL;

-- Step 9: Mark inventory_items as deprecated
-- =================================================================

COMMENT ON TABLE public.inventory_items IS 'DEPRECATED: Merged into materials table. Use materials table or inventory_items_view instead. Will be dropped in future migration.';

-- Step 10: Update database statistics
-- =================================================================

ANALYZE public.materials;
ANALYZE public.inventory_items;

-- Output migration summary
-- =================================================================
DO $$
DECLARE
    materials_count INTEGER;
    inventory_items_count INTEGER;
    migrated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO materials_count FROM public.materials;
    SELECT COUNT(*) INTO inventory_items_count FROM public.inventory_items;
    SELECT COUNT(*) INTO migrated_count FROM public.materials WHERE sku IS NOT NULL;
    
    RAISE NOTICE 'Migration completed successfully!';
    RAISE NOTICE 'Materials count: %', materials_count;
    RAISE NOTICE 'Inventory items count (deprecated): %', inventory_items_count;
    RAISE NOTICE 'Materials with SKU (unified): %', migrated_count;
END $$;
