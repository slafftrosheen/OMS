-- =================================================================
-- 12: SEED DATA
-- =================================================================
-- Initial data for development and testing
-- =================================================================

-- Seed material categories
INSERT INTO public.materials (category, code, name_en, name_ru, name_lv) VALUES
    ('sheet', 'ALUM_SHEET', 'Aluminum Sheet', 'Алюминиевый лист', 'Alumīnija loksne'),
    ('sheet', 'STEEL_SHEET', 'Steel Sheet', 'Стальной лист', 'Tērauda loksne'),
    ('sheet', 'ACM_PANEL', 'ACM Panel', 'ACM панель', 'ACM panelis'),
    ('vinyl', 'ORACAL_651', 'Oracal 651', 'Оракал 651', 'Oracal 651'),
    ('vinyl', 'ORACAL_751', 'Oracal 751', 'Оракал 751', 'Oracal 751'),
    ('acrylic', 'PMMA_CAST', 'Cast Acrylic', 'Литой акрил', 'Lējuma akrils'),
    ('acrylic', 'PMMA_EXTRUDED', 'Extruded Acrylic', 'Экструдированный акрил', 'Ekstr. akrils')
ON CONFLICT (code) DO NOTHING;

-- Seed capacity config
INSERT INTO public.capacity_config (config_type, default_capacity, is_active) VALUES
    ('daily_loading', 10, true)
ON CONFLICT DO NOTHING;

-- Seed delivery presets
INSERT INTO public.delivery_presets (name, address, contact, phone, is_default) VALUES
    ('Main Warehouse', '123 Industrial St, Riga, LV-1234', 'John Warehouse', '+371 12345678', true),
    ('Client Pickup', 'To be arranged', 'Sales Team', '+371 87654321', false)
ON CONFLICT DO NOTHING;

-- Seed profile templates (example)
INSERT INTO public.profile_templates (code, name, version, is_active, description) VALUES
    ('SIGN_BASIC', 'Basic Sign', 1, true, 'Basic signage profile'),
    ('SIGN_LED', 'LED Sign', 1, true, 'LED illuminated signage'),
    ('CHANNEL_LETTERS', 'Channel Letters', 1, true, '3D channel letter profile')
ON CONFLICT (code) DO NOTHING;

-- Seed FAQs
INSERT INTO public.faqs (slug, question, answer, order_index) VALUES
    ('how-to-create-order', 'How do I create a new order?', 'Navigate to Orders page and click the "New Order" button. Fill in the required fields including PO number, client, and delivery details.', 1),
    ('loading-schedule', 'How does loading scheduling work?', 'Loading dates are managed in the Calendar section. Admins can set capacity limits per day and assign orders to specific loading events.', 2),
    ('inventory-tracking', 'How is inventory tracked?', 'Inventory items are automatically updated when orders are fulfilled. You can also manually adjust stock levels in the Inventory section.', 3)
ON CONFLICT (slug) DO NOTHING;

-- Comments
COMMENT ON SCHEMA public IS 'OMS application schema with all tables and data';
