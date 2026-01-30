/**
 * Export System Migration
 * Scheduled exports, templates, and export history
 */

-- Export templates table
CREATE TABLE IF NOT EXISTS export_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Template details
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL CHECK (
    template_type IN ('order_list', 'station_report', 'loading_schedule', 'analytics', 'custom')
  ),
  
  -- Export format
  format TEXT NOT NULL CHECK (format IN ('excel', 'pdf', 'csv', 'json')),
  
  -- Configuration
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  columns TEXT[] DEFAULT '{}',
  filters JSONB,
  
  -- Styling (for PDF/Excel)
  styling JSONB,
  
  -- Ownership
  created_by UUID NOT NULL REFERENCES auth.users(id),
  is_public BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  
  -- Usage
  use_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ
);

-- Export history table
CREATE TABLE IF NOT EXISTS export_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Export details
  export_type TEXT NOT NULL,
  format TEXT NOT NULL,
  template_id UUID REFERENCES export_templates(id) ON DELETE SET NULL,
  
  -- File details
  file_name TEXT NOT NULL,
  file_path TEXT, -- Storage path
  file_size INTEGER,
  
  -- Parameters used
  filters JSONB,
  date_range JSONB,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  ),
  error_message TEXT,
  
  -- Processing time
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  processing_time_ms INTEGER,
  
  -- Records
  records_count INTEGER,
  
  -- User
  created_by UUID NOT NULL REFERENCES auth.users(id),
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Scheduled exports table
CREATE TABLE IF NOT EXISTS scheduled_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Schedule details
  name TEXT NOT NULL,
  description TEXT,
  
  -- Template
  template_id UUID REFERENCES export_templates(id) ON DELETE CASCADE,
  
  -- Schedule configuration
  schedule_type TEXT NOT NULL CHECK (
    schedule_type IN ('daily', 'weekly', 'monthly', 'custom_cron')
  ),
  cron_expression TEXT,
  
  -- Time settings
  scheduled_time TIME,
  timezone TEXT DEFAULT 'UTC',
  
  -- Recipients
  recipients TEXT[] DEFAULT '{}', -- Email addresses
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  
  -- Metadata
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_export_templates_type ON export_templates(template_type);
CREATE INDEX idx_export_templates_format ON export_templates(format);
CREATE INDEX idx_export_templates_public ON export_templates(is_public) WHERE is_public = true;
CREATE INDEX idx_export_history_user ON export_history(created_by);
CREATE INDEX idx_export_history_created ON export_history(created_at DESC);
CREATE INDEX idx_export_history_status ON export_history(status);
CREATE INDEX idx_scheduled_exports_active ON scheduled_exports(is_active) WHERE is_active = true;
CREATE INDEX idx_scheduled_exports_next_run ON scheduled_exports(next_run_at) WHERE is_active = true;

-- RLS Policies
ALTER TABLE export_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own and public templates"
  ON export_templates FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() OR is_public = true);

CREATE POLICY "Users can create templates"
  ON export_templates FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update own templates"
  ON export_templates FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete own templates"
  ON export_templates FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can view own export history"
  ON export_history FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can create export history"
  ON export_history FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can view own scheduled exports"
  ON scheduled_exports FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can manage own scheduled exports"
  ON scheduled_exports FOR ALL
  TO authenticated
  USING (created_by = auth.uid());

-- Function to calculate next run time
CREATE OR REPLACE FUNCTION calculate_next_run(
  p_schedule_type TEXT,
  p_scheduled_time TIME,
  p_cron_expression TEXT DEFAULT NULL
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
DECLARE
  v_next_run TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  CASE p_schedule_type
    WHEN 'daily' THEN
      v_next_run := (CURRENT_DATE + p_scheduled_time)::TIMESTAMPTZ;
      IF v_next_run < v_now THEN
        v_next_run := v_next_run + INTERVAL '1 day';
      END IF;
      
    WHEN 'weekly' THEN
      v_next_run := (CURRENT_DATE + p_scheduled_time)::TIMESTAMPTZ;
      IF v_next_run < v_now THEN
        v_next_run := v_next_run + INTERVAL '7 days';
      END IF;
      
    WHEN 'monthly' THEN
      v_next_run := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' + p_scheduled_time)::TIMESTAMPTZ;
      
    ELSE
      -- Default to next day
      v_next_run := v_now + INTERVAL '1 day';
  END CASE;
  
  RETURN v_next_run;
END;
$$;

-- Trigger to calculate next_run_at
CREATE OR REPLACE FUNCTION update_scheduled_export_next_run()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.next_run_at := calculate_next_run(
    NEW.schedule_type,
    NEW.scheduled_time,
    NEW.cron_expression
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_scheduled_export_next_run
BEFORE INSERT OR UPDATE OF schedule_type, scheduled_time, cron_expression
ON scheduled_exports
FOR EACH ROW
EXECUTE FUNCTION update_scheduled_export_next_run();

-- View for export statistics
CREATE OR REPLACE VIEW export_statistics AS
SELECT 
  created_by,
  format,
  export_type,
  COUNT(*) as total_exports,
  COUNT(*) FILTER (WHERE status = 'completed') as successful_exports,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_exports,
  SUM(file_size) as total_size_bytes,
  AVG(processing_time_ms) as avg_processing_time_ms,
  SUM(records_count) as total_records_exported,
  MAX(created_at) as last_export_at
FROM export_history
GROUP BY created_by, format, export_type;

COMMENT ON TABLE export_templates IS 'Reusable export templates with formatting';
COMMENT ON TABLE export_history IS 'History of all exports with files';
COMMENT ON TABLE scheduled_exports IS 'Automated scheduled export jobs';
COMMENT ON FUNCTION calculate_next_run IS 'Calculate next scheduled export run time';
COMMENT ON VIEW export_statistics IS 'Export usage statistics by user and format';