-- supabase/seed.sql

-- This is a seed script for the OMS database.
-- Creates auth users and corresponding profile records.

-- Seed Users (first create auth users, then profiles will be created automatically)

DO $$
DECLARE
    superadmin_id UUID := '11111111-1111-1111-1111-111111111111';
    stationlead_id UUID := '22222222-2222-2222-2222-222222222222';
    operator_id UUID := '33333333-3333-3333-3333-333333333333';
    viewer_id UUID := '44444444-4444-4444-4444-444444444444';
    deactivated_id UUID := '55555555-5555-5555-5555-555555555555';

BEGIN
    -- Insert auth users first (these would normally be created by the auth system)
    -- Using a direct insert into auth.users bypassing the normal auth flow for seeding
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
    VALUES
        (superadmin_id, 'superadmin@example.com', crypt('password123', gen_salt('bf')), NOW(), NOW(), NOW(), jsonb_build_object('username', 'superadmin', 'display_name', 'Super Admin')),
        (stationlead_id, 'stationlead@example.com', crypt('password123', gen_salt('bf')), NOW(), NOW(), NOW(), jsonb_build_object('username', 'stationlead', 'display_name', 'Station Lead')),
        (operator_id, 'operator@example.com', crypt('password123', gen_salt('bf')), NOW(), NOW(), NOW(), jsonb_build_object('username', 'operator', 'display_name', 'Operator')),
        (viewer_id, 'viewer@example.com', crypt('password123', gen_salt('bf')), NOW(), NOW(), NOW(), jsonb_build_object('username', 'viewer', 'display_name', 'Viewer')),
        (deactivated_id, 'deactivated@example.com', crypt('password123', gen_salt('bf')), NOW(), NOW(), NOW(), jsonb_build_object('username', 'deactivated', 'display_name', 'Deactivated User'));

    -- Now update the profiles table with the specific data we want
    -- Since the handle_new_user trigger should have created the profiles, we'll update them
    INSERT INTO public.profiles (id, username, display_name, primary_section, sections, roles, stations, is_active)
    VALUES
        (superadmin_id, 'superadmin', 'Super Admin', 'Admin', ARRAY['Admin', 'All'], '{"SuperAdmin": true}'::jsonb, ARRAY['All'], true),
        (stationlead_id, 'stationlead', 'Station Lead', 'Section A', ARRAY['Section A', 'Section B'], '{"StationLead": true}'::jsonb, ARRAY['Station 1', 'Station 2'], true),
        (operator_id, 'operator', 'Operator', 'Section A', ARRAY['Section A'], '{"Operator": true}'::jsonb, ARRAY['Station 1'], true),
        (viewer_id, 'viewer', 'Viewer', 'Section B', ARRAY['Section B'], '{"Viewer": true}'::jsonb, ARRAY['Station 2'], true),
        (deactivated_id, 'deactivated', 'Deactivated User', 'N/A', ARRAY['N/A'], '{}'::jsonb, ARRAY['N/A'], false)
    ON CONFLICT (id)
    DO UPDATE SET
        username = EXCLUDED.username,
        display_name = EXCLUDED.display_name,
        primary_section = EXCLUDED.primary_section,
        sections = EXCLUDED.sections,
        roles = EXCLUDED.roles,
        stations = EXCLUDED.stations,
        is_active = EXCLUDED.is_active;

END $$;

-- Note: In a real Supabase application, users would register through the auth system
-- and the profiles would be created automatically via the handle_new_user() trigger.
