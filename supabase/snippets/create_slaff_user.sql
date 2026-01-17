DO $$
DECLARE
    slaff_id UUID := gen_random_uuid();
BEGIN
    -- Insert auth user
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
    VALUES
        (slaff_id, 'slaff@example.com', crypt('Slaff181188', gen_salt('bf')), NOW(), NOW(), NOW(), jsonb_build_object('username', 'slaff', 'display_name', 'Slaff'));

    -- Insert profile with super admin role
    INSERT INTO public.profiles (id, username, display_name, primary_section, sections, roles, stations, is_active)
    VALUES
        (slaff_id, 'slaff', 'Slaff', 'Admin', ARRAY['Admin', 'All'], '{"SuperAdmin": true}'::jsonb, ARRAY['All'], true);
        
    RAISE NOTICE 'User slaff created with ID: %', slaff_id;
END $$;