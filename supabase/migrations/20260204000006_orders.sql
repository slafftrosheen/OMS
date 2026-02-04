-- =================================================================
-- 06: ORDERS SYSTEM
-- =================================================================
-- Core order management tables
-- =================================================================

-- Delivery presets
CREATE TABLE IF NOT EXISTS public.delivery_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    contact TEXT,
    phone TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Draft orders (main order table)
CREATE TABLE IF NOT EXISTS public.draft_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number TEXT UNIQUE NOT NULL,
    client TEXT NOT NULL,
    title TEXT,
    due_date DATE,
    loading_date DATE,
    cdr_file_id UUID REFERENCES public.files(id),
    pdf_file_id UUID REFERENCES public.files(id),
    status TEXT DEFAULT 'draft',
    notes TEXT,
    priority TEXT DEFAULT 'normal',
    delivery_address TEXT,
    delivery_contact TEXT,
    delivery_phone TEXT,
    delivery_preset_id UUID REFERENCES public.delivery_presets(id),
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Order profiles (profile instances within orders)
CREATE TABLE IF NOT EXISTS public.order_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_order_id UUID REFERENCES public.draft_orders(id) ON DELETE CASCADE,
    profile_template_id UUID REFERENCES public.profile_templates(id),
    quantity1 INTEGER,
    quantity2 INTEGER,
    quantity3 INTEGER,
    quantity4 INTEGER,
    configuration JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Order files (file attachments)
CREATE TABLE IF NOT EXISTS public.order_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_order_id UUID REFERENCES public.draft_orders(id) ON DELETE CASCADE,
    file_id UUID REFERENCES public.files(id) ON DELETE CASCADE,
    file_type TEXT, -- 'pdf', 'cdr', 'image', 'document'
    display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(draft_order_id, file_id)
);

-- Order materials
CREATE TABLE IF NOT EXISTS public.order_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_order_id UUID REFERENCES public.draft_orders(id) ON DELETE CASCADE,
    material_type TEXT NOT NULL,
    material_category TEXT,
    thickness NUMERIC,
    dimensions TEXT,
    color TEXT,
    ral_code TEXT,
    pantone_code TEXT,
    hex_code TEXT,
    oracal_code TEXT,
    quantity NUMERIC,
    unit TEXT DEFAULT 'pieces',
    supplier TEXT,
    notes TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Order custom fields
CREATE TABLE IF NOT EXISTS public.order_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_order_id UUID REFERENCES public.draft_orders(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    label TEXT,
    value TEXT,
    field_type TEXT DEFAULT 'text',
    display_order INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(draft_order_id, key)
);

-- Order stages (workflow stages)
CREATE TABLE IF NOT EXISTS public.order_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_order_id UUID REFERENCES public.draft_orders(id) ON DELETE CASCADE,
    station TEXT NOT NULL, -- CAD, CNC, SANDING, BENDING, WELDING, PAINT, ASSEMBLY, QC, LOGISTICS
    state TEXT DEFAULT 'NOT_STARTED', -- NOT_STARTED, QUEUED, IN_PROGRESS, BLOCKED, REWORK, COMPLETED
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    blocked_reason TEXT,
    estimated_hours NUMERIC,
    actual_hours NUMERIC,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(draft_order_id, station)
);

-- Order assignees
CREATE TABLE IF NOT EXISTS public.order_assignees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_order_id UUID REFERENCES public.draft_orders(id) ON DELETE CASCADE,
    assignee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES public.profiles(id),
    assigned_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(draft_order_id, assignee_id)
);

-- Indexes
CREATE INDEX idx_draft_orders_po_number ON public.draft_orders(po_number);
CREATE INDEX idx_draft_orders_client ON public.draft_orders(client);
CREATE INDEX idx_draft_orders_status ON public.draft_orders(status);
CREATE INDEX idx_draft_orders_loading_date ON public.draft_orders(loading_date);
CREATE INDEX idx_draft_orders_created_at ON public.draft_orders(created_at DESC);
CREATE INDEX idx_order_profiles_order_id ON public.order_profiles(draft_order_id);
CREATE INDEX idx_order_files_order_id ON public.order_files(draft_order_id);
CREATE INDEX idx_order_materials_order_id ON public.order_materials(draft_order_id);
CREATE INDEX idx_order_fields_order_id ON public.order_fields(draft_order_id);
CREATE INDEX idx_order_stages_order_id ON public.order_stages(draft_order_id);
CREATE INDEX idx_order_stages_station ON public.order_stages(station);
CREATE INDEX idx_order_stages_state ON public.order_stages(state);
CREATE INDEX idx_order_assignees_order_id ON public.order_assignees(draft_order_id);
CREATE INDEX idx_order_assignees_assignee_id ON public.order_assignees(assignee_id);

-- RLS
ALTER TABLE public.delivery_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delivery presets viewable by all" ON public.delivery_presets FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage delivery presets" ON public.delivery_presets FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Orders viewable by all authenticated" ON public.draft_orders FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can create orders" ON public.draft_orders FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update orders" ON public.draft_orders FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can delete orders" ON public.draft_orders FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Order profiles viewable by all authenticated" ON public.order_profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage order profiles" ON public.order_profiles FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Order files viewable by all authenticated" ON public.order_files FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage order files" ON public.order_files FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Order materials viewable by all authenticated" ON public.order_materials FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage order materials" ON public.order_materials FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Order fields viewable by all authenticated" ON public.order_fields FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage order fields" ON public.order_fields FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Order stages viewable by all authenticated" ON public.order_stages FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage order stages" ON public.order_stages FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Order assignees viewable by all authenticated" ON public.order_assignees FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage order assignees" ON public.order_assignees FOR ALL USING (auth.role() = 'authenticated');

-- Comments
COMMENT ON TABLE public.draft_orders IS 'Main order/PO table';
COMMENT ON TABLE public.order_profiles IS 'Profile instances within orders';
COMMENT ON TABLE public.order_materials IS 'Materials specified for orders';
COMMENT ON TABLE public.order_fields IS 'Custom fields per order';
COMMENT ON TABLE public.order_stages IS 'Workflow stages per order';
COMMENT ON TABLE public.order_assignees IS 'Staff assigned to orders';
