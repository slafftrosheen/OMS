-- Migration 026: Multi-language Content Support
-- Enables i18n for dynamic database content

-- Translatable content storage
CREATE TABLE IF NOT EXISTS translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('material_category', 'material', 'badge', 'notification_template', 'help_article', 'faq')),
  entity_id uuid NOT NULL,
  field_name text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('en', 'ru', 'lv')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(entity_type, entity_id, field_name, locale)
);

CREATE INDEX idx_translations_entity ON translations(entity_type, entity_id);
CREATE INDEX idx_translations_locale ON translations(locale);

-- Translation completeness tracking
CREATE TABLE IF NOT EXISTS translation_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  locale text NOT NULL,
  fields_total integer NOT NULL DEFAULT 0,
  fields_translated integer NOT NULL DEFAULT 0,
  completeness numeric GENERATED ALWAYS AS (
    CASE 
      WHEN fields_total > 0 THEN ROUND((fields_translated::numeric / fields_total) * 100, 2)
      ELSE 0
    END
  ) STORED,
  last_updated timestamptz DEFAULT now(),
  UNIQUE(entity_type, entity_id, locale)
);

CREATE INDEX idx_translation_status_incomplete ON translation_status(entity_type, locale) WHERE completeness < 100;

-- Function: Get translated content
CREATE OR REPLACE FUNCTION get_translation(
  p_entity_type text,
  p_entity_id uuid,
  p_field_name text,
  p_locale text DEFAULT 'en',
  p_fallback_locale text DEFAULT 'en'
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  translated_content text;
BEGIN
  -- Try requested locale
  SELECT content INTO translated_content
  FROM translations
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND field_name = p_field_name
    AND locale = p_locale;
  
  IF translated_content IS NOT NULL THEN
    RETURN translated_content;
  END IF;
  
  -- Fallback to default locale
  IF p_locale != p_fallback_locale THEN
    SELECT content INTO translated_content
    FROM translations
    WHERE entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND field_name = p_field_name
      AND locale = p_fallback_locale;
  END IF;
  
  RETURN translated_content;
END;
$$;

-- Function: Bulk get translations for entity
CREATE OR REPLACE FUNCTION get_entity_translations(
  p_entity_type text,
  p_entity_id uuid,
  p_locale text DEFAULT 'en'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN (
    SELECT jsonb_object_agg(field_name, content)
    FROM translations
    WHERE entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND locale = p_locale
  );
END;
$$;

-- Function: Update translation status
CREATE OR REPLACE FUNCTION update_translation_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  total_fields integer;
  translated_fields integer;
BEGIN
  -- Calculate fields for this entity/locale combination
  SELECT COUNT(DISTINCT field_name) INTO total_fields
  FROM translations
  WHERE entity_type = NEW.entity_type
    AND entity_id = NEW.entity_id
    AND locale = 'en';  -- English is the reference
  
  SELECT COUNT(DISTINCT field_name) INTO translated_fields
  FROM translations
  WHERE entity_type = NEW.entity_type
    AND entity_id = NEW.entity_id
    AND locale = NEW.locale;
  
  INSERT INTO translation_status (entity_type, entity_id, locale, fields_total, fields_translated)
  VALUES (NEW.entity_type, NEW.entity_id, NEW.locale, total_fields, translated_fields)
  ON CONFLICT (entity_type, entity_id, locale) 
  DO UPDATE SET 
    fields_total = total_fields,
    fields_translated = translated_fields,
    last_updated = now();
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_translation_status_trigger
  AFTER INSERT OR UPDATE ON translations
  FOR EACH ROW
  EXECUTE FUNCTION update_translation_status();

-- Insert sample translations for material categories
INSERT INTO translations (entity_type, entity_id, field_name, locale, content)
SELECT 
  'material_category',
  id,
  'name',
  'ru',
  CASE name
    WHEN 'Metal Sheets' THEN 'Металлические листы'
    WHEN 'Plastics' THEN 'Пластмассы'
    WHEN 'Wood' THEN 'Дерево'
    WHEN 'Glass' THEN 'Стекло'
    WHEN 'Fabrics' THEN 'Ткани'
    WHEN 'Composites' THEN 'Композиты'
    WHEN 'Adhesives' THEN 'Клеи'
    WHEN 'Coatings' THEN 'Покрытия'
    ELSE name
  END
FROM material_categories
ON CONFLICT (entity_type, entity_id, field_name, locale) DO NOTHING;

INSERT INTO translations (entity_type, entity_id, field_name, locale, content)
SELECT 
  'material_category',
  id,
  'name',
  'lv',
  CASE name
    WHEN 'Metal Sheets' THEN 'Metāla loksnes'
    WHEN 'Plastics' THEN 'Plastmasa'
    WHEN 'Wood' THEN 'Koks'
    WHEN 'Glass' THEN 'Stikls'
    WHEN 'Fabrics' THEN 'Audumi'
    WHEN 'Composites' THEN 'Kompozīti'
    WHEN 'Adhesives' THEN 'Līmes'
    WHEN 'Coatings' THEN 'Pārklājumi'
    ELSE name
  END
FROM material_categories
ON CONFLICT (entity_type, entity_id, field_name, locale) DO NOTHING;

-- RLS Policies
ALTER TABLE translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read translations"
  ON translations FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage translations"
  ON translations FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Everyone can view translation status"
  ON translation_status FOR SELECT
  USING (true);

COMMENT ON TABLE translations IS 'Multilingual content for database entities';
COMMENT ON TABLE translation_status IS 'Tracks translation completeness per entity and locale';
