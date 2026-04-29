-- =================================================================
-- 03: FILE MANAGEMENT
-- =================================================================
-- File storage and associations
-- =================================================================

-- Files table
CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    original_name TEXT,
    filepath TEXT NOT NULL,
    mimetype TEXT,
    size BIGINT,
    uploaded_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON public.files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON public.files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_mimetype ON public.files(mimetype);

-- RLS
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Files are viewable by everyone" ON public.files FOR SELECT USING (true);
CREATE POLICY "Authenticated users can upload files" ON public.files FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update own files" ON public.files FOR UPDATE USING (auth.uid() = uploaded_by);
CREATE POLICY "Users can delete own files" ON public.files FOR DELETE USING (auth.uid() = uploaded_by);

COMMENT ON TABLE public.files IS 'File storage metadata';
