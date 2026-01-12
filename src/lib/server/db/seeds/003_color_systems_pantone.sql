-- src/lib/server/db/seeds/003_color_systems_pantone.sql
-- PANTONE Solid Coated Colors (subset for signage)

INSERT INTO color_systems (system_type, code, name, hex_value, rgb_value, finish) VALUES
  -- Base PANTONE Colors
  ('PANTONE', 'Yellow', 'PANTONE Yellow C', '#FEDF00', '{"r":254,"g":223,"b":0}'::jsonb, 'coated'),
  ('PANTONE', 'Yellow 012', 'PANTONE Yellow 012 C', '#FFD700', '{"r":255,"g":215,"b":0}'::jsonb, 'coated'),
  ('PANTONE', 'Orange 021', 'PANTONE Orange 021 C', '#FE5000', '{"r":254,"g":80,"b":0}'::jsonb, 'coated'),
  ('PANTONE', 'Warm Red', 'PANTONE Warm Red C', '#F9423A', '{"r":249,"g":66,"b":58}'::jsonb, 'coated'),
  ('PANTONE', 'Red 032', 'PANTONE Red 032 C', '#EF3340', '{"r":239,"g":51,"b":64}'::jsonb, 'coated'),
  ('PANTONE', 'Rubine Red', 'PANTONE Rubine Red C', '#CE0058', '{"r":206,"g":0,"b":88}'::jsonb, 'coated'),
  ('PANTONE', 'Rhodamine Red', 'PANTONE Rhodamine Red C', '#E10098', '{"r":225,"g":0,"b":152}'::jsonb, 'coated'),
  ('PANTONE', 'Purple', 'PANTONE Purple C', '#BB29BB', '{"r":187,"g":41,"b":187}'::jsonb, 'coated'),
  ('PANTONE', 'Violet', 'PANTONE Violet C', '#440099', '{"r":68,"g":0,"b":153}'::jsonb, 'coated'),
  ('PANTONE', 'Blue 072', 'PANTONE Blue 072 C', '#10069F', '{"r":16,"g":6,"b":159}'::jsonb, 'coated'),
  ('PANTONE', 'Reflex Blue', 'PANTONE Reflex Blue C', '#001489', '{"r":0,"g":20,"b":137}'::jsonb, 'coated'),
  ('PANTONE', 'Process Blue', 'PANTONE Process Blue C', '#0085CA', '{"r":0,"g":133,"b":202}'::jsonb, 'coated'),
  ('PANTONE', 'Green', 'PANTONE Green C', '#00AB84', '{"r":0,"g":171,"b":132}'::jsonb, 'coated'),
  ('PANTONE', 'Black', 'PANTONE Black C', '#2D2926', '{"r":45,"g":41,"b":38}'::jsonb, 'coated'),

  -- Most Common Numbered PANTONE Colors for Signage
  ('PANTONE', '185', 'PANTONE 185 C', '#E4002B', '{"r":228,"g":0,"b":43}'::jsonb, 'coated'),
  ('PANTONE', '186', 'PANTONE 186 C', '#C8102E', '{"r":200,"g":16,"b":46}'::jsonb, 'coated'),
  ('PANTONE', '187', 'PANTONE 187 C', '#A6093D', '{"r":166,"g":9,"b":61}'::jsonb, 'coated'),
  ('PANTONE', '280', 'PANTONE 280 C', '#012169', '{"r":1,"g":33,"b":105}'::jsonb, 'coated'),
  ('PANTONE', '281', 'PANTONE 281 C', '#00205B', '{"r":0,"g":32,"b":91}'::jsonb, 'coated'),
  ('PANTONE', '282', 'PANTONE 282 C', '#041E42', '{"r":4,"g":30,"b":66}'::jsonb, 'coated'),
  ('PANTONE', '286', 'PANTONE 286 C', '#0033A0', '{"r":0,"g":51,"b":160}'::jsonb, 'coated'),
  ('PANTONE', '287', 'PANTONE 287 C', '#003087', '{"r":0,"g":48,"b":135}'::jsonb, 'coated'),
  ('PANTONE', '300', 'PANTONE 300 C', '#005EB8', '{"r":0,"g":94,"b":184}'::jsonb, 'coated'),
  ('PANTONE', '301', 'PANTONE 301 C', '#004B87', '{"r":0,"g":75,"b":135}'::jsonb, 'coated'),
  ('PANTONE', '302', 'PANTONE 302 C', '#003B5C', '{"r":0,"g":59,"b":92}'::jsonb, 'coated'),
  ('PANTONE', '320', 'PANTONE 320 C', '#009CA6', '{"r":0,"g":156,"b":166}'::jsonb, 'coated'),
  ('PANTONE', '321', 'PANTONE 321 C', '#008C95', '{"r":0,"g":140,"b":149}'::jsonb, 'coated'),
  ('PANTONE', '333', 'PANTONE 333 C', '#006272', '{"r":0,"g":98,"b":114}'::jsonb, 'coated'),
  ('PANTONE', '347', 'PANTONE 347 C', '#009A44', '{"r":0,"g":154,"b":68}'::jsonb, 'coated'),
  ('PANTONE', '348', 'PANTONE 348 C', '#00843D', '{"r":0,"g":132,"b":61}'::jsonb, 'coated'),
  ('PANTONE', '349', 'PANTONE 349 C', '#046A38', '{"r":4,"g":106,"b":56}'::jsonb, 'coated'),
  ('PANTONE', '368', 'PANTONE 368 C', '#78BE20', '{"r":120,"g":190,"b":32}'::jsonb, 'coated'),
  ('PANTONE', '369', 'PANTONE 369 C', '#64A70B', '{"r":100,"g":167,"b":11}'::jsonb, 'coated'),

  -- Cool Gray Series (most used)
  ('PANTONE', 'Cool Gray 1', 'PANTONE Cool Gray 1 C', '#D9D9D6', '{"r":217,"g":217,"b":214}'::jsonb, 'coated'),
  ('PANTONE', 'Cool Gray 5', 'PANTONE Cool Gray 5 C', '#B1B3B3', '{"r":177,"g":179,"b":179}'::jsonb, 'coated'),
  ('PANTONE', 'Cool Gray 7', 'PANTONE Cool Gray 7 C', '#97999B', '{"r":151,"g":153,"b":155}'::jsonb, 'coated'),
  ('PANTONE', 'Cool Gray 9', 'PANTONE Cool Gray 9 C', '#75787B', '{"r":117,"g":120,"b":123}'::jsonb, 'coated'),
  ('PANTONE', 'Cool Gray 11', 'PANTONE Cool Gray 11 C', '#53565A', '{"r":83,"g":86,"b":90}'::jsonb, 'coated'),

  -- Warm Gray Series (most used)
  ('PANTONE', 'Warm Gray 1', 'PANTONE Warm Gray 1 C', '#D7D2CB', '{"r":215,"g":210,"b":203}'::jsonb, 'coated'),
  ('PANTONE', 'Warm Gray 5', 'PANTONE Warm Gray 5 C', '#ACA39A', '{"r":172,"g":163,"b":154}'::jsonb, 'coated'),
  ('PANTONE', 'Warm Gray 7', 'PANTONE Warm Gray 7 C', '#968C83', '{"r":150,"g":140,"b":131}'::jsonb, 'coated'),
  ('PANTONE', 'Warm Gray 9', 'PANTONE Warm Gray 9 C', '#84796F', '{"r":132,"g":121,"b":111}'::jsonb, 'coated'),
  ('PANTONE', 'Warm Gray 11', 'PANTONE Warm Gray 11 C', '#6E6259', '{"r":110,"g":98,"b":89}'::jsonb, 'coated');

-- Note: For production, import the complete PANTONE library from pantone-solid-coated.json
-- This can be done using a data migration script or JSON import tool.
