-- Insert sample data for material_thickness_options table
INSERT INTO material_thickness_options (material_type, thickness, unit, display_name, sort_order) VALUES
  ('PVC', 3, 'mm', '3mm PVC', 10),
  ('PVC', 5, 'mm', '5mm PVC', 20),
  ('PVC', 8, 'mm', '8mm PVC', 30),
  ('PVC', 10, 'mm', '10mm PVC', 40),
  ('ACRYLIC', 3, 'mm', '3mm Acrylic', 10),
  ('ACRYLIC', 5, 'mm', '5mm Acrylic', 20),
  ('ACRYLIC', 8, 'mm', '8mm Acrylic', 30),
  ('ACRYLIC', 10, 'mm', '10mm Acrylic', 40),
  ('DIBOND', 3, 'mm', '3mm Dibond', 10),
  ('DIBOND', 4, 'mm', '4mm Dibond', 20),
  ('DIBOND', 6, 'mm', '6mm Dibond', 30),
  ('ALUMINUM', 1.5, 'mm', '1.5mm Aluminum', 10),
  ('ALUMINUM', 2, 'mm', '2mm Aluminum', 20),
  ('ALUMINUM', 3, 'mm', '3mm Aluminum', 30)
ON CONFLICT DO NOTHING;