
-- Seed CNC Feeds & Speeds
INSERT INTO public.cnc_feeds_speeds (material, operation, tool_diameter_mm, spindle_rpm, feed_mm_min, plunge_mm_min, stepdown_mm, stepover_pct, notes, verified, confidence)
VALUES 
('Acrylic', 'profile', 3.175, 18000, 2400, 600, 3.0, 40, 'Single flute upcut. Keep bit cool to prevent melting.', true, 0.9),
('Acrylic', 'pocket', 6.0, 16000, 1800, 400, 2.0, 60, 'Use air blast if possible.', true, 0.8),
('Aluminium Composite (Dibond)', 'profile', 4.0, 15000, 3000, 800, 4.0, 30, 'Double flute upcut. Very clean cuts at these speeds.', true, 0.95),
('Plywood (Birch)', 'profile', 6.0, 18000, 3500, 1200, 6.0, 40, 'Compression bit for best top/bottom finish.', true, 0.9),
('MDF', 'profile', 6.35, 18000, 4000, 1500, 8.0, 40, 'Standard 2-flute upcut. High dust creation.', true, 0.85);

-- Seed Paint Matches
INSERT INTO public.paint_matches (target_label, target_hex, substrate, finish, recipe, dry_time_min, bake_schedule, verified, notes)
VALUES 
('Réclame Corporate Red', 'E30613', 'Aluminium', 'satin', '[{"base": "Signal Red", "ratio_pct": 95}, {"base": "Jet Black", "ratio_pct": 5}]'::jsonb, 45, '20min @ 60°C', true, 'Match for client logo.'),
('Matte Anthracite', '353839', 'Steel', 'matte', '[{"base": "Grey 7016", "ratio_pct": 100}]'::jsonb, 30, '30min @ 180°C', true, 'Powder coat recipe equivalent.'),
('Safety Yellow', 'F4D03F', 'PVC', 'gloss', '[{"base": "Yellow 1023", "ratio_pct": 100}]'::jsonb, 60, 'Air dry', true, 'Standard hazard marking.');
