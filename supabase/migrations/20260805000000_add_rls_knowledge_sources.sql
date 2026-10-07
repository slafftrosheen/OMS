-- ============================================================================
-- Migration: Add RLS policies for knowledge_sources table
-- ============================================================================
-- The knowledge_sources and related tables were created without RLS policies,
-- allowing any authenticated user to access all knowledge data.
-- This migration adds proper row-level security.
-- ============================================================================

-- Enable RLS on knowledge_sources
ALTER TABLE IF EXISTS knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS knowledge_jobs ENABLE ROW LEVEL SECURITY;

-- Enable RLS on ai_chat_sessions and ai_chat_messages (already done in earlier migration, but ensure)
ALTER TABLE IF EXISTS ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own knowledge sources
DROP POLICY IF EXISTS "knowledge_sources_view_own" ON knowledge_sources;
CREATE POLICY "knowledge_sources_view_own" ON knowledge_sources
    FOR SELECT USING (
        uploader_id = auth.uid()
        OR visibility = 'global'
        OR (visibility = 'team' AND EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND (role = 'admin' OR role = 'boss' OR role = 'rd' OR roles->>'Admin' = 'SuperAdmin')
        ))
    );

-- Policy: Users can insert their own knowledge sources
DROP POLICY IF EXISTS "knowledge_sources_insert_own" ON knowledge_sources;
CREATE POLICY "knowledge_sources_insert_own" ON knowledge_sources
    FOR INSERT WITH CHECK (
        uploader_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND (role = 'admin' OR role = 'boss' OR role = 'rd' OR roles->>'Admin' = 'SuperAdmin')
        )
    );

-- Policy: Users can update their own knowledge sources
DROP POLICY IF EXISTS "knowledge_sources_update_own" ON knowledge_sources;
CREATE POLICY "knowledge_sources_update_own" ON knowledge_sources
    FOR UPDATE USING (
        uploader_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND (role = 'admin' OR role = 'boss' OR role = 'rd' OR roles->>'Admin' = 'SuperAdmin')
        )
    );

-- Policy: Users can delete their own knowledge sources
DROP POLICY IF EXISTS "knowledge_sources_delete_own" ON knowledge_sources;
CREATE POLICY "knowledge_sources_delete_own" ON knowledge_sources
    FOR DELETE USING (
        uploader_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND (role = 'admin' OR role = 'boss' OR role = 'rd' OR roles->>'Admin' = 'SuperAdmin')
        )
    );

-- Policy: AI chat sessions - users own their sessions
DROP POLICY IF EXISTS "ai_chat_sessions_view_own" ON ai_chat_sessions;
CREATE POLICY "ai_chat_sessions_view_own" ON ai_chat_sessions
    FOR SELECT USING (user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR roles->>'Admin' = 'SuperAdmin')
    ));

DROP POLICY IF EXISTS "ai_chat_sessions_modify_own" ON ai_chat_sessions;
CREATE POLICY "ai_chat_sessions_modify_own" ON ai_chat_sessions
    FOR ALL USING (user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR roles->>'Admin' = 'SuperAdmin')
    ));

-- Policy: AI chat messages - access via session ownership
DROP POLICY IF EXISTS "ai_chat_messages_view_own" ON ai_chat_messages;
CREATE POLICY "ai_chat_messages_view_own" ON ai_chat_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM ai_chat_sessions s 
            WHERE s.id = session_id AND s.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles p 
            WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.roles->>'Admin' = 'SuperAdmin')
        )
    );

DROP POLICY IF EXISTS "ai_chat_messages_insert_own" ON ai_chat_messages;
CREATE POLICY "ai_chat_messages_insert_own" ON ai_chat_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM ai_chat_sessions s 
            WHERE s.id = session_id AND s.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles p 
            WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.roles->>'Admin' = 'SuperAdmin')
        )
    );

-- Comments
COMMENT ON POLICY "knowledge_sources_view_own" ON knowledge_sources IS 'Users can view public/global knowledge or their own private knowledge';
COMMENT ON POLICY "ai_chat_sessions_view_own" ON ai_chat_sessions IS 'Users can view their own chat sessions';
COMMENT ON POLICY "ai_chat_messages_view_own" ON ai_chat_messages IS 'Users can view messages from their sessions';