-- Migration 029: Audit Log Retention and Cleanup
-- Automatic archiving and cleanup of old audit logs

-- Archived audit logs (compressed storage)
CREATE TABLE IF NOT EXISTS audit_log_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  month integer NOT NULL,
  data jsonb NOT NULL,
  record_count integer NOT NULL,
  compressed boolean DEFAULT false,
  archived_at timestamptz DEFAULT now(),
  UNIQUE(year, month)
);

CREATE INDEX idx_audit_archive_date ON audit_log_archive(year, month);

-- Retention policy configuration
CREATE TABLE IF NOT EXISTS retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text UNIQUE NOT NULL,
  retention_days integer NOT NULL,
  enabled boolean DEFAULT true,
  last_cleanup_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insert default retention policies
INSERT INTO retention_policies (table_name, retention_days, enabled) VALUES
  ('audit_log', 365, true),
  ('analytics_events', 180, true),
  ('sync_queue', 30, true),
  ('notifications', 90, true),
  ('chat_messages', 730, false),  -- Keep chat for 2 years
  ('station_logs', 365, true),
  ('file_versions', 730, true)
ON CONFLICT (table_name) DO NOTHING;

-- Function: Archive old audit logs
CREATE OR REPLACE FUNCTION archive_audit_logs(p_months_old integer DEFAULT 3)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  archive_date date;
  records_archived integer := 0;
  year_val integer;
  month_val integer;
  archived_data jsonb;
  record_count integer;
BEGIN
  archive_date := CURRENT_DATE - (p_months_old || ' months')::interval;
  
  -- Loop through each month that needs archiving
  FOR year_val, month_val IN 
    SELECT DISTINCT 
      EXTRACT(YEAR FROM created_at)::integer,
      EXTRACT(MONTH FROM created_at)::integer
    FROM audit_log
    WHERE created_at < archive_date
    ORDER BY 1, 2
  LOOP
    -- Aggregate logs for this month
    SELECT jsonb_agg(to_jsonb(al.*)), COUNT(*)
    INTO archived_data, record_count
    FROM audit_log al
    WHERE EXTRACT(YEAR FROM created_at) = year_val
      AND EXTRACT(MONTH FROM created_at) = month_val;
    
    IF record_count > 0 THEN
      -- Store in archive
      INSERT INTO audit_log_archive (year, month, data, record_count)
      VALUES (year_val, month_val, archived_data, record_count)
      ON CONFLICT (year, month) DO UPDATE
        SET data = EXCLUDED.data,
            record_count = EXCLUDED.record_count,
            archived_at = now();
      
      -- Delete archived records
      DELETE FROM audit_log
      WHERE EXTRACT(YEAR FROM created_at) = year_val
        AND EXTRACT(MONTH FROM created_at) = month_val;
      
      records_archived := records_archived + record_count;
    END IF;
  END LOOP;
  
  RETURN records_archived;
END;
$$;

-- Function: Generic cleanup based on retention policy
CREATE OR REPLACE FUNCTION cleanup_by_retention_policy(p_table_name text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  policy_record retention_policies%ROWTYPE;
  cleanup_date timestamptz;
  records_deleted integer := 0;
  sql_query text;
BEGIN
  -- Get retention policy
  SELECT * INTO policy_record
  FROM retention_policies
  WHERE table_name = p_table_name AND enabled = true;
  
  IF NOT FOUND THEN
    RAISE NOTICE 'No enabled retention policy found for table %', p_table_name;
    RETURN 0;
  END IF;
  
  cleanup_date := now() - (policy_record.retention_days || ' days')::interval;
  
  -- Build and execute dynamic SQL
  sql_query := format(
    'DELETE FROM %I WHERE created_at < $1',
    p_table_name
  );
  
  EXECUTE sql_query USING cleanup_date;
  GET DIAGNOSTICS records_deleted = ROW_COUNT;
  
  -- Update last cleanup timestamp
  UPDATE retention_policies
  SET last_cleanup_at = now(),
      updated_at = now()
  WHERE table_name = p_table_name;
  
  RETURN records_deleted;
END;
$$;

-- Function: Run all cleanup policies
CREATE OR REPLACE FUNCTION run_all_retention_cleanups()
RETURNS TABLE (
  table_name text,
  records_deleted integer,
  cleanup_date timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  policy_record retention_policies%ROWTYPE;
  deleted integer;
BEGIN
  FOR policy_record IN 
    SELECT * FROM retention_policies WHERE enabled = true
  LOOP
    deleted := cleanup_by_retention_policy(policy_record.table_name);
    
    table_name := policy_record.table_name;
    records_deleted := deleted;
    cleanup_date := now();
    
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Function: Retrieve archived audit logs
CREATE OR REPLACE FUNCTION get_archived_audit_logs(
  p_year integer,
  p_month integer DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  changes jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (elem->>'id')::uuid,
    (elem->>'user_id')::uuid,
    elem->>'action',
    elem->>'entity_type',
    (elem->>'entity_id')::uuid,
    (elem->'changes')::jsonb,
    (elem->>'created_at')::timestamptz
  FROM audit_log_archive,
       jsonb_array_elements(data) AS elem
  WHERE year = p_year
    AND (p_month IS NULL OR month = p_month)
  ORDER BY (elem->>'created_at')::timestamptz DESC;
END;
$$;

-- Scheduled job trigger (to be run daily via pg_cron or external scheduler)
CREATE OR REPLACE FUNCTION scheduled_retention_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cleanup_result record;
BEGIN
  -- Archive old audit logs first (older than 3 months)
  PERFORM archive_audit_logs(3);
  
  -- Run all retention policies
  FOR cleanup_result IN SELECT * FROM run_all_retention_cleanups()
  LOOP
    RAISE NOTICE 'Cleaned up % records from % at %', 
      cleanup_result.records_deleted, 
      cleanup_result.table_name, 
      cleanup_result.cleanup_date;
  END LOOP;
  
  -- Vacuum tables after cleanup
  VACUUM ANALYZE audit_log;
  VACUUM ANALYZE analytics_events;
  VACUUM ANALYZE sync_queue;
  VACUUM ANALYZE notifications;
  VACUUM ANALYZE station_logs;
END;
$$;

-- RLS Policies
ALTER TABLE audit_log_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view archived audit logs"
  ON audit_log_archive FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can manage retention policies"
  ON retention_policies FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Everyone can view retention policies"
  ON retention_policies FOR SELECT
  USING (true);

COMMENT ON TABLE audit_log_archive IS 'Compressed archive of old audit log records';
COMMENT ON TABLE retention_policies IS 'Configurable data retention policies per table';
COMMENT ON FUNCTION archive_audit_logs IS 'Archives audit logs older than specified months';
COMMENT ON FUNCTION run_all_retention_cleanups IS 'Executes all enabled retention cleanup policies';
