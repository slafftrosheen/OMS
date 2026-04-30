-- Migration: 20260430160000_rls_hardening.sql
-- Description: Hardening RLS for user-specific data to prevent cross-user leakage.

-- 1. AI Chat Sessions & Messages
ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own sessions" ON public.ai_chat_sessions;
CREATE POLICY "Users own sessions" ON public.ai_chat_sessions
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own session messages" ON public.ai_chat_messages;
CREATE POLICY "Users own session messages" ON public.ai_chat_messages
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.ai_chat_sessions s
            WHERE s.id = ai_chat_messages.session_id
            AND s.user_id = auth.uid()
        )
    );

-- 2. AI Runs
ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own runs" ON public.ai_runs;
CREATE POLICY "Users own runs" ON public.ai_runs
    FOR ALL USING (auth.uid() = user_id);

-- 3. Canvas Documents
ALTER TABLE public.canvas_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own canvas documents" ON public.canvas_documents;
CREATE POLICY "Users own canvas documents" ON public.canvas_documents
    FOR ALL USING (auth.uid() = user_id);

-- 4. Draft Orders (Hardening)
-- Following strict requirement: auth.uid() = user_id (mapped to created_by)
DROP POLICY IF EXISTS "Orders viewable by all authenticated" ON public.draft_orders;
CREATE POLICY "Orders viewable by all authenticated" ON public.draft_orders
    FOR SELECT USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.draft_orders;
CREATE POLICY "Authenticated users can update orders" ON public.draft_orders
    FOR UPDATE USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Authenticated users can delete orders" ON public.draft_orders;
CREATE POLICY "Authenticated users can delete orders" ON public.draft_orders
    FOR DELETE USING (auth.uid() = created_by);

-- 5. Chat Messages (Hardening)
-- Following strict requirement: auth.uid() = user_id
DROP POLICY IF EXISTS "Chat messages viewable by all authenticated" ON public.chat_messages;
CREATE POLICY "Chat messages viewable by all authenticated" ON public.chat_messages
    FOR SELECT USING (auth.uid() = user_id);

-- 6. Notifications (Double check)
-- Existing: CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
-- This is already correct.
