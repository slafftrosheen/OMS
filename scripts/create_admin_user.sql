-- Script to create the first admin user
-- This script creates a user in Supabase auth and a corresponding profile with SuperAdmin rights

-- Note: This script should be run in the Supabase SQL editor or via supabase db remote exec
-- using the service role key which has elevated privileges

-- First, let's create a function to insert an admin user using Supabase auth functions
-- This approach uses the auth functions that are designed to work with the auth system

DO $$
DECLARE
  user_id UUID;
  admin_roles JSONB := '{"Admin": "SuperAdmin", "Production": "Operator", "Logistics": "Viewer", "CAD": "Operator", "CNC": "Operator", "SANDING": "Operator", "BENDING": "Operator", "WELDING": "Operator", "PAINT": "Operator", "ASSEMBLY": "Operator", "QC": "Operator", "R&D": "Operator"}';
BEGIN
  -- Create the auth user using the auth schema functions
  -- We'll use a known method that works with Supabase Auth
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    invited_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    email_change_token_new,
    email_change,
    email_change_sent_at,
    last_sign_in_at,
    created_at,
    updated_at,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    confirmed_at,
    email_autoflowed_at,
    banned_until,
    get_authenticator_verified_at,
    raw_user_meta_data
  )
  VALUES (
    gen_random_uuid(),                    -- id
    '00000000-0000-0000-0000-000000000000', -- instance_id (typically 0 for single instance)
    'authenticated',                      -- aud
    'authenticated',                      -- role
    'slaff@reclamefabriek.com',          -- email
    crypt('Slaff181188', gen_salt('bf')), -- encrypted_password
    NOW(),                               -- email_confirmed_at
    NULL,                                -- invited_at
    '',                                  -- confirmation_token
    NULL,                                -- confirmation_sent_at
    '',                                  -- recovery_token
    NULL,                                -- recovery_sent_at
    '',                                  -- email_change_token_new
    '',                                  -- email_change
    NULL,                                -- email_change_sent_at
    NULL,                                -- last_sign_in_at
    NOW(),                               -- created_at
    NOW(),                               -- updated_at
    NULL,                                -- phone
    NULL,                                -- phone_confirmed_at
    '',                                  -- phone_change
    '',                                  -- phone_change_token
    NULL,                                -- phone_change_sent_at
    NOW(),                               -- confirmed_at
    NULL,                                -- email_autoflowed_at
    NULL,                                -- banned_until
    NULL,                                -- get_authenticator_verified_at
    jsonb_build_object(
      'username', 'Slaff',
      'display_name', 'Slaff',
      'roles', admin_roles,
      'is_active', true
    )                                    -- raw_user_meta_data
  )
  RETURNING id INTO user_id;

  -- Create the corresponding profile in the public schema
  INSERT INTO public.profiles (
    id,
    username,
    display_name,
    primary_section,
    sections,
    roles,
    stations,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    user_id,
    'Slaff',
    'Slaff',
    'Production',
    ARRAY['Production']::TEXT[],
    admin_roles,
    ARRAY[]::TEXT[],
    true,
    NOW(),
    NOW()
  );

  -- Create default user preferences
  INSERT INTO public.user_preferences (
    user_id,
    theme,
    locale
  )
  VALUES (
    user_id,
    'DarkVim',
    'en'
  );

  RAISE NOTICE 'Admin user Slaff created with ID: %', user_id;
END $$;

-- Alternative approach using Supabase CLI or Admin API:
/*
If the above doesn't work due to RLS restrictions, you can create the user using Supabase CLI:

supabase db remote exec "
DO \$\$
DECLARE
  user_id UUID;
BEGIN
  -- Create user via auth.admin API equivalent
  INSERT INTO auth.users (...)
  -- Then create profile
  INSERT INTO public.profiles (...)
END \$\$;
"
*/

-- Another alternative: Use the Supabase Dashboard
/*
1. Go to your Supabase dashboard
2. Navigate to Authentication -> Users
3. Click "Invite User" or "Create User"
4. Create a user with email: slaff@reclamefabriek.com
5. Set password: Slaff181188
6. After the user is created, run this update to give admin rights:

UPDATE public.profiles
SET
  username = 'Slaff',
  display_name = 'Slaff',
  roles = '{"Admin": "SuperAdmin", "Production": "Operator", "Logistics": "Viewer", "CAD": "Operator", "CNC": "Operator", "SANDING": "Operator", "BENDING": "Operator", "WELDING": "Operator", "PAINT": "Operator", "ASSEMBLY": "Operator", "QC": "Operator", "R&D": "Operator"}'
WHERE id = (SELECT id FROM auth.users WHERE email = 'slaff@reclamefabriek.com');
*/