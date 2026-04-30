-- =============================================================================
-- Promote slaff.trosheen@gmail.com to SuperAdmin
-- =============================================================================

DO $$
DECLARE
    target_user_id UUID;
BEGIN
    -- Find the user ID for the specified email
    SELECT id INTO target_user_id FROM auth.users WHERE email = 'slaff.trosheen@gmail.com';

    IF target_user_id IS NOT NULL THEN
        -- Update the profile to have full SuperAdmin roles in all sections
        UPDATE public.profiles
        SET 
            roles = '{"Admin": "SuperAdmin", "Production": "SuperAdmin", "Logistics": "SuperAdmin"}',
            primary_section = 'Admin',
            sections = '{"Admin", "Production", "Logistics"}',
            role = 'Admin',
            updated_at = now()
        WHERE id = target_user_id;

        RAISE NOTICE 'Promoted user slaff.trosheen@gmail.com (ID: %) to SuperAdmin.', target_user_id;
    ELSE
        RAISE NOTICE 'User slaff.trosheen@gmail.com not found. Skipping promotion.';
    END IF;
END $$;
