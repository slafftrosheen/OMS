-- Migration: 20260430180000_rls_cleanup.sql
-- Description: Enable RLS on remaining tables and allow SELECT on global/public data.

-- 1. Persona Templates
ALTER TABLE public.user_persona_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Global templates are viewable by all" ON public.user_persona_templates;
CREATE POLICY "Global templates are viewable by all" ON public.user_persona_templates
    FOR SELECT USING (is_global = true OR auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can manage own templates" ON public.user_persona_templates;
CREATE POLICY "Users can manage own templates" ON public.user_persona_templates
    FOR ALL USING (auth.uid() = user_id OR public.is_admin());

-- 2. Knowledge Tables
ALTER TABLE public.company_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.framework_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can search knowledge" ON public.company_knowledge;
CREATE POLICY "Authenticated users can search knowledge" ON public.company_knowledge
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can search docs" ON public.framework_docs;
CREATE POLICY "Authenticated users can search docs" ON public.framework_docs
    FOR SELECT USING (auth.role() = 'authenticated');

-- 3. Code Chunks
ALTER TABLE public.code_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read code_chunks" ON public.code_chunks;
CREATE POLICY "auth read code_chunks" ON public.code_chunks
    FOR SELECT USING (auth.role() = 'authenticated');

-- 4. Maker Tools (if any)
-- Check if maker_tools table exists and enable RLS
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'maker_tools') THEN
        ALTER TABLE public.maker_tools ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Maker tools viewable by all" ON public.maker_tools;
        CREATE POLICY "Maker tools viewable by all" ON public.maker_tools FOR SELECT USING (true);
    END IF;
END $$;
