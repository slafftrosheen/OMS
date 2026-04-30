-- Migration: 20260430170000_rls_comprehensive_hardening.sql
-- Description: Comprehensive hardening of RLS and RPCs to prevent data leakage.

-- 1. Helper Functions
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND (role = 'admin' OR (roles->>'Admin')::text = 'SuperAdmin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_access_order(p_order_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        EXISTS (
            SELECT 1 FROM public.draft_orders
            WHERE id = p_order_id
            AND (created_by = auth.uid() OR public.is_admin())
        )
        OR EXISTS (
            SELECT 1 FROM public.order_assignees
            WHERE order_id = p_order_id
            AND assignee_id = auth.uid()
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Hardening draft_orders
ALTER TABLE public.draft_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Orders viewable by all authenticated" ON public.draft_orders;
CREATE POLICY "Orders viewable by all authenticated" ON public.draft_orders
    FOR SELECT USING (auth.uid() = created_by OR public.is_admin() OR EXISTS (
        SELECT 1 FROM public.order_assignees WHERE order_id = draft_orders.id AND assignee_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.draft_orders;
CREATE POLICY "Authenticated users can create orders" ON public.draft_orders
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.draft_orders;
CREATE POLICY "Authenticated users can update orders" ON public.draft_orders
    FOR UPDATE USING (auth.uid() = created_by OR public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can delete orders" ON public.draft_orders;
CREATE POLICY "Authenticated users can delete orders" ON public.draft_orders
    FOR DELETE USING (auth.uid() = created_by OR public.is_admin());

-- 3. Hardening Related Order Tables
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'order_profiles', 'order_files', 'order_materials', 'order_fields', 
        'order_stages', 'order_assignees', 'order_activity_log', 'order_revisions', 
        'rework_cycles', 'change_requests', 'order_qr_codes'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS "auth_access_policy" ON public.%I;', t);
        EXECUTE format('CREATE POLICY "auth_access_policy" ON public.%I FOR ALL USING (public.can_access_order(order_id));', t);
    END LOOP;
END $$;

-- 4. Hardening chat_messages
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Chat messages access" ON public.chat_messages;
CREATE POLICY "Chat messages access" ON public.chat_messages
    FOR SELECT USING (
        (order_id IS NOT NULL AND public.can_access_order(order_id))
        OR (room_id IN ('general', 'workstations', 'logistics'))
        OR (user_id = auth.uid())
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "Chat messages insert" ON public.chat_messages;
CREATE POLICY "Chat messages insert" ON public.chat_messages
    FOR INSERT WITH CHECK (
        (order_id IS NOT NULL AND public.can_access_order(order_id))
        OR (room_id IN ('general', 'workstations', 'logistics'))
        OR (auth.role() = 'authenticated') -- Fallback for generic messages
    );

-- 5. Hardening maker_sketches
DROP POLICY IF EXISTS "Users can view all sketches" ON public.maker_sketches;
CREATE POLICY "Users can view own sketches" ON public.maker_sketches
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- 6. Hardening profiles (hiding sensitive fields from non-admins)
-- We can't easily hide columns with RLS policies on the same table without breaking things, 
-- but we can restrict UPDATE and ensure SELECT is at least authenticated.
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view all profiles" ON public.profiles
    FOR SELECT USING (auth.role() = 'authenticated');

-- 7. Hardening search_history & saved_filters (if missing)
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own search history" ON public.search_history;
CREATE POLICY "Users own search history" ON public.search_history
    FOR ALL USING (auth.uid() = user_id);

-- 8. Hardening RPCs (Ownership checks)
CREATE OR REPLACE FUNCTION public.replace_order_profiles(
    p_order_id UUID,
    p_profiles JSONB
)
RETURNS SETOF public.order_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_profile JSONB;
    v_idx     INTEGER := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- CHECK OWNERSHIP
    IF NOT public.can_access_order(p_order_id) THEN
        RAISE EXCEPTION 'Unauthorized to modify this order';
    END IF;

    DELETE FROM public.order_profiles WHERE order_id = p_order_id;

    FOR v_profile IN SELECT jsonb_array_elements(p_profiles) LOOP
        INSERT INTO public.order_profiles (
            order_id, profile_template_id, quantity1, quantity2, quantity3, quantity4,
            configuration, notes, order_index
        ) VALUES (
            p_order_id,
            (v_profile->>'profile_template_id')::uuid,
            (v_profile->>'quantity1')::int,
            (v_profile->>'quantity2')::int,
            (v_profile->>'quantity3')::int,
            (v_profile->>'quantity4')::int,
            COALESCE(v_profile->'configuration', '{}'::jsonb),
            v_profile->>'notes',
            COALESCE((v_profile->>'order_index')::int, v_idx)
        );
        v_idx := v_idx + 1;
    END LOOP;

    RETURN QUERY SELECT * FROM public.order_profiles WHERE order_id = p_order_id ORDER BY order_index;
END;
$$;
