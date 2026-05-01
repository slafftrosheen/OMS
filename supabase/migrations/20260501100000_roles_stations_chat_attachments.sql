-- =================================================================
-- ROLES / STATIONS / CHAT MEMBERS / FILE ATTACHMENTS
-- =================================================================
-- Redesigned role hierarchy:
--   RD              - R&D superuser (all access, own R&D orders)
--   Boss            - Full access (same as RD)
--   HeadOfProduction- Full access except draft creation; notified on drafts
--   StationHead     - Full read + write limited to own station name
--   Operator        - Full read, no AI lab
-- Stations: CNC, Sanding, Bending, Welding, Painting, FilmCovering,
--           Glueing, Assembly, AntonStation, QualityControl, Packing
-- =================================================================

-- ----------------------------------------------------------------
-- 1. Extend profiles with role column (replaces the JSONB mess)
-- ----------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'Operator',
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Allowed roles check
DO $$ BEGIN
    ALTER TABLE public.profiles
        ADD CONSTRAINT profiles_role_check
        CHECK (role IN ('RD','Boss','HeadOfProduction','StationHead','Operator'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------
-- 2. Stations master table
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stations (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the canonical station list
INSERT INTO public.stations (id, name, display_order) VALUES
    ('cnc',           'CNC',           1),
    ('sanding',       'Sanding',       2),
    ('bending',       'Bending',       3),
    ('welding',       'Welding',       4),
    ('painting',      'Painting',      5),
    ('film_covering', 'Film Covering', 6),
    ('glueing',       'Glueing',       7),
    ('assembly',      'Assembly',      8),
    ('anton',         'Anton Station', 9),
    ('qc',            'Quality Control',10),
    ('packing',       'Packing',       11)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;

-- RLS: all authenticated users can read stations
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stations_read" ON public.stations;
CREATE POLICY "stations_read" ON public.stations FOR SELECT USING (auth.uid() IS NOT NULL);
-- Only RD/Boss/HeadOfProduction may mutate (enforced via service role in API)

-- ----------------------------------------------------------------
-- 3. User → Station assignments (replaces profiles.stations array)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_stations (
    user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    station_id TEXT REFERENCES public.stations(id) ON DELETE CASCADE,
    is_head    BOOLEAN NOT NULL DEFAULT false,  -- true = StationHead for this station
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, station_id)
);

CREATE INDEX IF NOT EXISTS idx_user_stations_user_id ON public.user_stations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stations_station_id ON public.user_stations(station_id);

ALTER TABLE public.user_stations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_stations_read" ON public.user_stations;
CREATE POLICY "user_stations_read" ON public.user_stations FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "user_stations_write" ON public.user_stations;
CREATE POLICY "user_stations_write" ON public.user_stations FOR ALL
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- ----------------------------------------------------------------
-- 4. R&D order marker on draft_orders
-- ----------------------------------------------------------------
ALTER TABLE public.draft_orders
    ADD COLUMN IF NOT EXISTS is_rd BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS rd_label TEXT;

-- ----------------------------------------------------------------
-- 5. Chat room members (private rooms / DMs)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_room_members (
    room_id    TEXT NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_admin   BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_room_members_user ON public.chat_room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_room_members_room ON public.chat_room_members(room_id);

ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;
-- Users see memberships for rooms they belong to
DROP POLICY IF EXISTS "chat_room_members_read" ON public.chat_room_members;
CREATE POLICY "chat_room_members_read" ON public.chat_room_members
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND (
            -- Public room: anyone can see members
            EXISTS (SELECT 1 FROM public.chat_rooms r WHERE r.id = room_id AND NOT r.is_private)
            OR
            -- Private room: only members
            auth.uid() = user_id
        )
    );
DROP POLICY IF EXISTS "chat_room_members_insert" ON public.chat_room_members;
CREATE POLICY "chat_room_members_insert" ON public.chat_room_members
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "chat_room_members_delete" ON public.chat_room_members;
CREATE POLICY "chat_room_members_delete" ON public.chat_room_members
    FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 6. Update chat_messages: add content column alias + reply support
-- ----------------------------------------------------------------
ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS content TEXT,
    ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';

-- Keep text and content in sync (content is canonical going forward)
UPDATE public.chat_messages SET content = text WHERE content IS NULL;

-- ----------------------------------------------------------------
-- 7. Chat message attachments (files, images, voice)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id   UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    room_id      TEXT NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
    uploader_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    file_name    TEXT NOT NULL,
    file_type    TEXT NOT NULL,   -- MIME type
    file_size    BIGINT NOT NULL, -- bytes
    storage_path TEXT NOT NULL,   -- Supabase Storage path
    attachment_kind TEXT NOT NULL DEFAULT 'file',
        -- 'file' | 'image' | 'voice' | 'video'
    duration_secs NUMERIC,        -- for voice/video
    width INT,                    -- for image/video
    height INT,                   -- for image/video
    thumbnail_path TEXT,          -- for image/video previews
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_message ON public.chat_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_room    ON public.chat_attachments(room_id);

ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;
-- All authenticated users can view attachments in rooms they have access to
DROP POLICY IF EXISTS "chat_attachments_read" ON public.chat_attachments;
CREATE POLICY "chat_attachments_read" ON public.chat_attachments
    FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "chat_attachments_insert" ON public.chat_attachments;
CREATE POLICY "chat_attachments_insert" ON public.chat_attachments
    FOR INSERT WITH CHECK (auth.uid() = uploader_id);
DROP POLICY IF EXISTS "chat_attachments_delete" ON public.chat_attachments;
CREATE POLICY "chat_attachments_delete" ON public.chat_attachments
    FOR DELETE USING (auth.uid() = uploader_id);

-- Realtime for attachments
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'chat_attachments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_attachments;
    END IF;
END $$;

-- ----------------------------------------------------------------
-- 8. Update user_preferences: add locale column properly
-- ----------------------------------------------------------------
ALTER TABLE public.user_preferences
    ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS font_scale NUMERIC DEFAULT 1.0,
    ADD COLUMN IF NOT EXISTS notification_sound BOOLEAN DEFAULT true;

-- ----------------------------------------------------------------
-- 9. Update chat_rooms: add station rooms for new stations
-- ----------------------------------------------------------------
INSERT INTO public.chat_rooms (id, name, room_type, is_private) VALUES
    ('station-cnc',          'CNC',           'channel', false),
    ('station-sanding',      'Sanding',       'channel', false),
    ('station-bending',      'Bending',       'channel', false),
    ('station-welding',      'Welding',       'channel', false),
    ('station-painting',     'Painting',      'channel', false),
    ('station-film',         'Film Covering', 'channel', false),
    ('station-glueing',      'Glueing',       'channel', false),
    ('station-assembly',     'Assembly',      'channel', false),
    ('station-anton',        'Anton Station', 'channel', false),
    ('station-qc',           'Quality Control','channel',false),
    ('station-packing',      'Packing',       'channel', false),
    ('rd',                   'R&D',           'channel', false),
    ('announcements',        'Announcements', 'channel', false)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- 10. AI Lab: per-user RLS on sessions and messages
-- ----------------------------------------------------------------
ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_sessions_owner" ON public.ai_chat_sessions;
CREATE POLICY "ai_sessions_owner" ON public.ai_chat_sessions
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_messages_owner" ON public.ai_chat_messages;
CREATE POLICY "ai_messages_owner" ON public.ai_chat_messages
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.ai_chat_sessions s
            WHERE s.id = session_id AND s.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.ai_chat_sessions s
            WHERE s.id = session_id AND s.user_id = auth.uid()
        )
    );

-- Canvas documents: per-user
ALTER TABLE public.canvas_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "canvas_owner" ON public.canvas_documents;
CREATE POLICY "canvas_owner" ON public.canvas_documents
    FOR ALL USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- ----------------------------------------------------------------
-- 11. Notifications: ensure hard per-user RLS (re-apply clean)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "notifications_owner_all" ON public.notifications;
CREATE POLICY "notifications_owner_all" ON public.notifications
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- System/service role can still INSERT via service_role key
-- (no check on insert needed because service_role bypasses RLS)

-- ----------------------------------------------------------------
-- 12. Promote existing SuperAdmin users to RD role
-- ----------------------------------------------------------------
UPDATE public.profiles
SET role = 'RD'
WHERE roles::text LIKE '%SuperAdmin%'
   OR roles::text LIKE '%superadmin%';

COMMENT ON TABLE public.stations IS 'Canonical production station list';
COMMENT ON TABLE public.user_stations IS 'User-to-station assignments with head flag';
COMMENT ON TABLE public.chat_room_members IS 'Private room memberships';
COMMENT ON TABLE public.chat_attachments IS 'File/image/voice attachments in chat messages';
