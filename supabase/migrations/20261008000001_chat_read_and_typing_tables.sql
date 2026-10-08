-- Phase 3: restore missing chat infrastructure (Oct 8, commit 733d2ef deleted dead subsystems; these were live before removal)
-- Tables: chat_read_status, chat_typing_indicators. Storage bucket: chat-attachments.
-- Apply via: docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/migrations/...

CREATE TABLE IF NOT EXISTS public.chat_read_status (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES draft_orders(id) ON DELETE CASCADE,
    last_read_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (user_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_read_status_order ON public.chat_read_status(order_id);

CREATE TABLE IF NOT EXISTS public.chat_typing_indicators (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES draft_orders(id) ON DELETE CASCADE,
    is_typing BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (user_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_typing_indicators_order ON public.chat_typing_indicators(order_id);

COMMENT ON TABLE public.chat_read_status IS 'Tracks per-user last-read timestamp per order chat.';
COMMENT ON TABLE public.chat_typing_indicators IS 'Transient typing indicator for real-time chat.';

-- Storage bucket creation must be done via Supabase CLI / Docker storage service (not SQL);
-- command: supabase storage create chat-attachments || docker-compose restart storage
