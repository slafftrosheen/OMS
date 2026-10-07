-- =================================================================
-- FIX RLS RECURSION AND OPTIMIZE CHAT POLICIES
-- =================================================================

-- 1. Fix chat_room_members recursion
DROP POLICY IF EXISTS "chat_room_members_read" ON public.chat_room_members;
CREATE POLICY "chat_room_members_read" ON public.chat_room_members
FOR SELECT USING (
    auth.uid() = user_id 
    OR is_admin()
);

-- 2. Fix chat_rooms recursion
DROP POLICY IF EXISTS "chat_rooms_read" ON public.chat_rooms;
CREATE POLICY "chat_rooms_read" ON public.chat_rooms
FOR SELECT USING (
    NOT is_private 
    OR is_admin() 
    OR id IN (
        SELECT m.room_id FROM public.chat_room_members m 
        WHERE m.user_id = auth.uid()
    )
);

-- 3. Fix chat_messages SELECT policy (prevent recursion and improve performance)
DROP POLICY IF EXISTS "Chat messages access" ON public.chat_messages;
CREATE POLICY "Chat messages access" ON public.chat_messages
FOR SELECT USING (
    is_admin() 
    OR user_id = auth.uid()
    OR (order_id IS NOT NULL AND can_access_order(order_id))
    OR room_id IN (
        -- Public rooms
        SELECT id FROM public.chat_rooms WHERE NOT is_private
        UNION
        -- Member of private rooms
        SELECT room_id FROM public.chat_room_members WHERE user_id = auth.uid()
    )
);

-- 4. Fix chat_messages INSERT policy
DROP POLICY IF EXISTS "Chat messages insert" ON public.chat_messages;
CREATE POLICY "Chat messages insert" ON public.chat_messages
FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND (
        is_admin()
        OR (order_id IS NOT NULL AND can_access_order(order_id))
        OR room_id IN (
            SELECT id FROM public.chat_rooms WHERE NOT is_private
            UNION
            SELECT room_id FROM public.chat_room_members WHERE user_id = auth.uid()
        )
    )
);
