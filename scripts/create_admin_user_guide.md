# Creating the First Admin User for OMS

This guide explains how to create the first admin user for the OMS system with the credentials:
- Username: Slaff
- Password: Slaff181188
- Role: SuperAdmin (highest rights)

## Method 1: Using Supabase Dashboard (Recommended for beginners)

### Step 1: Create the User in Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to "Authentication" → "Users"
3. Click "New User" 
4. Fill in the details:
   - Email: `slaff@reclamefabriek.com`
   - Password: `Slaff181188`
   - Confirm password: `Slaff181188`
   - Leave "Generate password" unchecked
   - Check "Email confirmed" to skip email verification
5. Click "Create user"

### Step 2: Update the User's Profile with Admin Rights
1. Go to "Database" → "SQL Editor"
2. Run the following SQL query to update the user's profile with SuperAdmin rights:

```sql
UPDATE public.profiles 
SET 
  username = 'Slaff',
  display_name = 'Slaff',
  roles = '{"Admin": "SuperAdmin", "Production": "Operator", "Logistics": "Viewer", "CAD": "Operator", "CNC": "Operator", "SANDING": "Operator", "BENDING": "Operator", "WELDING": "Operator", "PAINT": "Operator", "ASSEMBLY": "Operator", "QC": "Operator", "R&D": "Operator"}'
WHERE id = (SELECT id FROM auth.users WHERE email = 'slaff@reclamefabriek.com');
```

## Method 2: Using SQL Script (For advanced users)

If you have direct database access with service role privileges, you can run the SQL script:

1. Go to your Supabase project dashboard
2. Navigate to "Database" → "SQL Editor"
3. Copy and paste the following script:

```sql
DO $$
DECLARE
  user_id UUID;
  admin_roles JSONB := '{"Admin": "SuperAdmin", "Production": "Operator", "Logistics": "Viewer", "CAD": "Operator", "CNC": "Operator", "SANDING": "Operator", "BENDING": "Operator", "WELDING": "Operator", "PAINT": "Operator", "ASSEMBLY": "Operator", "QC": "Operator", "R&D": "Operator"}';
BEGIN
  -- Create the auth user
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmed_at,
    created_at,
    updated_at,
    raw_user_meta_data
  )
  VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'slaff@reclamefabriek.com',
    crypt('Slaff181188', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    NOW(),
    jsonb_build_object(
      'username', 'Slaff',
      'display_name', 'Slaff',
      'roles', admin_roles,
      'is_active', true
    )
  )
  RETURNING id INTO user_id;

  -- Create the corresponding profile
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
```

4. Click "Run" to execute the script

## Method 3: Using Supabase CLI (For local development)

If you're working with a local Supabase setup, you can run the script using the CLI:

```bash
supabase db remote exec "path/to/create_admin_user.sql"
```

## Verification

After creating the admin user:

1. Try logging into the OMS application with:
   - Username: Slaff
   - Password: Slaff181188

2. Verify that the user has admin capabilities by checking if they can:
   - Access admin panels
   - Manage other users
   - Access all sections and features
   - Have SuperAdmin rights in the user management system

## Important Notes

- The SuperAdmin role grants the highest level of access to the system
- This user will be able to create other users and manage all aspects of the OMS
- Remember to change the default password after the first login for security purposes
- The roles JSON structure follows the format: `{"SectionName": "RoleLevel"}`
- The SuperAdmin role gives full access across all sections of the application

## Troubleshooting

If you encounter issues:

1. **User cannot log in**: Verify the email confirmation status in the Supabase dashboard
2. **No admin privileges**: Check that the roles JSON was properly set in the profiles table
3. **Database errors**: Ensure you're using the service role key when executing the script
4. **Access denied**: Make sure the user is active (is_active = true) in the profiles table