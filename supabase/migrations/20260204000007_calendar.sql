-- =================================================================
-- 07: CALENDAR AND LOADING EVENTS
-- =================================================================
-- Calendar system for scheduling and loading
-- =================================================================

-- Calendar events (base table)
CREATE TABLE IF NOT EXISTS public.calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL, -- 'loading', 'meeting', 'reminder'
    date DATE NOT NULL,
    title TEXT,
    note TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Loading events (extends calendar_events)
CREATE TABLE IF NOT EXISTS public.loading_events (
    id UUID PRIMARY KEY REFERENCES public.calendar_events(id) ON DELETE CASCADE,
    carrier TEXT,
    window_start TIME,
    window_end TIME,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Meeting events (extends calendar_events)
CREATE TABLE IF NOT EXISTS public.meeting_events (
    id UUID PRIMARY KEY REFERENCES public.calendar_events(id) ON DELETE CASCADE,
    start_time TIME,
    end_time TIME,
    location TEXT,
    attendees TEXT[],
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Loading event POs (many-to-many: loading events <-> orders)
CREATE TABLE IF NOT EXISTS public.loading_event_pos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loading_event_id UUID REFERENCES public.loading_events(id) ON DELETE CASCADE,
    draft_order_id UUID REFERENCES public.draft_orders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(loading_event_id, draft_order_id)
);

-- Loading days (capacity management)
CREATE TABLE IF NOT EXISTS public.loading_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE UNIQUE NOT NULL,
    max_capacity INTEGER DEFAULT 10,
    notes TEXT,
    is_blocked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Capacity configuration
CREATE TABLE IF NOT EXISTS public.capacity_config (
    id SERIAL PRIMARY KEY,
    config_type TEXT NOT NULL,
    default_capacity INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Day capacities (per weekday)
CREATE TABLE IF NOT EXISTS public.day_capacities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    capacity_config_id INTEGER REFERENCES public.capacity_config(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL, -- 0=Sunday, 1=Monday, etc.
    available_capacity INTEGER DEFAULT 0,
    used_capacity INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_calendar_events_date ON public.calendar_events(date);
CREATE INDEX idx_calendar_events_kind ON public.calendar_events(kind);
CREATE INDEX idx_loading_events_id ON public.loading_events(id);
CREATE INDEX idx_loading_event_pos_event_id ON public.loading_event_pos(loading_event_id);
CREATE INDEX idx_loading_event_pos_order_id ON public.loading_event_pos(draft_order_id);
CREATE INDEX idx_loading_days_date ON public.loading_days(date);

-- RLS
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loading_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loading_event_pos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loading_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacity_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_capacities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Calendar events viewable by all authenticated" ON public.calendar_events FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage calendar events" ON public.calendar_events FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Loading events viewable by all authenticated" ON public.loading_events FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage loading events" ON public.loading_events FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Meeting events viewable by all authenticated" ON public.meeting_events FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage meeting events" ON public.meeting_events FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Loading event POs viewable by all authenticated" ON public.loading_event_pos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage loading event POs" ON public.loading_event_pos FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Loading days viewable by all authenticated" ON public.loading_days FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage loading days" ON public.loading_days FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Capacity config viewable by all" ON public.capacity_config FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage capacity config" ON public.capacity_config FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Day capacities viewable by all" ON public.day_capacities FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage day capacities" ON public.day_capacities FOR ALL USING (auth.role() = 'authenticated');

-- Comments
COMMENT ON TABLE public.calendar_events IS 'Base calendar events table';
COMMENT ON TABLE public.loading_events IS 'Loading/shipping events';
COMMENT ON TABLE public.meeting_events IS 'Meeting/appointment events';
COMMENT ON TABLE public.loading_event_pos IS 'Orders assigned to loading events';
COMMENT ON TABLE public.loading_days IS 'Daily loading capacity management';
