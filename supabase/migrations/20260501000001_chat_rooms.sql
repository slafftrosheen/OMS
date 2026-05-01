-- Create chat_rooms table to persist rooms and seed station rooms.
CREATE TABLE IF NOT EXISTS chat_rooms (
    id          text PRIMARY KEY,
    name        text NOT NULL,
    kind        text NOT NULL DEFAULT 'channel',  -- 'channel' | 'station' | 'order'
    station     text,                              -- optional: maps to WORKFLOW_STAGES
    order_id    uuid REFERENCES draft_orders(id) ON DELETE CASCADE,
    created_by  uuid REFERENCES profiles(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz
);

-- Seed default channels
INSERT INTO chat_rooms (id, name, kind) VALUES
    ('general',      'General',      'channel'),
    ('workstations', 'Workstations', 'channel'),
    ('logistics',    'Logistics',    'channel'),
    ('announcements','Announcements','channel')
ON CONFLICT (id) DO NOTHING;

-- Seed station rooms (one per production stage)
INSERT INTO chat_rooms (id, name, kind, station) VALUES
    ('station-cad',       'CAD',       'station', 'CAD'),
    ('station-cnc',       'CNC',       'station', 'CNC'),
    ('station-edge',      'Edge',      'station', 'EDGE'),
    ('station-assembly',  'Assembly',  'station', 'ASSEMBLY'),
    ('station-paint',     'Paint',     'station', 'PAINT'),
    ('station-packaging', 'Packaging', 'station', 'PACKAGING'),
    ('station-delivery',  'Delivery',  'station', 'DELIVERY')
ON CONFLICT (id) DO NOTHING;

-- Add room_id FK on chat_messages if missing (allows proper indexing)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chat_messages' AND column_name = 'room_id'
    ) THEN
        ALTER TABLE chat_messages ADD COLUMN room_id text REFERENCES chat_rooms(id);
    END IF;
END$$;

-- Index for fast room lookups
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON chat_messages(room_id, created_at DESC);

-- RLS: anyone authenticated can read rooms
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_rooms_read" ON chat_rooms;
CREATE POLICY "chat_rooms_read" ON chat_rooms
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "chat_rooms_insert" ON chat_rooms;
CREATE POLICY "chat_rooms_insert" ON chat_rooms
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND archived_at IS NULL);

COMMENT ON TABLE chat_rooms IS 'Chat channels: general channels, per-station rooms, and per-order threads.';
