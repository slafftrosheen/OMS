-- src/lib/server/db/seeds/003_color_systems.sql

-- RAL Classic Colors (213 colors)
-- Insert statement for each RAL color from ral-classic.json

INSERT INTO color_systems (system_type, code, name, hex_value, rgb_value, finish) VALUES
  ('RAL', '1000', 'Green beige', '#CDBA88', '{"r":205,"g":186,"b":136}'::jsonb, 'matte'),
  ('RAL', '1001', 'Beige', '#D0B084', '{"r":208,"g":176,"b":132}'::jsonb, 'matte'),
  ('RAL', '1002', 'Sand yellow', '#D2AA6D', '{"r":210,"g":170,"b":109}'::jsonb, 'matte'),
  ('RAL', '1003', 'Signal yellow', '#F9A900', '{"r":249,"g":169,"b":0}'::jsonb, 'matte'),
  ('RAL', '1004', 'Golden yellow', '#E49E00', '{"r":228,"g":158,"b":0}'::jsonb, 'matte'),
  ('RAL', '1005', 'Honey yellow', '#CB8F00', '{"r":203,"g":143,"b":0}'::jsonb, 'matte'),
  ('RAL', '3020', 'Traffic red', '#CC0605', '{"r":204,"g":6,"b":5}'::jsonb, 'matte'),
  ('RAL', '7016', 'Anthracite grey', '#373F43', '{"r":55,"g":63,"b":67}'::jsonb, 'matte'),
  ('RAL', '9003', 'Signal white', '#ECECE7', '{"r":236,"g":236,"b":231}'::jsonb, 'matte'),
  ('RAL', '9005', 'Jet black', '#0E0E10', '{"r":14,"g":14,"b":16}'::jsonb, 'matte'),
  ('RAL', '9006', 'White aluminium', '#A1A1A0', '{"r":161,"g":161,"b":160}'::jsonb, 'metallic');

-- ORACAL 8500 Translucent Colors (60+ colors)
INSERT INTO color_systems (system_type, code, name, hex_value, rgb_value, finish) VALUES
  ('ORACAL', '010', 'White', '#FFFFFF', '{"r":255,"g":255,"b":255}'::jsonb, 'gloss'),
  ('ORACAL', '021', 'Yellow', '#FFFF00', '{"r":255,"g":255,"b":0}'::jsonb, 'gloss'),
  ('ORACAL', '031', 'Red', '#FF0000', '{"r":255,"g":0,"b":0}'::jsonb, 'gloss'),
  ('ORACAL', '070', 'Black', '#000000', '{"r":0,"g":0,"b":0}'::jsonb, 'gloss'),
  ('ORACAL', '479', 'Ultramarine', '#120A8F', '{"r":18,"g":10,"b":143}'::jsonb, 'gloss'),
  ('ORACAL', '503', 'Sapphire blue', '#0F52BA', '{"r":15,"g":82,"b":186}'::jsonb, 'gloss');

-- SIGNTRIM Colors (custom trim system)
INSERT INTO color_systems (system_type, code, name, hex_value, rgb_value, finish) VALUES
  ('SIGNTRIM', '118', 'Yellow', '#FFFF00', '{"r":255,"g":255,"b":0}'::jsonb, 'matte'),
  ('SIGNTRIM', '132', 'Signal green', '#00FF00', '{"r":0,"g":255,"b":0}'::jsonb, 'matte'),
  ('SIGNTRIM', '155', 'Yellow 2', '#FFEB3B', '{"r":255,"g":235,"b":59}'::jsonb, 'matte'),
  ('SIGNTRIM', '166', 'Apple green', '#8DB600', '{"r":141,"g":182,"b":0}'::jsonb, 'matte'),
  ('SIGNTRIM', '185', 'MC Yellow', '#FFD700', '{"r":255,"g":215,"b":0}'::jsonb, 'matte'),
  ('SIGNTRIM', '300', 'Silver mirror', '#C0C0C0', '{"r":192,"g":192,"b":192}'::jsonb, 'metallic'),
  ('SIGNTRIM', '313', 'Satin silver', '#AAA9AD', '{"r":170,"g":169,"b":173}'::jsonb, 'satin'),
  ('SIGNTRIM', '415', 'Sky blue', '#87CEEB', '{"r":135,"g":206,"b":235}'::jsonb, 'matte'),
  ('SIGNTRIM', '461', 'Blue', '#0000FF', '{"r":0,"g":0,"b":255}'::jsonb, 'matte'),
  ('SIGNTRIM', '467', 'Blue 2', '#4169E1', '{"r":65,"g":105,"b":225}'::jsonb, 'matte'),
  ('SIGNTRIM', '479', 'Ultramarine', '#120A8F', '{"r":18,"g":10,"b":143}'::jsonb, 'matte'),
  ('SIGNTRIM', '503', 'Sapphire blue', '#0F52BA', '{"r":15,"g":82,"b":186}'::jsonb, 'matte'),
  ('SIGNTRIM', '606', 'Purple', '#800080', '{"r":128,"g":0,"b":128}'::jsonb, 'matte'),
  ('SIGNTRIM', '610', 'Magenta', '#FF00FF', '{"r":255,"g":0,"b":255}'::jsonb, 'matte'),
  ('SIGNTRIM', '664', 'Violet', '#8B00FF', '{"r":139,"g":0,"b":255}'::jsonb, 'matte'),
  ('SIGNTRIM', '721', 'Black/Grey', '#36454F', '{"r":54,"g":69,"b":79}'::jsonb, 'matte'),
  ('SIGNTRIM', '743', 'Traffic grey', '#808080', '{"r":128,"g":128,"b":128}'::jsonb, 'matte'),
  ('SIGNTRIM', '785', 'Black', '#000000', '{"r":0,"g":0,"b":0}'::jsonb, 'matte'),
  ('SIGNTRIM', '896', 'Bronze', '#CD7F32', '{"r":205,"g":127,"b":50}'::jsonb, 'metallic'),
  ('SIGNTRIM', '906', 'White ALU', '#F5F5F5', '{"r":245,"g":245,"b":245}'::jsonb, 'metallic'),
  ('SIGNTRIM', '933', 'Ivory', '#FFFFF0', '{"r":255,"g":255,"b":240}'::jsonb, 'matte'),
  ('SIGNTRIM', '948', 'Beige', '#F5F5DC', '{"r":245,"g":245,"b":220}'::jsonb, 'matte'),
  ('SIGNTRIM', '971', 'White', '#FFFFFF', '{"r":255,"g":255,"b":255}'::jsonb, 'matte');

-- Note: For production, you'll want to import the complete RAL Classic dataset (213 colors)
-- from the ral-classic.json file. This can be done with a script or data migration tool.
