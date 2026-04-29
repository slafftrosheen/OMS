-- =================================================================
-- 10: EXPORT SYSTEM
-- =================================================================
-- Export templates and history
-- =================================================================

-- Export templates
CREATE TABLE IF NOT EXISTS public.export_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    template_type TEXT NOT NULL, -- 'order', 'inventory', 'report', 'manifest'
    format TEXT DEFAULT 'csv', -- 'csv', 'excel', 'pdf'
    config JSONB DEFAULT '{}'::jsonb,
    columns JSONB DEFAULT '[]'::jsonb,
    filters JSONB DEFAULT '{}'::jsonb,
    styling JSONB DEFAULT '{}'::jsonb,
    is_public BOOLEAN DEFAULT false,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_used_at TIMESTAMPTZ
);

-- Export history
CREATE TABLE IF NOT EXISTS public.export_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_type TEXT NOT NULL,
    format TEXT NOT NULL,
    template_id UUID REFERENCES public.export_templates(id) ON DELETE SET NULL,
    filters JSONB DEFAULT '{}'::jsonb,
    file_name TEXT,
    file_path TEXT,
    file_size BIGINT,
    records_count INTEGER,
    status TEXT DEFAULT 'processing', -- 'processing', 'completed', 'failed'
    processing_time_ms INTEGER,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_export_templates_type ON public.export_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_export_templates_is_public ON public.export_templates(is_public);
CREATE INDEX IF NOT EXISTS idx_export_history_created_by ON public.export_history(created_by);
CREATE INDEX IF NOT EXISTS idx_export_history_created_at ON public.export_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_history_status ON public.export_history(status);

-- RLS
ALTER TABLE public.export_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public templates viewable by all" ON public.export_templates;
CREATE POLICY "Public templates viewable by all" ON public.export_templates 
    FOR SELECT USING (is_public = true OR created_by = auth.uid());

DROP POLICY IF EXISTS "Users manage own templates" ON public.export_templates;
CREATE POLICY "Users manage own templates" ON public.export_templates 
    FOR ALL USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Users view own export history" ON public.export_history;
CREATE POLICY "Users view own export history" ON public.export_history 
    FOR SELECT USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Users create exports" ON public.export_history;
CREATE POLICY "Users create exports" ON public.export_history 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Comments
COMMENT ON TABLE public.export_templates IS 'Reusable export templates';
COMMENT ON TABLE public.export_history IS 'Export job history and files';
