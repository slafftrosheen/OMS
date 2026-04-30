
-- Seed maker tools
INSERT INTO public.ai_tools (slug, label, description, icon, category, schema, roles, stations, endpoint, enabled)
VALUES 
(
    'maker.list_sketches', 
    'List technical sketches', 
    'List all technical sketches created with Maker.js.', 
    'ruler', 
    'Technical', 
    '{"name": "list_sketches", "parameters": {"type": "object", "properties": {}}}'::jsonb, 
    ARRAY['Admin', 'Production'], 
    ARRAY[]::text[], 
    '/api/ai/maker',
    true
),
(
    'maker.read_sketch', 
    'Read technical sketch', 
    'Read the Maker.js code and metadata of a specific technical sketch by ID.', 
    'file-code', 
    'Technical', 
    '{"name": "read_sketch", "parameters": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]}}'::jsonb, 
    ARRAY['Admin', 'Production'], 
    ARRAY[]::text[], 
    '/api/ai/maker/:id',
    true
),
(
    'maker.save_sketch', 
    'Save technical sketch', 
    'Create or update a technical sketch with Maker.js code. Use for parametric models and precise technical drawings.', 
    'save', 
    'Technical', 
    '{"name": "save_sketch", "parameters": {"type": "object", "properties": {"id": {"type": "string"}, "title": {"type": "string"}, "code": {"type": "string"}, "description": {"type": "string"}}, "required": ["title", "code"]}}'::jsonb, 
    ARRAY['Admin', 'Production'], 
    ARRAY[]::text[], 
    '/api/ai/maker',
    true
)
ON CONFLICT (slug) DO UPDATE 
SET 
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    schema = EXCLUDED.schema,
    enabled = EXCLUDED.enabled;
