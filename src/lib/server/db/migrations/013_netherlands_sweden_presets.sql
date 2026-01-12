-- src/lib/server/db/migrations/013_netherlands_sweden_presets.sql
-- Add delivery presets for Netherlands and Sweden clients

-- Netherlands clients
INSERT INTO delivery_presets (client_name, preset_name, address_line1, address_line2, city, postal_code, country, contact_person, contact_phone, is_default) VALUES
('Reklatekst BV', 'Main Office', 'Weijinksweg 31', NULL, 'Hengelo', '7558 PL', 'The Netherlands', NULL, '074-27 66 166 / 06 34 385 453', true),
('SIGN & LIGHT BV (Hendrix)', 'Weert Office', 'Fahrenheitstraat 7', NULL, 'Weert', '6003 DC', 'The Netherlands', 'Jack', '+31(0)495-526 686 / +31(0)611332229', true),
('SIGN & LIGHT / Hendrix Belettering', 'Weert Office', 'Fahrenheitstraat 7', NULL, 'Weert', '6003 DC', 'The Netherlands', 'Jack', '+31(0)495-526 686 / +31(0)611332229', true)
ON CONFLICT DO NOTHING;

-- Sweden clients
INSERT INTO delivery_presets (client_name, preset_name, address_line1, address_line2, city, postal_code, country, contact_person, contact_phone, is_default) VALUES
('ColourCenter i Helsingborg AB', 'Helsingborg Office', 'Lilla Garnisonsgatan 28', NULL, 'Helsingborg', '254 67', 'Sweden', NULL, '+4642-185445', true),
('Nordic Fast Food AB', 'Åsbro Office', 'Metallvägen 6', 'Att: Tony Karlsson', 'Åsbro', '694 60', 'Sweden', 'Tony Karlsson', '070-330 63 09', true)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE delivery_presets IS 'Pre-configured delivery addresses for major customers including Netherlands and Sweden';
