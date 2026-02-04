-- =================================================================
-- 04: MATERIALS AND INVENTORY
-- =================================================================
-- Material types, inventory items, stock tracking
-- =================================================================

-- Material definitions
CREATE TABLE IF NOT EXISTS public.materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    name_en TEXT,
    name_ru TEXT,
    name_lv TEXT,
    thickness_options JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Material thickness options
CREATE TABLE IF NOT EXISTS public.material_thickness_options (
    id SERIAL PRIMARY KEY,
    material_type TEXT NOT NULL,
    thickness NUMERIC NOT NULL,
    unit TEXT DEFAULT 'mm',
    color TEXT,
    display_name TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Inventory items (physical stock)
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    section TEXT,
    item_group TEXT,
    subgroup TEXT,
    unit TEXT DEFAULT 'pieces',
    stock INTEGER DEFAULT 0,
    min_stock INTEGER DEFAULT 0,
    max_stock INTEGER,
    thickness_mm NUMERIC,
    location TEXT,
    vendor TEXT,
    color_code TEXT,
    barcode TEXT,
    note TEXT,
    leftover_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inventory stock tracking (history/movements)
CREATE TABLE IF NOT EXISTS public.inventory_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID REFERENCES public.materials(id) ON DELETE SET NULL,
    item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    thickness NUMERIC,
    quantity_in_stock INTEGER DEFAULT 0,
    unit_of_measure TEXT DEFAULT 'pieces',
    location TEXT,
    minimum_stock_level INTEGER DEFAULT 0,
    reorder_point INTEGER,
    cost_per_unit NUMERIC,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inventory movements (audit trail)
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    material_id UUID REFERENCES public.materials(id) ON DELETE SET NULL,
    movement_type TEXT NOT NULL, -- 'in', 'out', 'adjustment', 'transfer', 'order'
    quantity INTEGER NOT NULL,
    reference_id UUID, -- Order ID or other reference
    reference_type TEXT, -- 'order', 'adjustment', 'return'
    performed_by UUID REFERENCES public.profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_materials_category ON public.materials(category);
CREATE INDEX idx_materials_code ON public.materials(code);
CREATE INDEX idx_inventory_items_sku ON public.inventory_items(sku);
CREATE INDEX idx_inventory_items_category ON public.inventory_items(category);
CREATE INDEX idx_inventory_items_stock ON public.inventory_items(stock);
CREATE INDEX idx_inventory_stock_material_id ON public.inventory_stock(material_id);
CREATE INDEX idx_inventory_stock_item_id ON public.inventory_stock(item_id);
CREATE INDEX idx_inventory_movements_item_id ON public.inventory_movements(item_id);
CREATE INDEX idx_inventory_movements_created_at ON public.inventory_movements(created_at DESC);

-- RLS
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_thickness_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Materials: Everyone can view, authenticated can manage
CREATE POLICY "Materials viewable by all" ON public.materials FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage materials" ON public.materials FOR ALL USING (auth.role() = 'authenticated');

-- Inventory: Everyone can view, authenticated can manage
CREATE POLICY "Inventory viewable by all" ON public.inventory_items FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage inventory" ON public.inventory_items FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Stock viewable by all" ON public.inventory_stock FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage stock" ON public.inventory_stock FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Movements viewable by all" ON public.inventory_movements FOR SELECT USING (true);
CREATE POLICY "Authenticated users can record movements" ON public.inventory_movements FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Thickness options viewable by all" ON public.material_thickness_options FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage thickness options" ON public.material_thickness_options FOR ALL USING (auth.role() = 'authenticated');

-- Comments
COMMENT ON TABLE public.materials IS 'Material type definitions with localized names';
COMMENT ON TABLE public.inventory_items IS 'Physical inventory items with stock levels';
COMMENT ON TABLE public.inventory_stock IS 'Stock tracking per material/item';
COMMENT ON TABLE public.inventory_movements IS 'Audit trail of inventory changes';
