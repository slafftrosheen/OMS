-- =================================================================
-- 09: AUDIT AND LOGGING
-- =================================================================
-- Audit trails, station logs, search history
-- =================================================================

-- Audit log
CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id),
    username TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Station logs (workstation activity)
CREATE TABLE IF NOT EXISTS public.station_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id),
    station TEXT NOT NULL,
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Search history
CREATE TABLE IF NOT EXISTS public.search_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    filters JSONB DEFAULT '{}'::jsonb,
    results_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- FAQs
CREATE TABLE IF NOT EXISTS public.faqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type ON public.audit_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_station_logs_user_id ON public.station_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_station_logs_station ON public.station_logs(station);
CREATE INDEX IF NOT EXISTS idx_station_logs_created_at ON public.station_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON public.search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON public.search_history(created_at DESC);

-- RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

-- Audit log: System creates, users can view own or all (depending on role)
DROP POLICY IF EXISTS "Authenticated users view audit log" ON public.audit_log;
CREATE POLICY "Authenticated users view audit log" ON public.audit_log 
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "System can create audit logs" ON public.audit_log;
CREATE POLICY "System can create audit logs" ON public.audit_log 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Station logs: Viewable by all authenticated, created by users
DROP POLICY IF EXISTS "Authenticated users view station logs" ON public.station_logs;
CREATE POLICY "Authenticated users view station logs" ON public.station_logs 
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users create station logs" ON public.station_logs;
CREATE POLICY "Authenticated users create station logs" ON public.station_logs 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Search history: Users manage own history
DROP POLICY IF EXISTS "Users view own search history" ON public.search_history;
CREATE POLICY "Users view own search history" ON public.search_history 
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users create own search history" ON public.search_history;
CREATE POLICY "Users create own search history" ON public.search_history 
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own search history" ON public.search_history;
CREATE POLICY "Users delete own search history" ON public.search_history 
    FOR DELETE USING (auth.uid() = user_id);

-- FAQs: Public read, authenticated write
DROP POLICY IF EXISTS "FAQs viewable by all" ON public.faqs;
CREATE POLICY "FAQs viewable by all" ON public.faqs 
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users manage FAQs" ON public.faqs;
CREATE POLICY "Authenticated users manage FAQs" ON public.faqs 
    FOR ALL USING (auth.role() = 'authenticated');

-- Comments
COMMENT ON TABLE public.audit_log IS 'System-wide audit trail';
COMMENT ON TABLE public.station_logs IS 'Workstation activity logs';
COMMENT ON TABLE public.search_history IS 'User search queries';
COMMENT ON TABLE public.faqs IS 'Frequently asked questions';
