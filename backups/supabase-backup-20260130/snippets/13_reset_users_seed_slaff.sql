-- Wipe all users and profiles
TRUNCATE TABLE public.profiles CASCADE;
DELETE FROM auth.users;

-- Create SuperAdmin
-- ID: Fixed UUID for stability
DO $$
DECLARE
    new_user_id UUID := '00000000-0000-0000-0000-000000000001';
    user_email TEXT := 'slaff.trosheen@gmail.com';
    user_password TEXT := 'Slaff181188';
BEGIN
    -- Insert into auth.users
    INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    ) VALUES (
        new_user_id,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        user_email,
        crypt(user_password, gen_salt('bf')),
        NOW(),
        '{"provider":"email","providers":["email"]}',
        '{"username": "slaff", "full_name": "Slaff Trosheen"}',
        NOW(),
        NOW()
    );

    -- Insert into public.profiles
    -- Trigger might have handled this, but we force specific roles here
    INSERT INTO public.profiles (
        id,
        username,
        display_name,
        primary_section,
        sections,
        roles,
        stations,
        is_active
    ) VALUES (
        new_user_id,
        'slaff',
        'Slaff Trosheen',
        'Admin',
        ARRAY['Admin', 'Production', 'Logistics'],
        '{"Admin": "SuperAdmin", "Production": "Manager", "Logistics": "Manager"}'::jsonb,
        ARRAY['All'],
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        roles = EXCLUDED.roles,
        sections = EXCLUDED.sections;

    -- Set preferences
    INSERT INTO public.user_preferences (user_id, theme, locale)
    VALUES (new_user_id, 'DarkVim', 'en')
    ON CONFLICT (user_id) DO NOTHING;

END $$;
