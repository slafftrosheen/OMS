-- =================================================================
-- 08: COMMUNICATION (CHAT AND NOTIFICATIONS)
-- =================================================================
-- Chat rooms, messages, and notifications
-- =================================================================

-- Chat rooms
CREATE TABLE IF NOT EXISTS public.chat_rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    room_type TEXT DEFAULT 'channel', -- 'channel', 'direct', 'group'
    is_private BOOLEAN DEFAULT false,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Chat messages
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id TEXT REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    variant TEXT DEFAULT 'user', -- 'user', 'system', 'notification'
    mentions TEXT[] DEFAULT '{}',
    is_edited BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    link TEXT,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    is_dismissed BOOLEAN DEFAULT false,
    source_type TEXT, -- 'order', 'stage', 'chat', 'system'
    source_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON public.chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON public.chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- RLS
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Chat: Public rooms visible to all, private rooms to members (simplified for now)
CREATE POLICY "Chat rooms viewable by all authenticated" ON public.chat_rooms 
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create chat rooms" ON public.chat_rooms 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Chat messages viewable by all authenticated" ON public.chat_messages 
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can send messages" ON public.chat_messages 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update own messages" ON public.chat_messages 
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own messages" ON public.chat_messages 
    FOR DELETE USING (auth.uid() = user_id);

-- Notifications: Users see own notifications
CREATE POLICY "Users view own notifications" ON public.notifications 
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications" ON public.notifications 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update own notifications" ON public.notifications 
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications" ON public.notifications 
    FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Seed default chat rooms
INSERT INTO public.chat_rooms (id, name, room_type, is_private)
VALUES 
    ('general', 'General', 'channel', false),
    ('workstations', 'Workstations', 'channel', false),
    ('logistics', 'Logistics', 'channel', false)
ON CONFLICT (id) DO NOTHING;

-- Comments
COMMENT ON TABLE public.chat_rooms IS 'Chat room definitions';
COMMENT ON TABLE public.chat_messages IS 'Chat messages with realtime support';
COMMENT ON TABLE public.notifications IS 'User notifications';
