-- src/lib/server/db/seeds/014_suppliers_extended.sql
-- Extended suppliers list

-- Add more suppliers
INSERT INTO suppliers (name, code, website, country, contact_person, email, notes, is_active) VALUES
-- Latvia local suppliers
('Lemona', 'LEMONA', 'https://lemona.lv/', 'Latvia', NULL, NULL, 'LED strips, electronics, electrical components', true),
('Kraso', 'KRASO', 'https://kraso.lv/', 'Latvia', NULL, NULL, 'Paints, coatings, primers, automotive paint', true),
('Jūrmala Plastik', 'JURPLAS', 'https://jurmalaplastik.lv/', 'Latvia', NULL, NULL, 'Plastics, acrylic sheets', true),

-- International material suppliers
('Mean Well', 'MEANWELL', 'https://www.meanwell.com/', 'Taiwan', NULL, NULL, 'LED power supplies, PSU units', true),
('Sloan LED', 'SLOAN', 'https://www.sloanled.com/', 'USA', NULL, NULL, 'LED modules for signage', true),
('BaltLed', 'BALTLED', 'https://baltled.lv/', 'Latvia', NULL, NULL, 'LED modules, LED signs', true),

-- 3D printing suppliers
('Anycubic', 'ANYCUBIC', 'https://www.anycubic.com/', 'China', NULL, NULL, '3D printers, resin, filament', true),
('Creality', 'CREALITY', 'https://www.creality.com/', 'China', NULL, NULL, '3D printers, filament', true),
('Spectrum Filaments', 'SPECTRUM', 'https://spectrumfilaments.com/', 'Poland', NULL, NULL, 'Premium FDM filaments', true),
('Prusa Research', 'PRUSA', 'https://www.prusa3d.com/', 'Czech Republic', NULL, NULL, '3D printers, Prusament filaments', true),
('Elegoo', 'ELEGOO', 'https://www.elegoo.com/', 'China', NULL, NULL, '3D printers, resin', true),

-- Sign-specific suppliers
('3M', '3M', 'https://www.3m.com/', 'USA', NULL, NULL, 'Vinyl, reflective materials, adhesives', true),
('Avery Dennison', 'AVERY', 'https://www.averydennison.com/', 'USA', NULL, NULL, 'Sign vinyl, wrapping films', true),

-- Hardware suppliers
('Würth', 'WURTH', 'https://www.wurth.lv/', 'Germany', NULL, NULL, 'Fasteners, screws, hardware', true),
('Hilti', 'HILTI', 'https://www.hilti.lv/', 'Liechtenstein', NULL, NULL, 'Professional anchors, fastening systems', true),

-- Electronics
('Mouser Electronics', 'MOUSER', 'https://www.mouser.com/', 'USA', NULL, NULL, 'Electronic components', true),
('Farnell', 'FARNELL', 'https://www.farnell.com/', 'UK', NULL, NULL, 'Electronic components', true)

ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  website = EXCLUDED.website,
  country = EXCLUDED.country,
  notes = EXCLUDED.notes,
  is_active = EXCLUDED.is_active;
