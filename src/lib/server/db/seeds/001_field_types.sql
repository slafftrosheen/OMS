-- src/lib/server/db/seeds/001_field_types.sql  INSERT INTO field_types (type_code, component_name, default_config, validation_schema) VALUES   ('material_selector', 'MaterialSelector.svelte',     '{"showThumbnail": true, "allowCustom": false}'::jsonb,    '{"required": false}'::jsonb),
  
  ('material_field', 'MaterialField.svelte',
    '{"materialTypes": ["ACRYLIC", "ALUMINUM", "PVC"], "allowCustomThickness": false}'::jsonb,
    '{"required": false}'::jsonb),      ('thickness_selector', 'ThicknessSelector.svelte',    '{"unit": "mm", "step": 0.1, "min": 0.5, "max": 10}'::jsonb,    '{"type": "number", "min": 0}'::jsonb),      ('color_ral', 'ColorRAL.svelte',    '{"showPreview": true, "previewSize": "md", "searchable": true}'::jsonb,    '{"pattern": "^[0-9]{4}$"}'::jsonb),      ('color_pantone', 'ColorPantone.svelte',    '{"showPreview": true, "previewSize": "md", "searchable": true}'::jsonb,    '{"pattern": "^[0-9]{1,4}\\s?[A-Z]{0,2}$"}'::jsonb),      ('color_oracal', 'ColorOracal.svelte',    '{"showPreview": true, "series": "8500"}'::jsonb,    '{"pattern": "^[0-9]{3}$"}'::jsonb),      ('color_hex', 'ColorHex.svelte',    '{"showPreview": true, "allowAlpha": false}'::jsonb,    '{"pattern": "^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"}'::jsonb),      ('dimension_input', 'DimensionInput.svelte',    '{"unit": "mm", "step": 1, "min": 0}'::jsonb,    '{"type": "number"}'::jsonb),      ('text_input', 'TextInput.svelte',    '{"maxLength": 200}'::jsonb,    '{}'::jsonb),      ('textarea', 'TextArea.svelte',    '{"rows": 3, "maxLength": 1000}'::jsonb,    '{}'::jsonb),      ('checkbox', 'Checkbox.svelte',    '{}'::jsonb,    '{"type": "boolean"}'::jsonb),      ('toggle', 'Toggle.svelte',    '{}'::jsonb,    '{"type": "boolean"}'::jsonb),      ('multi_select_chips', 'MultiSelectChips.svelte',    '{"maxSelections": 10}'::jsonb,    '{"type": "array"}'::jsonb),      ('dropdown', 'Dropdown.svelte',    '{"searchable": false}'::jsonb,    '{}'::jsonb),      ('numeric_input', 'NumericInput.svelte',    '{"step": 1, "min": 0}'::jsonb,    '{"type": "number"}'::jsonb),      ('date_input', 'DateInput.svelte',    '{"format": "YYYY-MM-DD"}'::jsonb,    '{"type": "date"}'::jsonb),      ('icon_selector', 'IconSelector.svelte',    '{"library": "lucide"}'::jsonb,    '{}'::jsonb),      ('file_upload', 'FileUpload.svelte',    '{"acceptedTypes": [".pdf", ".jpg", ".png"], "maxSizeBytes": 10485760}'::jsonb,    '{"type": "file"}'::jsonb),
  
  ('button_group', 'ButtonGroup.svelte',
    '{"visualStyle": "buttons", "multiSelect": false}'::jsonb,
    '{}'::jsonb),
  
  ('oracal_selector', 'OracalSelector.svelte',
    '{"series": "8500", "showColorPreview": true}'::jsonb,
    '{"pattern": "^[0-9]{3}$"}'::jsonb),
  
  ('info_box', 'InfoBox.svelte',
    '{"type": "info", "icon": "alert-circle"}'::jsonb,
    '{}'::jsonb);
