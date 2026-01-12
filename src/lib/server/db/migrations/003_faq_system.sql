-- src/lib/server/db/migrations/003_faq_system.sql
-- Comprehensive FAQ System with categories, items, tags, and views

-- ============================================================
-- FAQ CATEGORIES
-- ============================================================

CREATE TABLE faq_categories (
  id SERIAL PRIMARY KEY,
  name_en VARCHAR(200) NOT NULL,
  name_ru VARCHAR(200),
  name_lv VARCHAR(200),
  slug VARCHAR(100) UNIQUE NOT NULL,
  description_en TEXT,
  description_ru TEXT,
  description_lv TEXT,
  icon VARCHAR(50),
  order_index INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE faq_categories IS 'FAQ categories for organizing knowledge base';
CREATE INDEX idx_faq_categories_slug ON faq_categories(slug);
CREATE INDEX idx_faq_categories_active ON faq_categories(is_active) WHERE is_active = true;

-- ============================================================
-- FAQ ITEMS
-- ============================================================

CREATE TABLE faq_items (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES faq_categories(id) ON DELETE CASCADE,
  question_en TEXT NOT NULL,
  question_ru TEXT,
  question_lv TEXT,
  answer_en TEXT NOT NULL,
  answer_ru TEXT,
  answer_lv TEXT,
  slug VARCHAR(200) UNIQUE NOT NULL,
  order_index INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE faq_items IS 'FAQ items with multi-language support';
CREATE INDEX idx_faq_items_category ON faq_items(category_id);
CREATE INDEX idx_faq_items_slug ON faq_items(slug);
CREATE INDEX idx_faq_items_featured ON faq_items(is_featured) WHERE is_featured = true;
CREATE INDEX idx_faq_items_active ON faq_items(is_active) WHERE is_active = true;
CREATE INDEX idx_faq_items_metadata ON faq_items USING GIN(metadata);

-- ============================================================
-- FAQ TAGS
-- ============================================================

CREATE TABLE faq_tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE faq_tags IS 'Tags for FAQ items';
CREATE INDEX idx_faq_tags_slug ON faq_tags(slug);

-- ============================================================
-- FAQ ITEM TAGS (Junction Table)
-- ============================================================

CREATE TABLE faq_item_tags (
  id SERIAL PRIMARY KEY,
  faq_item_id INTEGER REFERENCES faq_items(id) ON DELETE CASCADE,
  tag_id INTEGER REFERENCES faq_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(faq_item_id, tag_id)
);

COMMENT ON TABLE faq_item_tags IS 'Many-to-many relationship between FAQ items and tags';
CREATE INDEX idx_faq_item_tags_item ON faq_item_tags(faq_item_id);
CREATE INDEX idx_faq_item_tags_tag ON faq_item_tags(tag_id);

-- ============================================================
-- FAQ ATTACHMENTS
-- ============================================================

CREATE TABLE faq_attachments (
  id SERIAL PRIMARY KEY,
  faq_item_id INTEGER REFERENCES faq_items(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_type VARCHAR(100),
  file_size BIGINT,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE faq_attachments IS 'File attachments for FAQ items';
CREATE INDEX idx_faq_attachments_item ON faq_attachments(faq_item_id);

-- ============================================================
-- FAQ VIEWS (Analytics)
-- ============================================================

CREATE TABLE faq_views (
  id SERIAL PRIMARY KEY,
  faq_item_id INTEGER REFERENCES faq_items(id) ON DELETE CASCADE,
  user_id VARCHAR(100),
  ip_address VARCHAR(45),
  user_agent TEXT,
  viewed_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE faq_views IS 'FAQ item view tracking for analytics';
CREATE INDEX idx_faq_views_item ON faq_views(faq_item_id);
CREATE INDEX idx_faq_views_user ON faq_views(user_id);
CREATE INDEX idx_faq_views_date ON faq_views(viewed_at DESC);

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_faq_updated_at() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER faq_categories_updated_at 
BEFORE UPDATE ON faq_categories
FOR EACH ROW EXECUTE FUNCTION update_faq_updated_at();

CREATE TRIGGER faq_items_updated_at 
BEFORE UPDATE ON faq_items
FOR EACH ROW EXECUTE FUNCTION update_faq_updated_at();

-- Function to increment view count
CREATE OR REPLACE FUNCTION increment_faq_view_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE faq_items 
  SET view_count = view_count + 1 
  WHERE id = NEW.faq_item_id;
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER faq_views_increment_count
AFTER INSERT ON faq_views
FOR EACH ROW EXECUTE FUNCTION increment_faq_view_count();

-- Function to update tag usage count
CREATE OR REPLACE FUNCTION update_tag_usage_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE faq_tags 
    SET usage_count = usage_count + 1 
    WHERE id = NEW.tag_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE faq_tags 
    SET usage_count = usage_count - 1 
    WHERE id = OLD.tag_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER faq_item_tags_usage_count
AFTER INSERT OR DELETE ON faq_item_tags
FOR EACH ROW EXECUTE FUNCTION update_tag_usage_count();

-- ============================================================
-- SEED DEFAULT CATEGORIES
-- ============================================================

INSERT INTO faq_categories (name_en, name_ru, name_lv, slug, description_en, description_ru, description_lv, icon, order_index) VALUES
('Profile Configuration', 'Конфигурация профилей', 'Profila konfigurācija', 'profile-config', 
 'Questions about profile types and configurations', 
 'Вопросы о типах профилей и конфигурациях',
 'Jautājumi par profilu veidiem un konfigurācijām',
 'box', 1),

('Materials & Colors', 'Материалы и цвета', 'Materiāli un krāsas', 'materials-colors',
 'Information about materials, colors, and specifications',
 'Информация о материалах, цветах и спецификациях',
 'Informācija par materiāliem, krāsām un specifikācijām',
 'palette', 2),

('Manufacturing', 'Производство', 'Ražošana', 'manufacturing',
 'Manufacturing processes and timelines',
 'Производственные процессы и сроки',
 'Ražošanas procesi un laiki',
 'cog', 3),

('Inventory Management', 'Управление запасами', 'Krājumu pārvaldība', 'inventory',
 'Stock management and inventory tracking',
 'Управление складом и учет запасов',
 'Noliktavas pārvaldība un uzskaite',
 'package', 4),

('Order Management', 'Управление заказами', 'Pasūtījumu pārvaldība', 'orders',
 'Order workflow and processing',
 'Рабочий процесс и обработка заказов',
 'Pasūtījumu apstrāde',
 'clipboard', 5),

('Troubleshooting', 'Устранение неполадок', 'Problēmu novēršana', 'troubleshooting',
 'Common issues and solutions',
 'Распространенные проблемы и решения',
 'Bieži sastopamās problēmas un risinājumi',
 'alert-circle', 6);
