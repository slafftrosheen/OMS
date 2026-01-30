/**
 * Backup and Restore System Migration
 * Automated backups, restore points, and disaster recovery
 */

-- Enable pg_trgm extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Backup configurations table
CREATE TABLE IF NOT EXISTS backup_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Configuration details
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  
  -- Backup type
  backup_type TEXT NOT NULL DEFAULT 'full' CHECK (
    backup_type IN ('full', 'incremental', 'differential', 'transaction_log')
  ),
  
  -- Schedule configuration
  schedule_enabled BOOLEAN DEFAULT true,
  schedule_cron TEXT, -- For advanced scheduling
  schedule_interval_hours INTEGER, -- For simple intervals
  next_run_at TIMESTAMPTZ,
  
  -- Retention settings
  retention_days INTEGER DEFAULT 30,
  max_backups INTEGER DEFAULT 10,
  
  -- Storage configuration
  storage_location TEXT NOT NULL DEFAULT 'local' CHECK (
    storage_location IN ('local', 's3', 'gcs', 'azure', 'ftp')
  ),
  storage_config JSONB DEFAULT '{}'::jsonb,
  
  -- Backup options
  compression_enabled BOOLEAN DEFAULT true,
  compression_level INTEGER DEFAULT 6 CHECK (compression_level BETWEEN 1 AND 9),
  encryption_enabled BOOLEAN DEFAULT true,
  encryption_algorithm TEXT DEFAULT 'aes-256-gcm',
  
  -- Scope configuration
  include_tables TEXT[] DEFAULT '{}',
  exclude_tables TEXT[] DEFAULT '{}',
  include_attachments BOOLEAN DEFAULT true,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  
  -- Metadata
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Backup history table
CREATE TABLE IF NOT EXISTS backup_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference to config
  backup_config_id UUID REFERENCES backup_configs(id) ON DELETE SET NULL,
  
  -- Backup details
  backup_type TEXT NOT NULL,
  backup_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  
  -- File information
  file_size_bytes BIGINT,
  compressed_size_bytes BIGINT,
  checksum_md5 TEXT,
  checksum_sha256 TEXT,
  
  -- Content details
  tables_included TEXT[],
  row_counts JSONB, -- { table_name: count }
  total_rows BIGINT,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled', 'expired')
  ),
  error_message TEXT,
  
  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  
  -- Statistics
  records_processed BIGINT DEFAULT 0,
  records_skipped BIGINT DEFAULT 0,
  
  -- Retention
  expires_at TIMESTAMPTZ,
  
  -- Metadata
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Restore operations table
CREATE TABLE IF NOT EXISTS restore_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference to backup
  backup_history_id UUID NOT NULL REFERENCES backup_history(id) ON DELETE CASCADE,
  
  -- Restore details
  restore_type TEXT NOT NULL CHECK (
    restore_type IN ('full', 'partial', 'point_in_time', 'table_specific', 'record_specific')
  ),
  
  -- Scope
  tables_to_restore TEXT[],
  records_to_restore JSONB, -- For point-in-time restores
  restore_from TIMESTAMPTZ, -- For point-in-time restores
  
  -- Options
  overwrite_existing BOOLEAN DEFAULT false,
  preserve_current BOOLEAN DEFAULT true,
  restore_indexes BOOLEAN DEFAULT true,
  restore_constraints BOOLEAN DEFAULT true,
  restore_triggers BOOLEAN DEFAULT true,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'validating', 'in_progress', 'completed', 'failed', 'rolled_back')
  ),
  error_message TEXT,
  
  -- Progress tracking
  tables_restored INTEGER DEFAULT 0,
  records_restored BIGINT DEFAULT 0,
  tables_total INTEGER,
  records_total BIGINT,
  
  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  
  -- Metadata
  initiated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Data snapshots (for point-in-time recovery)
CREATE TABLE IF NOT EXISTS data_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Snapshot details
  name TEXT NOT NULL,
  description TEXT,
  
  -- Content
  snapshot_type TEXT NOT NULL CHECK (
    snapshot_type IN ('manual', 'automated', 'pre_upgrade', 'pre_maintenance', 'pre_restore')
  ),
  tables_snapshot JSONB NOT NULL, -- { table_name: { count: n, size: bytes, checksum: hash } }
  total_size_bytes BIGINT,
  
  -- Scope
  tables_included TEXT[],
  tables_excluded TEXT[],
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'archived', 'deleted', 'corrupted')
  ),
  
  -- Retention
  expires_at TIMESTAMPTZ,
  
  -- Metadata
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backup notifications table
CREATE TABLE IF NOT EXISTS backup_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- References
  backup_history_id UUID REFERENCES backup_history(id) ON DELETE CASCADE,
  restore_operation_id UUID REFERENCES restore_operations(id) ON DELETE CASCADE,
  
  -- Notification details
  notification_type TEXT NOT NULL CHECK (
    notification_type IN ('success', 'failure', 'warning', 'scheduled', 'completed')
  ),
  
  -- Recipients
  recipients TEXT[] NOT NULL, -- Email addresses
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Status
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_backup_configs_active ON backup_configs(is_active) WHERE is_active = true;
CREATE INDEX idx_backup_configs_next_run ON backup_configs(next_run_at) WHERE is_active = true AND schedule_enabled = true;
CREATE INDEX idx_backup_history_config ON backup_history(backup_config_id);
CREATE INDEX idx_backup_history_status ON backup_history(status);
CREATE INDEX idx_backup_history_created ON backup_history(created_at DESC);
CREATE INDEX idx_backup_history_expires ON backup_history(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_restore_operations_backup ON restore_operations(backup_history_id);
CREATE INDEX idx_restore_operations_status ON restore_operations(status);
CREATE INDEX idx_restore_operations_initiated ON restore_operations(initiated_by);
CREATE INDEX idx_data_snapshots_type ON data_snapshots(snapshot_type);
CREATE INDEX idx_data_snapshots_created ON data_snapshots(created_at DESC);
CREATE INDEX idx_data_snapshots_expires ON data_snapshots(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_backup_notifications_sent ON backup_notifications(sent) WHERE sent = false;

-- RLS Policies
ALTER TABLE backup_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE restore_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage backup configs"
  ON backup_configs FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can view own backup configs"
  ON backup_configs FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Admins can manage backup history"
  ON backup_history FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Users can view own backup history"
  ON backup_history FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Admins can manage restore operations"
  ON restore_operations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can view own restore operations"
  ON restore_operations FOR SELECT
  TO authenticated
  USING (initiated_by = auth.uid());

CREATE POLICY "Admins can manage data snapshots"
  ON data_snapshots FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can view own snapshots"
  ON data_snapshots FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- Function to calculate next backup run time
CREATE OR REPLACE FUNCTION calculate_next_backup_run(
  p_schedule_interval_hours INTEGER,
  p_last_run TIMESTAMPTZ DEFAULT NULL,
  p_cron_expression TEXT DEFAULT NULL
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
DECLARE
  v_next_run TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF p_cron_expression IS NOT NULL THEN
    -- For now, use simple interval if cron is provided
    -- In production, you'd want a proper cron parser
    v_next_run := COALESCE(p_last_run, v_now) + 
                  (COALESCE(p_schedule_interval_hours, 24) || ' hours')::INTERVAL;
  ELSE
    -- Simple interval-based scheduling
    v_next_run := COALESCE(p_last_run, v_now) + 
                  (COALESCE(p_schedule_interval_hours, 24) || ' hours')::INTERVAL;
  END IF;
  
  RETURN v_next_run;
END;
$$;

-- Function to create backup
CREATE OR REPLACE FUNCTION create_backup(
  p_config_id UUID,
  p_backup_type TEXT DEFAULT 'full'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config RECORD;
  v_backup_id UUID;
  v_backup_name TEXT;
BEGIN
  -- Get config
  SELECT * INTO v_config
  FROM backup_configs
  WHERE id = p_config_id AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Backup config not found or inactive';
  END IF;
  
  -- Generate backup name
  v_backup_name := v_config.name || '_' || TO_CHAR(NOW(), 'YYYYMMDD_HH24MISS');
  
  -- Create backup record
  INSERT INTO backup_history (
    backup_config_id,
    backup_type,
    backup_name,
    file_path,
    status,
    created_by
  )
  VALUES (
    p_config_id,
    p_backup_type,
    v_backup_name,
    'backups/' || v_backup_name || '.sql.gz',
    'pending',
    auth.uid()
  )
  RETURNING id INTO v_backup_id;
  
  -- Update config with next run time
  UPDATE backup_configs
  SET 
    last_run_at = NOW(),
    next_run_at = calculate_next_backup_run(
      schedule_interval_hours,
      last_run_at,
      schedule_cron
    )
  WHERE id = p_config_id;
  
  RETURN v_backup_id;
END;
$$;

-- Function to clean up expired backups
CREATE OR REPLACE FUNCTION cleanup_expired_backups()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Mark expired backups
  UPDATE backup_history
  SET status = 'expired'
  WHERE status = 'completed'
    AND expires_at < NOW()
    AND expires_at IS NOT NULL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$;

-- Trigger to update next run time
CREATE OR REPLACE FUNCTION update_backup_config_next_run()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.next_run_at := calculate_next_backup_run(
    NEW.schedule_interval_hours,
    NEW.last_run_at,
    NEW.schedule_cron
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_backup_config_next_run
  BEFORE INSERT OR UPDATE OF last_run_at ON backup_configs
  FOR EACH ROW
  WHEN (NEW.schedule_enabled = true AND NEW.is_active = true)
  EXECUTE FUNCTION update_backup_config_next_run();

-- View for backup statistics
CREATE OR REPLACE VIEW backup_statistics AS
SELECT
  bc.id as config_id,
  bc.name as config_name,
  bc.backup_type,
  bc.is_active,
  bc.last_run_at,
  bc.next_run_at,
  
  -- Counts
  COUNT(bh.id) as total_backups,
  COUNT(*) FILTER (WHERE bh.status = 'completed') as successful_backups,
  COUNT(*) FILTER (WHERE bh.status = 'failed') as failed_backups,
  COUNT(*) FILTER (WHERE bh.status = 'expired') as expired_backups,
  
  -- Sizes
  SUM(bh.file_size_bytes) FILTER (WHERE bh.status = 'completed') as total_size_bytes,
  AVG(bh.file_size_bytes) FILTER (WHERE bh.status = 'completed') as avg_size_bytes,
  MAX(bh.file_size_bytes) FILTER (WHERE bh.status = 'completed') as max_size_bytes,
  
  -- Durations
  AVG(bh.duration_seconds) FILTER (WHERE bh.status = 'completed') as avg_duration_seconds,
  MAX(bh.duration_seconds) FILTER (WHERE bh.status = 'completed') as max_duration_seconds,
  
  -- Success rate
  CASE 
    WHEN COUNT(bh.id) > 0 
    THEN ROUND(COUNT(*) FILTER (WHERE bh.status = 'completed') * 100.0 / COUNT(bh.id), 2)
    ELSE 0
  END as success_rate_percent,
  
  -- Latest backup info
  MAX(bh.started_at) FILTER (WHERE bh.status = 'completed') as last_successful_backup,
  MAX(bh.error_message) FILTER (WHERE bh.status = 'failed') as last_error
  
FROM backup_configs bc
LEFT JOIN backup_history bh ON bh.backup_config_id = bc.id
GROUP BY bc.id, bc.name, bc.backup_type, bc.is_active, bc.last_run_at, bc.next_run_at
ORDER BY bc.name;

-- Insert default backup configuration
INSERT INTO backup_configs (
  name,
  description,
  backup_type,
  schedule_enabled,
  schedule_interval_hours,
  retention_days,
  max_backups,
  compression_enabled,
  encryption_enabled,
  storage_location,
  is_active,
  created_by
)
SELECT 
  'daily_full_backup',
  'Daily full database backup',
  'full',
  true,
  24,
  30,
  10,
  true,
  true,
  'local',
  true,
  u.id
FROM auth.users u
WHERE email = 'admin@example.com'  -- Replace with actual admin user
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE backup_configs IS 'Backup configuration and scheduling';
COMMENT ON TABLE backup_history IS 'Backup execution history and files';
COMMENT ON TABLE restore_operations IS 'Database restore operations and progress';
COMMENT ON TABLE data_snapshots IS 'Point-in-time data snapshots for recovery';
COMMENT ON TABLE backup_notifications IS 'Backup notification delivery tracking';
COMMENT ON FUNCTION create_backup IS 'Create new backup job';
COMMENT ON FUNCTION cleanup_expired_backups IS 'Clean up expired backup files';
COMMENT ON FUNCTION calculate_next_backup_run IS 'Calculate next scheduled backup time';
COMMENT ON VIEW backup_statistics IS 'Backup configuration statistics and metrics';