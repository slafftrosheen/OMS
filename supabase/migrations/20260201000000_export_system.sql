-- Export system tables and storage
-- This migration creates the export_history table and storage bucket for exports

-- Export history table (used by existing API at /api/export)
-- Note: template_id references export_templates table, but we use ALTER TABLE
-- to add the constraint after both tables exist
CREATE TABLE IF NOT EXISTS public.export_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_type TEXT NOT NULL CHECK (export_type IN ('orders', 'stations', 'loading_schedule', 'materials', 'inventory', 'analytics', 'custom')),
    format TEXT NOT NULL CHECK (format IN ('excel', 'pdf', 'csv', 'xlsx', 'json')),
    template_id UUID, -- FK added after export_templates table creation
    filters JSONB DEFAULT '{}',
    file_name TEXT,
    file_path TEXT,
    file_size INTEGER,
    records_count INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    processing_time_ms INTEGER,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_export_history_created_by ON public.export_history(created_by);
CREATE INDEX IF NOT EXISTS idx_export_history_status ON public.export_history(status);
CREATE INDEX IF NOT EXISTS idx_export_history_created_at ON public.export_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_history_expires_at ON public.export_history(expires_at);

-- Enable Row Level Security
ALTER TABLE public.export_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own exports"
    ON public.export_history FOR SELECT
    USING (auth.uid() = created_by);

CREATE POLICY "Users can create exports"
    ON public.export_history FOR INSERT
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own exports"
    ON public.export_history FOR UPDATE
    USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own exports"
    ON public.export_history FOR DELETE
    USING (auth.uid() = created_by);

-- Export templates table (optional feature for saved export configurations)
CREATE TABLE IF NOT EXISTS public.export_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    template_type TEXT NOT NULL CHECK (template_type IN ('orders', 'stations', 'loading_schedule', 'materials', 'inventory', 'analytics', 'custom')),
    format TEXT NOT NULL CHECK (format IN ('excel', 'pdf', 'csv', 'xlsx', 'json')),
    config JSONB DEFAULT '{}',
    columns TEXT[] DEFAULT '{}',
    filters JSONB DEFAULT '{}',
    styling JSONB,
    is_public BOOLEAN DEFAULT false,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- Create indexes for templates
CREATE INDEX IF NOT EXISTS idx_export_templates_created_by ON public.export_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_export_templates_template_type ON public.export_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_export_templates_last_used_at ON public.export_templates(last_used_at DESC NULLS LAST);

-- Enable RLS for templates
ALTER TABLE public.export_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for templates
CREATE POLICY "Users can view own or public templates"
    ON public.export_templates FOR SELECT
    USING (auth.uid() = created_by OR is_public = true);

CREATE POLICY "Users can create templates"
    ON public.export_templates FOR INSERT
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own templates"
    ON public.export_templates FOR UPDATE
    USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own templates"
    ON public.export_templates FOR DELETE
    USING (auth.uid() = created_by);

-- Add foreign key from export_history to templates
ALTER TABLE public.export_history 
ADD CONSTRAINT fk_export_history_template 
FOREIGN KEY (template_id) REFERENCES public.export_templates(id) ON DELETE SET NULL;

-- Cleanup function for expired exports
CREATE OR REPLACE FUNCTION public.cleanup_expired_exports()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.export_history
    WHERE expires_at < NOW() AND status IN ('completed', 'failed');
END;
$$;

-- Storage bucket for exports (only insert if it doesn't exist)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'exports', 
    'exports', 
    false,
    52428800, -- 50MB limit
    ARRAY['text/csv', 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/json']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
-- Expected folder structure for exports: exports/{user_id}/{filename}
-- The API uploads files to 'exports/{user.id}/{fileName}'
CREATE POLICY "Users can upload own exports"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'exports' AND
    (storage.foldername(name))[1] = 'exports' AND
    (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Users can read own exports"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'exports' AND
    (storage.foldername(name))[1] = 'exports' AND
    (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Users can delete own exports"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'exports' AND
    (storage.foldername(name))[1] = 'exports' AND
    (storage.foldername(name))[2] = auth.uid()::text
);
