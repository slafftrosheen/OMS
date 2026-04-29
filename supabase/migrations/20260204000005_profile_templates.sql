-- =================================================================
-- 05: PROFILE TEMPLATES SYSTEM
-- =================================================================
-- Dynamic form system for orders
-- =================================================================

-- Profile templates (form definitions)
CREATE TABLE IF NOT EXISTS public.profile_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    created_by UUID REFERENCES public.profiles(id),
    updated_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Template sections (groups of fields)
CREATE TABLE IF NOT EXISTS public.profile_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES public.profile_templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name_en TEXT,
    display_name_ru TEXT,
    display_name_lv TEXT,
    order_index INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Template fields (individual form fields)
CREATE TABLE IF NOT EXISTS public.profile_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID REFERENCES public.profile_sections(id) ON DELETE CASCADE,
    field_key TEXT NOT NULL,
    field_type TEXT NOT NULL, -- text, number, select, multiselect, date, file, etc.
    label_en TEXT,
    label_ru TEXT,
    label_lv TEXT,
    order_index INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT false,
    options JSONB DEFAULT '[]'::jsonb,
    config JSONB DEFAULT '{}'::jsonb,
    validation_rules JSONB DEFAULT '[]'::jsonb,
    conditional_logic JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Template versions (versioning/history)
CREATE TABLE IF NOT EXISTS public.template_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES public.profile_templates(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    template_snapshot JSONB NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(template_id, version)
);

-- Order profile presets (saved configurations)
CREATE TABLE IF NOT EXISTS public.order_profile_presets (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    profile_code TEXT NOT NULL,
    configuration JSONB DEFAULT '{}'::jsonb,
    is_public BOOLEAN DEFAULT false,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profile_templates_code ON public.profile_templates(code);
CREATE INDEX IF NOT EXISTS idx_profile_templates_is_active ON public.profile_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_profile_sections_template_id ON public.profile_sections(template_id);
CREATE INDEX IF NOT EXISTS idx_profile_fields_section_id ON public.profile_fields(section_id);
CREATE INDEX IF NOT EXISTS idx_template_versions_template_id ON public.template_versions(template_id);

-- RLS
ALTER TABLE public.profile_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_profile_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Templates viewable by all" ON public.profile_templates;
CREATE POLICY "Templates viewable by all" ON public.profile_templates FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can manage templates" ON public.profile_templates;
CREATE POLICY "Authenticated users can manage templates" ON public.profile_templates FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Sections viewable by all" ON public.profile_sections;
CREATE POLICY "Sections viewable by all" ON public.profile_sections FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can manage sections" ON public.profile_sections;
CREATE POLICY "Authenticated users can manage sections" ON public.profile_sections FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Fields viewable by all" ON public.profile_fields;
CREATE POLICY "Fields viewable by all" ON public.profile_fields FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can manage fields" ON public.profile_fields;
CREATE POLICY "Authenticated users can manage fields" ON public.profile_fields FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Versions viewable by all" ON public.template_versions;
CREATE POLICY "Versions viewable by all" ON public.template_versions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can create versions" ON public.template_versions;
CREATE POLICY "Authenticated users can create versions" ON public.template_versions FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Presets viewable by all" ON public.order_profile_presets;
CREATE POLICY "Presets viewable by all" ON public.order_profile_presets FOR SELECT USING (is_public = true OR created_by = auth.uid());
DROP POLICY IF EXISTS "Users can manage own presets" ON public.order_profile_presets;
CREATE POLICY "Users can manage own presets" ON public.order_profile_presets FOR ALL USING (created_by = auth.uid());

-- Comments
COMMENT ON TABLE public.profile_templates IS 'Dynamic form template definitions';
COMMENT ON TABLE public.profile_sections IS 'Sections/groups within templates';
COMMENT ON TABLE public.profile_fields IS 'Individual fields within sections';
COMMENT ON TABLE public.template_versions IS 'Version history of templates';
COMMENT ON TABLE public.order_profile_presets IS 'Saved profile configurations for reuse';
