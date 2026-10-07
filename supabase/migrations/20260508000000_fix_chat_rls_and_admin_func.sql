-- =================================================================
-- FIX CHAT RLS AND ADMIN FUNCTIONS
-- =================================================================

-- 1. Update is_admin() function to match new role system
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role IN ('RD', 'Boss')
    );
END;
$function$;

-- 2. Fix chat_messages RLS to allow access to public rooms and memberships
DROP POLICY IF EXISTS "Chat messages access" ON public.chat_messages;
CREATE POLICY "Chat messages access" ON public.chat_messages
FOR SELECT USING (
    -- Admins see everything
    is_admin() 
    OR 
    -- User's own messages
    user_id = auth.uid()
    OR
    -- Order-specific messages (if user can access order)
    (order_id IS NOT NULL AND can_access_order(order_id))
    OR
    -- Public rooms (any authenticated user)
    EXISTS (
        SELECT 1 FROM public.chat_rooms r 
        WHERE r.id = room_id AND (NOT r.is_private OR r.is_private IS NULL)
    )
    OR
    -- Private rooms (members only)
    EXISTS (
        SELECT 1 FROM public.chat_room_members m 
        WHERE m.room_id = room_id AND m.user_id = auth.uid()
    )
);

-- 3. Fix chat_messages INSERT policy
DROP POLICY IF EXISTS "Chat messages insert" ON public.chat_messages;
CREATE POLICY "Chat messages insert" ON public.chat_messages
FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND (
        -- Can post to public rooms
        EXISTS (
            SELECT 1 FROM public.chat_rooms r 
            WHERE r.id = room_id AND (NOT r.is_private OR r.is_private IS NULL)
        )
        OR
        -- Can post to private rooms if member
        EXISTS (
            SELECT 1 FROM public.chat_room_members m 
            WHERE m.room_id = room_id AND m.user_id = auth.uid()
        )
        OR
        -- Can post to order chat if can access order
        (order_id IS NOT NULL AND can_access_order(order_id))
        OR
        is_admin()
    )
);

-- 4. Clean up redundant/conflicting policies
DROP POLICY IF EXISTS "Chat messages viewable by all authenticated" ON public.chat_messages;
DROP POLICY IF EXISTS "Authenticated users can send messages" ON public.chat_messages;

-- 5. Ensure chat_rooms has proper read policy
DROP POLICY IF EXISTS "chat_rooms_read" ON public.chat_rooms;
CREATE POLICY "chat_rooms_read" ON public.chat_rooms
FOR SELECT USING (
    NOT is_private 
    OR is_admin() 
    OR EXISTS (SELECT 1 FROM public.chat_room_members m WHERE m.room_id = id AND m.user_id = auth.uid())
);

-- 6. Notifications RLS hardening (ensure users can only see their own)
-- Already handled in previous migrations but good to ensure
DROP POLICY IF EXISTS "notifications_owner_all" ON public.notifications;
CREATE POLICY "notifications_owner_all" ON public.notifications
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
