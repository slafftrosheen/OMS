-- Enable Realtime for chat tables
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_rooms;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view all chat messages" ON chat_messages;
DROP POLICY IF EXISTS "Authenticated users can send chat messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can view all chat rooms" ON chat_rooms;
DROP POLICY IF EXISTS "Authenticated users can create chat rooms" ON chat_rooms;

-- Enable RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_rooms
CREATE POLICY "Anyone can view chat rooms"
  ON chat_rooms
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create chat rooms"
  ON chat_rooms
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for chat_messages
CREATE POLICY "Anyone can view chat messages"
  ON chat_messages
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can send chat messages"
  ON chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their own messages"
  ON chat_messages
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own messages"
  ON chat_messages
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Insert default rooms if they don't exist
INSERT INTO chat_rooms (id, name, room_type, is_private)
VALUES 
  ('general', 'General', 'channel', false),
  ('workstations', 'Workstations', 'channel', false),
  ('logistics', 'Logistics', 'channel', false)
ON CONFLICT (id) DO NOTHING;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created ON chat_messages(room_id, created_at DESC);

-- Add updated_at trigger for chat_messages
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at column if it doesn't exist
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

DROP TRIGGER IF EXISTS update_chat_messages_updated_at ON chat_messages;
CREATE TRIGGER update_chat_messages_updated_at
    BEFORE UPDATE ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions
GRANT SELECT ON chat_rooms TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON chat_rooms TO authenticated;
GRANT SELECT ON chat_messages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON chat_messages TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE chat_messages IS 'Stores chat messages for room-based communication with Supabase Realtime';
COMMENT ON TABLE chat_rooms IS 'Stores chat room definitions for team communication';