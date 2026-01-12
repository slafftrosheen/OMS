-- Key indexes for performance

-- Users
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = true;

-- Sessions
CREATE INDEX idx_sessions_token ON user_sessions(token_hash);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);

-- Orders
CREATE INDEX idx_draft_orders_po ON draft_orders(po_number);
CREATE INDEX idx_draft_orders_status ON draft_orders(status);
CREATE INDEX idx_draft_orders_due_date ON draft_orders(due_date);

-- Inventory
CREATE INDEX idx_inventory_stock_material ON inventory_stock(material_id);
CREATE INDEX idx_inventory_stock_low ON inventory_stock(quantity_in_stock)
  WHERE quantity_in_stock <= minimum_stock_level;

-- Calendar
CREATE INDEX idx_cal_events_date ON calendar_events(date);
CREATE INDEX idx_cal_events_kind ON calendar_events(kind);

-- Chat
CREATE INDEX idx_chat_messages_room ON chat_messages(room_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at DESC);

-- Audit
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
