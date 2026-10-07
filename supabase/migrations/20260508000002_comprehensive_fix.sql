-- =================================================================
-- COMPREHENSIVE DB FIX: ROLES, STATIONS, AND RLS
-- =================================================================

-- 1. Ensure all users have a valid role
UPDATE public.profiles 
SET role = 'Operator' 
WHERE role IS NULL OR role NOT IN ('RD', 'Boss', 'HeadOfProduction', 'StationHead', 'Operator');

-- 2. Normalize existing station assignments (lowercase)
UPDATE public.user_stations SET station_id = LOWER(station_id);
UPDATE public.profiles SET stations = ARRAY(SELECT LOWER(unnest(stations)));

-- 3. Fix is_admin() function to be bulletproof
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    user_role text;
BEGIN
    SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();
    RETURN user_role IN ('RD', 'Boss');
END;
$function$;

-- 4. Break RLS recursion once and for all
-- Drop all chat-related policies
DROP POLICY IF EXISTS "chat_rooms_read" ON public.chat_rooms;
DROP POLICY IF EXISTS "chat_rooms_insert" ON public.chat_rooms;
DROP POLICY IF EXISTS "chat_rooms_read_all" ON public.chat_rooms;
DROP POLICY IF EXISTS "chat_rooms_insert_admin" ON public.chat_rooms;
DROP POLICY IF EXISTS "chat_room_members_read" ON public.chat_room_members;
DROP POLICY IF EXISTS "chat_room_members_insert" ON public.chat_room_members;
DROP POLICY IF EXISTS "chat_room_members_delete" ON public.chat_room_members;
DROP POLICY IF EXISTS "chat_room_members_read_own" ON public.chat_room_members;
DROP POLICY IF EXISTS "chat_room_members_all_admin" ON public.chat_room_members;
DROP POLICY IF EXISTS "Chat messages access" ON public.chat_messages;
DROP POLICY IF EXISTS "Chat messages insert" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can update own messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can delete own messages" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_read" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_update_own" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_delete_own" ON public.chat_messages;

-- Simple, non-recursive policies
-- ROOMS: All authenticated users can see all rooms (simplest fix)
CREATE POLICY "chat_rooms_read_all" ON public.chat_rooms
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "chat_rooms_insert_admin" ON public.chat_rooms
FOR INSERT WITH CHECK (is_admin());

-- MEMBERS: Users see their own memberships or if admin
CREATE POLICY "chat_room_members_read_own" ON public.chat_room_members
FOR SELECT USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "chat_room_members_all_admin" ON public.chat_room_members
FOR ALL USING (is_admin());

-- MESSAGES: 
CREATE POLICY "chat_messages_read" ON public.chat_messages
FOR SELECT USING (
    is_admin() 
    OR user_id = auth.uid()
    OR room_id IN (SELECT id FROM public.chat_rooms WHERE NOT is_private)
    OR room_id IN (SELECT room_id FROM public.chat_room_members WHERE user_id = auth.uid())
);

CREATE POLICY "chat_messages_insert" ON public.chat_messages
FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND (
        is_admin()
        OR room_id IN (SELECT id FROM public.chat_rooms WHERE NOT is_private)
        OR room_id IN (SELECT room_id FROM public.chat_room_members WHERE user_id = auth.uid())
    )
);

CREATE POLICY "chat_messages_update_own" ON public.chat_messages
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "chat_messages_delete_own" ON public.chat_messages
FOR DELETE USING (auth.uid() = user_id OR is_admin());
