-- Force Reset Users (Nuclear Option)

-- Disable triggers temporarily
ALTER TABLE auth.users DISABLE TRIGGER ALL;

-- Clear data
TRUNCATE TABLE public.profiles CASCADE;
DELETE FROM auth.users;

-- Re-enable triggers
ALTER TABLE auth.users ENABLE TRIGGER ALL;

-- Insert Auth User
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
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'slaff.trosheen@gmail.com',
    crypt('Slaff181188', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"username": "slaff", "full_name": "Slaff Trosheen"}',
    NOW(),
    NOW()
);

-- Insert Profile
INSERT INTO public.profiles (
    id,
    username,
    display_name,
    email,
    primary_section,
    sections,
    roles,
    stations,
    is_active
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'slaff',
    'Slaff Trosheen',
    'slaff.trosheen@gmail.com',
    'Admin',
    ARRAY['Admin', 'Production', 'Logistics'],
    '{"Admin": "SuperAdmin", "Production": "Manager", "Logistics": "Manager"}'::jsonb,
    ARRAY['All'],
    true
);
