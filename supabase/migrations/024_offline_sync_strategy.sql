-- Migration 024: Offline Sync Strategy for PWA
-- Enables offline-first functionality with conflict resolution

-- Sync queue table for offline operations
CREATE TABLE IF NOT EXISTS sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('order', 'stage', 'comment', 'file', 'notification')),
  entity_id text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  payload jsonb NOT NULL,
  client_timestamp timestamptz NOT NULL,
  server_timestamp timestamptz DEFAULT now(),
  synced boolean DEFAULT false,
  conflict_resolved boolean DEFAULT false,
  conflict_data jsonb,
  retry_count integer DEFAULT 0,
  last_error text,
  created_at timestamptz DEFAULT now()
);

-- Indexes for sync operations
CREATE INDEX idx_sync_queue_user ON sync_queue(user_id, synced);
CREATE INDEX idx_sync_queue_entity ON sync_queue(entity_type, entity_id);
CREATE INDEX idx_sync_queue_timestamp ON sync_queue(client_timestamp) WHERE NOT synced;

-- Client state tracking (last sync timestamp per user/device)
CREATE TABLE IF NOT EXISTS client_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  last_sync_at timestamptz NOT NULL,
  sync_token text,
  app_version text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, device_id)
);

CREATE INDEX idx_client_sync_user ON client_sync_state(user_id);

-- Conflict log for manual resolution
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_queue_id uuid REFERENCES sync_queue(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  client_version jsonb NOT NULL,
  server_version jsonb NOT NULL,
  resolution_strategy text CHECK (resolution_strategy IN ('client_wins', 'server_wins', 'merge', 'manual')),
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_sync_conflicts_unresolved ON sync_conflicts(entity_type, entity_id) WHERE resolved_at IS NULL;

-- Function: Process sync queue item
CREATE OR REPLACE FUNCTION process_sync_queue_item(queue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  queue_record sync_queue%ROWTYPE;
  result jsonb;
  conflict_exists boolean;
BEGIN
  SELECT * INTO queue_record FROM sync_queue WHERE id = queue_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;
  
  -- Check for conflicts (server-side changes after client timestamp)
  conflict_exists := false;
  
  IF queue_record.entity_type = 'order' THEN
    SELECT EXISTS(
      SELECT 1 FROM orders 
      WHERE id = queue_record.entity_id::uuid 
      AND updated_at > queue_record.client_timestamp
    ) INTO conflict_exists;
  END IF;
  
  IF conflict_exists THEN
    -- Create conflict record for manual resolution
    INSERT INTO sync_conflicts (sync_queue_id, entity_type, entity_id, client_version, server_version)
    VALUES (queue_id, queue_record.entity_type, queue_record.entity_id, queue_record.payload, 
            (SELECT to_jsonb(o.*) FROM orders o WHERE id = queue_record.entity_id::uuid));
    
    UPDATE sync_queue SET conflict_resolved = false WHERE id = queue_id;
    RETURN jsonb_build_object('success', false, 'conflict', true);
  END IF;
  
  -- Apply operation
  CASE queue_record.operation
    WHEN 'update' THEN
      IF queue_record.entity_type = 'order' THEN
        UPDATE orders SET
          client_name = COALESCE((queue_record.payload->>'client')::text, client_name),
          title = COALESCE((queue_record.payload->>'title')::text, title),
          updated_at = now()
        WHERE id = queue_record.entity_id::uuid;
      END IF;
    ELSE
      -- Handle other operations
      NULL;
  END CASE;
  
  -- Mark as synced
  UPDATE sync_queue SET synced = true, server_timestamp = now() WHERE id = queue_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function: Get pending sync items for user
CREATE OR REPLACE FUNCTION get_pending_sync_items(p_user_id uuid, p_device_id text)
RETURNS TABLE (
  id uuid,
  entity_type text,
  entity_id text,
  operation text,
  payload jsonb,
  client_timestamp timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT sq.id, sq.entity_type, sq.entity_id, sq.operation, sq.payload, sq.client_timestamp
  FROM sync_queue sq
  WHERE sq.user_id = p_user_id
    AND NOT sq.synced
    AND sq.retry_count < 5
  ORDER BY sq.client_timestamp ASC
  LIMIT 100;
END;
$$;

-- RLS Policies
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sync queue"
  ON sync_queue FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own sync state"
  ON client_sync_state FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own conflicts"
  ON sync_conflicts FOR SELECT
  USING (auth.uid() IN (
    SELECT user_id FROM sync_queue WHERE id = sync_conflicts.sync_queue_id
  ));

CREATE POLICY "Admins can resolve conflicts"
  ON sync_conflicts FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

COMMENT ON TABLE sync_queue IS 'Queue for offline operations awaiting sync';
COMMENT ON TABLE client_sync_state IS 'Tracks last sync timestamp per user device';
COMMENT ON TABLE sync_conflicts IS 'Logs sync conflicts for resolution';
