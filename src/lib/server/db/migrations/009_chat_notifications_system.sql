-- Chat, messages, notifications

-- Chat rooms
CREATE TABLE chat_rooms (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  room_type VARCHAR(20) DEFAULT 'channel',  -- 'channel', 'direct', 'group'
  is_private BOOLEAN DEFAULT false,
  created_by INTEGER REFERENCES users(id)
);

-- Chat messages
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id VARCHAR(100) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id),
  text TEXT NOT NULL,
  variant VARCHAR(20) DEFAULT 'user',  -- 'user', 'system', 'bot'
  mentions INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  is_edited BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT,
  link VARCHAR(500),
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Station log
CREATE TABLE station_log (
  id SERIAL PRIMARY KEY,
  po_number VARCHAR(50) NOT NULL,
  station VARCHAR(50) NOT NULL,
  notes TEXT,
  redo_reason TEXT,
  logged_by INTEGER REFERENCES users(id),
  logged_at TIMESTAMP DEFAULT NOW()
);

-- Triggers for auto-updating inventory on movements
CREATE OR REPLACE FUNCTION update_inventory_from_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.movement_type IN ('PURCHASE', 'RETURN', 'ADJUSTMENT') THEN
    UPDATE inventory_stock
    SET quantity_in_stock = quantity_in_stock + NEW.quantity
    WHERE id = NEW.inventory_stock_id;
  ELSIF NEW.movement_type IN ('SALE', 'PRODUCTION_USE', 'WASTE', 'DAMAGE') THEN
    UPDATE inventory_stock
    SET quantity_in_stock = quantity_in_stock - NEW.quantity
    WHERE id = NEW.inventory_stock_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
