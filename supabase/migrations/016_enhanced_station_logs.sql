/**
 * Enhanced Station Logs Migration
 * Adds rich activity logging and timeline features
 */

-- Enhance station_logs table (if exists, or create new)
CREATE TABLE IF NOT EXISTS station_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relations
  order_id UUID NOT NULL REFERENCES draft_orders(id) ON DELETE CASCADE,
  
  -- Station details
  station TEXT NOT NULL,
  previous_stage TEXT,
  new_stage TEXT NOT NULL,
  
  -- Log details
  log_type TEXT NOT NULL DEFAULT 'stage_change' CHECK (
    log_type IN ('stage_change', 'comment', 'rework', 'quality_check', 'issue', 'note', 'photo', 'scan')
  ),
  
  -- Content
  title TEXT,
  message TEXT NOT NULL,
  details JSONB,
  
  -- Duration tracking
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_minutes INTEGER GENERATED ALWAYS AS (
    CASE 
      WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (completed_at - started_at)) / 60
      ELSE NULL
    END
  ) STORED,
  
  -- Quality metrics
  quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 5),
  passed_qc BOOLEAN,
  
  -- Issue tracking
  is_issue BOOLEAN DEFAULT false,
  issue_severity TEXT CHECK (issue_severity IN ('low', 'medium', 'high', 'critical')),
  issue_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  
  -- References
  attachment_ids UUID[],
  related_log_ids UUID[],
  
  -- Metadata
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  
  -- Tags for filtering
  tags TEXT[] DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_station_logs_order ON station_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_station_logs_station ON station_logs(station);
CREATE INDEX IF NOT EXISTS idx_station_logs_type ON station_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_station_logs_created ON station_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_station_logs_issue ON station_logs(is_issue) WHERE is_issue = true;
CREATE INDEX IF NOT EXISTS idx_station_logs_tags ON station_logs USING GIN(tags);

-- RLS
ALTER TABLE station_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view station logs"
  ON station_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create station logs"
  ON station_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own logs"
  ON station_logs FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

-- Function to create comprehensive log entry
CREATE OR REPLACE FUNCTION create_station_log(
  p_order_id UUID,
  p_station TEXT,
  p_log_type TEXT,
  p_message TEXT,
  p_new_stage TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_quality_score INTEGER DEFAULT NULL,
  p_is_issue BOOLEAN DEFAULT false,
  p_tags TEXT[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
  v_previous_stage TEXT;
BEGIN
  -- Get current stage
  SELECT stages->p_station INTO v_previous_stage
  FROM draft_orders
  WHERE id = p_order_id;
  
  -- Create log entry
  INSERT INTO station_logs (
    order_id,
    station,
    previous_stage,
    new_stage,
    log_type,
    message,
    details,
    quality_score,
    is_issue,
    tags,
    created_by
  )
  VALUES (
    p_order_id,
    p_station,
    v_previous_stage,
    COALESCE(p_new_stage, v_previous_stage),
    p_log_type,
    p_message,
    p_details,
    p_quality_score,
    p_is_issue,
    p_tags,
    auth.uid()
  )
  RETURNING id INTO v_log_id;
  
  -- Update order stage if changed
  IF p_new_stage IS NOT NULL AND p_new_stage != v_previous_stage THEN
    UPDATE draft_orders
    SET 
      stages = jsonb_set(
        COALESCE(stages, '{}'::jsonb),
        ARRAY[p_station],
        to_jsonb(p_new_stage)
      ),
      updated_at = NOW(),
      updated_by = auth.uid()
    WHERE id = p_order_id;
  END IF;
  
  -- Create notification if issue
  IF p_is_issue THEN
    INSERT INTO notifications (user_id, type, title, message, related_id)
    SELECT 
      unnest(assignees::text[])::uuid,
      'station_issue',
      'Issue at ' || p_station,
      p_message,
      v_log_id
    FROM draft_orders
    WHERE id = p_order_id;
  END IF;
  
  RETURN v_log_id;
END;
$$;

-- View for station timeline
CREATE OR REPLACE VIEW station_timeline AS
SELECT 
  sl.id,
  sl.order_id,
  do.po_number,
  do.title as order_title,
  sl.station,
  sl.log_type,
  sl.message,
  sl.previous_stage,
  sl.new_stage,
  sl.quality_score,
  sl.is_issue,
  sl.issue_severity,
  sl.issue_resolved,
  sl.duration_minutes,
  sl.created_at,
  u.email as created_by_email,
  sl.tags,
  COUNT(sa.id) as attachment_count
FROM station_logs sl
JOIN draft_orders do ON do.id = sl.order_id
JOIN auth.users u ON u.id = sl.created_by
LEFT JOIN station_attachments sa ON sa.id = ANY(sl.attachment_ids)
GROUP BY sl.id, do.po_number, do.title, u.email
ORDER BY sl.created_at DESC;

-- View for station performance metrics
CREATE OR REPLACE VIEW station_performance_metrics AS
SELECT 
  station,
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) as total_logs,
  COUNT(*) FILTER (WHERE log_type = 'stage_change') as stage_changes,
  COUNT(*) FILTER (WHERE is_issue = true) as issues_reported,
  COUNT(*) FILTER (WHERE is_issue = true AND issue_resolved = true) as issues_resolved,
  AVG(quality_score) as avg_quality_score,
  AVG(duration_minutes) FILTER (WHERE duration_minutes IS NOT NULL) as avg_duration_minutes,
  COUNT(DISTINCT order_id) as orders_processed
FROM station_logs
GROUP BY station, DATE_TRUNC('day', created_at)
ORDER BY date DESC, station;

COMMENT ON TABLE station_logs IS 'Comprehensive activity logging for all station operations';
COMMENT ON FUNCTION create_station_log IS 'Create log entry with automatic stage updates and notifications';
COMMENT ON VIEW station_timeline IS 'Timeline view of all station activities';
COMMENT ON VIEW station_performance_metrics IS 'Performance metrics by station and date';