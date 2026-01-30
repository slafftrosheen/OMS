-- Migration 028: Performance Optimization Indexes
-- Additional indexes for common query patterns

-- Orders table indexes
CREATE INDEX IF NOT EXISTS idx_orders_status_due ON orders(status, deadline) WHERE status != 'completed';
CREATE INDEX IF NOT EXISTS idx_orders_client_status ON orders(client_name, status);
CREATE INDEX IF NOT EXISTS idx_orders_loading_date ON orders(loading_date) WHERE loading_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at_desc ON orders(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_is_rd ON orders(is_rd) WHERE is_rd = true;

-- Full-text search on orders
CREATE INDEX IF NOT EXISTS idx_orders_search_gin ON orders 
USING gin(to_tsvector('english', 
  coalesce(po_number, '') || ' ' || 
  coalesce(title, '') || ' ' || 
  coalesce(client_name, '') || ' ' ||
  coalesce(notes, '')
));

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_station ON profiles(station) WHERE station IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON profiles(display_name);
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON profiles(lower(email));

-- Files indexes
CREATE INDEX IF NOT EXISTS idx_files_order_type ON files(order_id, file_type);
CREATE INDEX IF NOT EXISTS idx_files_mime ON files(mime_type);
CREATE INDEX IF NOT EXISTS idx_files_uploaded_at ON files(created_at DESC);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, seen) WHERE NOT seen;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- Chat messages indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created ON chat_messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_search ON chat_messages 
USING gin(to_tsvector('english', coalesce(content, '')));

-- Station logs indexes
CREATE INDEX IF NOT EXISTS idx_station_logs_order_station ON station_logs(order_id, station);
CREATE INDEX IF NOT EXISTS idx_station_logs_created ON station_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_station_logs_user ON station_logs(user_id);

-- Change requests indexes
CREATE INDEX IF NOT EXISTS idx_change_requests_order_status ON change_requests(order_id, status);
CREATE INDEX IF NOT EXISTS idx_change_requests_pending ON change_requests(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_change_requests_created ON change_requests(created_at DESC);

-- Inventory indexes
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category_id);
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock ON inventory(current_stock) WHERE current_stock <= minimum_stock;
CREATE INDEX IF NOT EXISTS idx_inventory_name_search ON inventory 
USING gin(to_tsvector('english', name));

-- Inventory movements indexes
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_date ON inventory_movements(inventory_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_order ON inventory_movements(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(movement_type);

-- Calendar indexes
CREATE INDEX IF NOT EXISTS idx_calendar_date_range ON calendar(date) WHERE date >= CURRENT_DATE;
CREATE INDEX IF NOT EXISTS idx_calendar_has_capacity ON calendar(date) WHERE max_orders > 0;

-- QR codes indexes
CREATE INDEX IF NOT EXISTS idx_qr_codes_entity ON qr_codes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_code ON qr_codes(code) WHERE active = true;

-- Analytics event indexes
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_date ON analytics_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_date ON analytics_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_order ON analytics_events(order_id) WHERE order_id IS NOT NULL;

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_user_date ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- Composite indexes for common join patterns
CREATE INDEX IF NOT EXISTS idx_orders_files_join ON files(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_notifications_join ON notifications(order_id, created_at DESC) WHERE order_id IS NOT NULL;

-- Partial indexes for specific queries
CREATE INDEX IF NOT EXISTS idx_orders_urgent ON orders(deadline) 
  WHERE status NOT IN ('completed', 'cancelled') AND deadline <= CURRENT_DATE + INTERVAL '3 days';

CREATE INDEX IF NOT EXISTS idx_orders_blocked ON orders(updated_at DESC) 
  WHERE status = 'blocked';

-- Statistics collection
ANALYZE orders;
ANALYZE profiles;
ANALYZE files;
ANALYZE notifications;
ANALYZE chat_messages;
ANALYZE station_logs;
ANALYZE inventory;
ANALYZE change_requests;

COMMENT ON INDEX idx_orders_search_gin IS 'Full-text search index for orders';
COMMENT ON INDEX idx_orders_urgent IS 'Partial index for urgent orders';
COMMENT ON INDEX idx_inventory_low_stock IS 'Partial index for low stock alerts';
