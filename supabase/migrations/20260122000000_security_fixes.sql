-- Fix security issues reported by Supabase

-- 1. Fix mutable search_path for SECURITY DEFINER functions
-- Explicitly setting search_path prevents malicious users from executing code with the function's privileges
-- by creating objects in a schema that is in the search path (like 'public') and tricking the function.

ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- Drop the old version of record_inventory_movement (without material_id) to avoid confusion and security risks
DROP FUNCTION IF EXISTS public.record_inventory_movement(text, text, numeric, text, text, text, text);

-- Fix search_path for the current version of record_inventory_movement (with material_id)
ALTER FUNCTION public.record_inventory_movement(text, text, numeric, text, text, text, text, uuid) SET search_path = public;


-- 2. Fix unrestricted INSERT policy on notifications
-- The previous policy "Users can insert notifications" allowed anyone to insert any notification.
-- We restrict this to:
-- a) Users creating notifications for themselves (e.g., self-reminders)
-- b) Admins/SuperAdmins creating notifications for others

DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications;

CREATE POLICY "Users can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (
  -- Allow users to insert their own notifications
  auth.uid() = user_id 
  OR
  -- Allow Admins/SuperAdmins to insert notifications for others
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (
      roles->>'Admin' = 'Admin' 
      OR roles->>'Admin' = 'SuperAdmin'
    )
  )
);