-- Seed script to populate the OMS database with initial data
-- This script adds essential materials, creates the first admin user, and sets up basic data

-- Insert material data from the JSON files
INSERT INTO public.materials (category, code, name_en, name_ru, name_lv, thickness_options, metadata)
VALUES 
-- PLEXIGLAS materials
('Plastics', 'PLEXIGLAS_XT_0F00', 'PLEXIGLAS® XT Clear', 'PLEXIGLAS® XT Прозрачный', 'PLEXIGLAS® XT Caurspīdīgs', '[1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25]', '{"brand": "PLEXIGLAS®", "series": "XT", "colorCode": "0F00", "colorName": "Clear", "type": "extruded", "transmittance": "92%", "properties": {"transparent": true, "uvAbsorbent": true, "weatherResistant": true, "tempResistance": "70°C"}, "standardSize": "3050x2050mm", "hex": "#FFFFFF", "applications": ["Glazing", "LED applications", "Shopfitting"]}'),
('Plastics', 'PLEXIGLAS_XT_WN071', 'PLEXIGLAS® XT White Opal', 'PLEXIGLAS® XT Белый Опал', 'PLEXIGLAS® XT Baltais Opāls', '[2, 3, 4, 5, 6, 8, 10]', '{"brand": "PLEXIGLAS®", "series": "XT", "colorCode": "WN071", "colorName": "White Opal", "type": "extruded", "transmittance": "30%", "properties": {"translucent": true, "uvAbsorbent": true, "weatherResistant": true, "highGloss": true, "tempResistance": "70°C"}, "standardSize": "3050x2050mm", "hex": "#F5F5F0", "applications": ["Illuminated advertising", "Light diffusion", "Signage"]}'),
('Plastics', 'PLEXIGLAS_GS_WH10', 'PLEXIGLAS® GS White Opaque', 'PLEXIGLAS® GS Белый Непрозрачный', 'PLEXIGLAS® GS Baltais Nepārredzams', '[3, 4, 5, 6, 8, 10, 12, 15, 20]', '{"brand": "PLEXIGLAS®", "series": "GS", "colorCode": "WH10", "colorName": "White Opaque", "type": "cast", "transmittance": "0%", "properties": {"opaque": true, "uvAbsorbent": true, "weatherResistant": true}, "standardSize": "3050x2030mm", "hex": "#FFFFFF", "applications": ["Signage", "Furniture", "Displays"]}'),
('Plastics', 'PLEXIGLAS_XT_1N870', 'PLEXIGLAS® XT Yellow', 'PLEXIGLAS® XT Желтый', 'PLEXIGLAS® XT Dzeltens', '[2, 3, 4, 5, 6, 8, 10]', '{"brand": "PLEXIGLAS®", "series": "XT", "colorCode": "1N870", "colorName": "Yellow", "type": "extruded", "transmittance": "20%", "properties": {"translucent": true, "uvAbsorbent": true, "colorFast": true}, "standardSize": "3050x2050mm", "hex": "#FFD700", "applications": ["Colored signage", "Displays"]}'),
('Plastics', 'PLEXIGLAS_XT_3N570', 'PLEXIGLAS® XT Red', 'PLEXIGLAS® XT Красный', 'PLEXIGLAS® XT Sarkans', '[2, 3, 4, 5, 6, 8, 10]', '{"brand": "PLEXIGLAS®", "series": "XT", "colorCode": "3N570", "colorName": "Red", "type": "extruded", "transmittance": "15%", "properties": {"translucent": true, "uvAbsorbent": true, "colorFast": true}, "standardSize": "3050x2050mm", "hex": "#DC143C", "applications": ["Colored signage", "Displays"]}'),

-- PVC Foam materials
('Plastics', 'PVC_FOAM_WHITE', 'PVC Foam Board White', 'ПВХ Пенопласт Белая', 'PVC Putu Plāksne Balta', '[3, 5, 8, 10, 12, 15, 18, 19]', '{"brand": "Palight®", "name": "PVC Foam Board White", "type": "foam", "density": "0.45-0.57 g/cm³", "finish": "matte", "properties": {"lightweight": true, "weatherResistant": true, "easyToMachine": true, "paintable": true, "waterproof": true}, "standardSize": "1220x2440mm", "hex": "#FFFFFF", "fireRating": "UK Class 1", "serviceTemp": "-10 to 55°C", "applications": ["Signage", "Displays", "Exhibition stands"]}'),
('Plastics', 'PVC_FOAM_BLACK', 'PVC Foam Board Black', 'ПВХ Пенопласт Черная', 'PVC Putu Plāksne Melna', '[3, 5, 8, 10, 15, 18]', '{"brand": "Palight®", "name": "PVC Foam Board Black", "type": "foam", "density": "0.50 g/cm³", "finish": "matte", "properties": {"lightweight": true, "weatherResistant": true, "easyToMachine": true, "waterproof": true}, "standardSize": "1220x2440mm", "hex": "#000000", "applications": ["Signage", "Displays"]}'),
('Plastics', 'PVC_FOAM_RED', 'PVC Foam Board Red', 'ПВХ Пенопласт Красная', 'PVC Putu Plāksne Sarkana', '[5, 8, 10, 15, 18]', '{"brand": "Palight®", "name": "PVC Foam Board Red", "type": "foam", "density": "0.50 g/cm³", "finish": "gloss", "properties": {"lightweight": true, "weatherResistant": true, "colorFast": true, "waterproof": true}, "standardSize": "1220x2440mm", "hex": "#DC143C", "applications": ["Signage", "Displays", "Point of sale"]}'),

-- Aluminum materials
('Metals', 'ALU_MILL_1_5', 'Aluminum Sheet 1.5mm Mill Finish', 'Алюминиевый лист 1.5мм Милл Финиш', 'Alumīnija Loksne 1.5mm Milēts Beigtas', '[1.5]', '{"alloy": "AlMg3", "finish": "mill", "type": "sheet", "thickness": 1.5, "properties": {"corrosionResistant": true, "lightweight": true, "bendable": true, "weldable": true}, "standardSize": "2000x1000mm", "hex": "#C0C0C0", "applications": ["Signage construction", "Heavy-duty frames"]}'),
('Metals', 'ALU_BRUSHED_1_5', 'Aluminum Sheet 1.5mm Brushed Horizontal', 'Алюминиевый лист 1.5мм Щетковая горизонтальная', 'Alumīnija Loksne 1.5mm Horizontāli Matēts', '[1.5]', '{"alloy": "AlMg3", "finish": "brushed_horizontal", "type": "sheet", "thickness": 1.5, "properties": {"corrosionResistant": true, "decorative": true, "scratchResistant": true, "bendable": true}, "standardSize": "2000x1000mm", "hex": "#B8B8B8", "applications": ["Decorative signage", "Premium finishes"]}'),
('Metals', 'DIBOND_WHITE_3', 'Dibond White 3mm', 'Дибонд Белый 3мм', 'Dibond Balts 3mm', '[3]', '{"brand": "Dibond®", "type": "composite", "thickness": 3, "construction": "ALU-PE-ALU", "finish": "white_coated", "properties": {"lightweight": true, "flat": true, "weatherResistant": true, "printable": true, "rigid": true}, "standardSize": "2440x1220mm", "hex": "#FFFFFF", "applications": ["Signage", "Displays", "Exhibition"]}'),

-- RAL Classic Colors
('Colors', 'RAL_1003', 'Signal Yellow', 'Сигнальный Желтый', 'Signāla Dzeltens', '[]', '{"name": {"en": "Signal yellow", "de": "Signalgelb", "fr": "Jaune de sécurité"}, "hex": "#F9A900", "rgb": [249,169,0], "cmyk": [0,32,100,2], "lrv": 49.05}'),
('Colors', 'RAL_3000', 'Flame Red', 'Огненно-красный', 'Liesas Sarkans', '[]', '{"name": {"en": "Flame red", "de": "Feuerrot", "fr": "Rouge feu"}, "hex": "#AB2524", "rgb": [171,37,36], "cmyk": [0,78,79,33], "lrv": 11.57}'),
('Colors', 'RAL_5015', 'Sky Blue', 'Небесно-голубой', 'Debes Zils', '[]', '{"name": {"en": "Sky blue", "de": "Himmelblau", "fr": "Bleu ciel"}, "hex": "#2874B2", "rgb": [40,116,178], "cmyk": [78,35,0,30], "lrv": 23.53}'),
('Colors', 'RAL_6005', 'Moss Green', 'Мохово-зеленый', 'Sūnāzaļš', '[]', '{"name": {"en": "Moss green", "de": "Moosgrün", "fr": "Vert mousse"}, "hex": "#024442", "rgb": [2,68,66], "cmyk": [97,0,3,73], "lrv": 8.04}'),
('Colors', 'RAL_7016', 'Anthracite Grey', 'Антрацитовый серый', 'Antracīta Pelēks', '[]', '{"name": {"en": "Anthracite grey", "de": "Anthrazitgrau", "fr": "Gris anthracite"}, "hex": "#373F43", "rgb": [55,63,67], "cmyk": [18,6,0,74], "lrv": 8.41}'),

-- Oracal 8500 Films
('Films', 'ORACAL_010', 'White', 'Белый', 'Balts', '[]', '{"name": "White", "hex": "#FFFFFF"}'),
('Films', 'ORACAL_031', 'Red', 'Красный', 'Sarkans', '[]', '{"name": "Red", "hex": "#FF0000"}'),
('Films', 'ORACAL_051', 'Gentian Blue', 'Гентианский Синий', 'Ģenijāna Zils', '[]', '{"name": "Gentian blue", "hex": "#0047AB"}'),
('Films', 'ORACAL_068', 'Grass Green', 'Травяной Зеленый', 'Zālājs Zaļš', '[]', '{"name": "Grass green", "hex": "#7CFC00"}'),
('Films', 'ORACAL_300', 'Silver Mirror', 'Серебряное Зеркало', 'Sudraba Spogulis', '[]', '{"name": "Silver mirror", "hex": "#C0C0C0"}');

-- Create the first admin user (using the auth schema for proper Supabase integration)
-- This requires the auth extension to be enabled in your Supabase project
-- NOTE: Default password is intentionally weak for development only - CHANGE IN PRODUCTION
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
    '00000000-0000-0000-0000-000000000001',  -- Fixed UUID for admin user
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin@reclamefabriek.com',
    crypt('ChangeMe123!', gen_salt('bf')),  -- Default development password - CHANGE IN PRODUCTION
    NOW(),
    NULL,
    '',
    NULL,
    '',
    NULL,
    '',
    '',
    NULL,
    NULL,
    NOW(),
    NOW(),
    NULL,
    NULL,
    '',
    '',
    NULL,
    NOW(),
    NULL,
    NULL,
    NULL,
    '{"username": "admin", "display_name": "Administrator", "roles": {"Admin": "SuperAdmin", "Production": "Operator", "Logistics": "Viewer", "CAD": "Operator", "CNC": "Operator", "SANDING": "Operator", "BENDING": "Operator", "WELDING": "Operator", "PAINT": "Operator", "ASSEMBLY": "Operator", "QC": "Operator", "R&D": "Operator"}, "is_active": true}'
);

-- Create the corresponding profile for the admin user
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
    '00000000-0000-0000-0000-000000000001',  -- Same UUID as the auth user
    'admin',
    'Administrator',
    'Admin',
    ARRAY['Admin', 'Production', 'Logistics', 'CAD', 'CNC', 'SANDING', 'BENDING', 'WELDING', 'PAINT', 'ASSEMBLY', 'QC', 'R&D']::TEXT[],
    '{"Admin": "SuperAdmin", "Production": "Operator", "Logistics": "Viewer", "CAD": "Operator", "CNC": "Operator", "SANDING": "Operator", "BENDING": "Operator", "WELDING": "Operator", "PAINT": "Operator", "ASSEMBLY": "Operator", "QC": "Operator", "R&D": "Operator"}',
    ARRAY[]::TEXT[],
    true,
    NOW(),
    NOW()
);

-- Create default user preferences for the admin
INSERT INTO public.user_preferences (
    user_id,
    theme,
    locale,
    scale,
    density,
    pdf_zoom,
    sidebar_collapsed,
    notifications_enabled
)
VALUES (
    '00000000-0000-0000-0000-000000000001',  -- Admin user ID
    'DarkVim',
    'en',
    'normal',
    'cozy',
    1.00,
    false,
    true
);

-- Add some sample draft orders
INSERT INTO public.draft_orders (
    id,
    po_number,
    client,
    title,
    due_date,
    loading_date,
    status,
    notes,
    created_by,
    created_at
)
VALUES 
(
    gen_random_uuid(),
    'PO-2023-001',
    'Sample Client Ltd.',
    'Sample Order #1',
    CURRENT_DATE + INTERVAL '30 days',
    CURRENT_DATE + INTERVAL '35 days',
    'draft',
    'This is a sample order for testing purposes',
    '00000000-0000-0000-0000-000000000001',
    NOW()
),
(
    gen_random_uuid(),
    'PO-2023-002',
    'Another Client Co.',
    'Sample Order #2',
    CURRENT_DATE + INTERVAL '45 days',
    CURRENT_DATE + INTERVAL '50 days',
    'draft',
    'Second sample order for testing',
    '00000000-0000-0000-0000-000000000001',
    NOW()
);

-- Add some sample profile templates
INSERT INTO public.profile_templates (
    id,
    code,
    name,
    version,
    is_active,
    created_at
)
VALUES 
(
    gen_random_uuid(),
    'SIGNAGE_BASIC',
    'Basic Signage Profile',
    1,
    true,
    NOW()
),
(
    gen_random_uuid(),
    'SIGNAGE_ADVANCED',
    'Advanced Signage Profile',
    1,
    true,
    NOW()
);

-- Add some sample loading days to the calendar
INSERT INTO public.draft_orders (
    id,
    po_number,
    client,
    title,
    due_date,
    loading_date,
    status,
    notes,
    created_by,
    created_at
)
VALUES 
(
    gen_random_uuid(),
    'LOADING_DAY',
    'System',
    'Loading Day',
    CURRENT_DATE + INTERVAL '7 days',
    CURRENT_DATE + INTERVAL '7 days',
    'loading_day',
    'Scheduled loading day',
    '00000000-0000-0000-0000-000000000001',
    NOW()
),
(
    gen_random_uuid(),
    'LOADING_DAY_2',
    'System',
    'Loading Day',
    CURRENT_DATE + INTERVAL '14 days',
    CURRENT_DATE + INTERVAL '14 days',
    'loading_day',
    'Scheduled loading day',
    '00000000-0000-0000-0000-000000000001',
    NOW()
);

-- Insert some sample audit log entries
INSERT INTO public.audit_log (
    user_id,
    username,
    action,
    entity_type,
    entity_id,
    created_at
)
VALUES 
(
    '00000000-0000-0000-0000-000000000001',
    'Slaff',
    'SYSTEM_INITIALIZED',
    'system',
    'initial_setup',
    NOW()
),
(
    '00000000-0000-0000-0000-000000000001',
    'Slaff',
    'USER_CREATED',
    'user',
    '00000000-0000-0000-0000-000000000001',
    NOW()
);

RAISE NOTICE 'Database seeding completed successfully!';