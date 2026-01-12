-- src/lib/server/db/seeds/004_profile_sections.sql

INSERT INTO profile_sections (name, display_name_en, display_name_ru, display_name_lv, icon_id, order_index, is_standard) VALUES
  ('LINE_FREEZER', 'CNC Router', 'ЧПУ Фрезер', 'CNC Frēzēšana', 'router', 1, true),
  ('BENDER', 'Bender', 'Гибка', 'Locīšana', 'bend', 2, true),
  ('FRONT', 'Front', 'Передняя часть', 'Priekšpuse', 'layout', 3, true),
  ('BACKPANEL', 'Back Panel', 'Задняя панель', 'Aizmugures panelis', 'square', 4, true),
  ('PAINTING', 'Painting', 'Покраска', 'Krāsošana', 'paintbrush', 5, true),
  ('ASSEMBLING', 'Assembling', 'Сборка', 'Montāža', 'wrench', 6, true),
  ('DELIVERY', 'Delivery', 'Доставка', 'Piegāde', 'truck', 7, true),
  ('TRIM', 'Trim', 'Отделка', 'Apdare', 'scissors', 8, true);
